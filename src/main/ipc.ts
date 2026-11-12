import { app, clipboard, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import type { AuthService } from "./auth";
import { AuthRequiredError } from "./auth";
import { MSX_ORIGIN, type MsxClient } from "./msx-client";
import type { PortfolioService } from "./portfolio-service";
import { IPC } from "../shared/ipc";
import type { OperationGate } from "./operation-gate";
import type { AiService } from "./ai-service";
import { aiConfigurationSchema, workiqConfigurationSchema } from "../shared/ai";
import { FACET_KEYS, SORT_KEYS, MAX_EXPORT_ROWS } from "../shared/milestones";
import { MilestoneExporter } from "./milestone-export";
import { filterIssue } from "../domain/milestone-view";

const idSchema = z.string().min(1).max(200);
const nullableText = z.string().max(4000).nullable();
const dateBound = z.union([z.literal(""), z.iso.date()]);
const facetValues = z.array(z.string().max(1000)).max(2000);
export const msxLinkSchema = z.url().refine(url => {
  if (!URL.canParse(url)) return false;
  const parsed = new URL(url);
  return parsed.protocol === "https:" && parsed.origin === MSX_ORIGIN;
}, "Only Microsoft Sales links are allowed.");
export const milestoneExportSchema = z.object({
  accountIds: z.array(idSchema).min(1).max(2000).refine(ids => new Set(ids).size === ids.length, "Duplicate portfolio accounts."),
  expectedIds: z.array(idSchema).min(1).max(MAX_EXPORT_ROWS).refine(ids => new Set(ids).size === ids.length, "Duplicate milestones."),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  view: z.object({
    filters: z.object({
      search: z.string().max(4000), status: facetValues, owner: facetValues, creator: facetValues, portfolio: facetValues,
      account: facetValues, commitment: facetValues, month: facetValues, solutionArea: facetValues,
      azureRegion: facetValues, workload: facetValues, dateFrom: dateBound, dateTo: dateBound,
      minMonthlyUse: z.string().max(100), maxMonthlyUse: z.string().max(100),
    }).strict().refine(filters => !filterIssue(filters), "Invalid milestone filter bounds."),
    groupBy: z.array(z.enum(FACET_KEYS)).max(3).refine(keys => new Set(keys).size === keys.length, "Duplicate grouping levels."),
    sortKey: z.enum(SORT_KEYS), sortDirection: z.enum(["asc", "desc"]),
  }).strict(),
}).strict();

const settingsSchema = z.object({
  scope: z.object({
    label: z.string().trim().min(1).max(100),
    dateFrom: z.iso.date(),
    dateTo: z.iso.date(),
    excludedStatusValues: z.array(z.number().int()).max(100),
    excludedStatusLabels: z.array(z.string().max(100)).max(100),
  }),
  retentionSnapshots: z.number().int().min(1).max(500),
  privacyAccepted: z.boolean(),
  territoryIds: z.array(z.guid()).max(1000),
  onboardingComplete: z.boolean(),
  teamEnabled: z.boolean(),
  podsEnabled: z.boolean(),
});

const userSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(300),
  email: z.string().max(500).nullable(),
  title: z.string().max(500).nullable(),
  disabled: z.boolean(),
});

const teamPersonSchema = z.object({
  id: idSchema,
  msxUserId: z.string().max(200).nullable(),
  name: z.string().trim().min(1).max(300),
  email: z.string().max(500).nullable(),
  title: z.string().max(500).nullable(),
  role: z.string().max(300).nullable(),
  manager: z.string().max(300).nullable(),
  level: z.number().int().min(1).max(100).nullable(),
  notes: nullableText,
  aliases: z
    .array(
      z.object({
        ownerId: z.string().max(200).nullable(),
        ownerName: z.string().trim().min(1).max(300),
      }),
    )
    .max(100),
  createdAt: z.string().min(1),
});

const podSchema = z.object({
  id: z.string().max(200),
  name: z.string().trim().min(1).max(200),
  notes: nullableText,
  accountIds: z.array(idSchema).max(200),
  people: z
    .array(
      z.object({
        personId: idSchema,
        role: z.enum(["CSAM", "Durable CSA", "CAIP CSA"]),
        percentage: z.number().min(0).max(100).nullable(),
        notes: nullableText,
      }),
    )
    .max(1000),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function registerIpc(
  service: PortfolioService,
  auth: AuthService,
  msx: MsxClient,
  dataPath: string,
  gate: OperationGate,
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
  ai: AiService,
  exporter = new MilestoneExporter(ids => service.getMilestones(ids), () => app.getPath("downloads"), path => shell.showItemInFolder(path)),
): void {
  function handle(channel: string, handler: (input: unknown) => unknown): void {
    ipcMain.handle(channel, (event, input: unknown) => {
      if (!isTrusted(event)) throw new Error("Untrusted application request.");
      return gate.run(async () => {
        try { return await handler(input); } catch (error) {
          if (error instanceof AuthRequiredError) event.sender.send(IPC.authRequired);
          throw error;
        }
      });
    });
  }
  function register<T>(channel: string, schema: z.ZodType<T>, handler: (input: T) => unknown): void {
    handle(channel, (input) => handler(schema.parse(input)));
  }
  handle(IPC.bootstrap, () => service.bootstrap(dataPath));
  handle(IPC.aiConnections, () => ai.getState());
  register(IPC.aiTest, aiConfigurationSchema, (config) => ai.testAi(config));
  register(IPC.workiqTest, workiqConfigurationSchema, (config) => ai.testWorkiq(config));
  handle(IPC.aiCancel, () => ai.cancel());
  ipcMain.handle(IPC.resetSetup, async (event) => {
    if (!isTrusted(event)) throw new Error("Untrusted application request.");
    if (!gate.tryLock("Setup is being reset. Wait for the first-run screen.")) {
      throw new Error("Finish active work or updates before resetting setup.");
    }
    try {
      await ai.reset();
      return await service.resetSetup(dataPath);
    } finally {
      gate.unlock();
    }
  });
  handle(IPC.signIn, async () => {
    await auth.signIn();
    return auth.getState(await msx.getMyUserId());
  });
  handle(IPC.signOut, async () => {
    await ai.disconnect();
    const state = await auth.signOut();
    service.profiles.clear();
    service.territoryImport.clear();
    return state;
  });
  handle(IPC.restoreSession, () => auth.getState());
  handle(IPC.refreshProfile, () => service.profiles.refresh());
  handle(IPC.cancelSignIn, () => auth.cancelSignIn());
  handle(IPC.getSettings, () => service.getSettings());
  handle(IPC.listTerritories, () => msx.listTerritories());
  register(IPC.previewTerritoryImport, z.array(z.guid()).min(1).max(1000), (ids) => service.territoryImport.preview(ids));
  ipcMain.handle(IPC.importTerritories, async (event, input: unknown) => {
    if (!isTrusted(event)) throw new Error("Untrusted application request.");
    const id = z.uuid().parse(input);
    if (!gate.tryLock("A territory import is running. Wait for it to finish.")) {
      throw new Error("Finish active work or updates before importing territories.");
    }
    try {
      return await service.territoryImport.import(id, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send(IPC.territoryImportProgress, progress);
      });
    } catch (error) {
      if (error instanceof AuthRequiredError) event.sender.send(IPC.authRequired);
      throw error;
    } finally { gate.unlock(); }
  });
  register(IPC.updateSettings, settingsSchema, (settings) =>
    service.updateSettings(settings),
  );
  register(IPC.searchAccounts, z.string().trim().min(3).max(200), (term) =>
    service.searchAccounts(term),
  );
  register(IPC.previewAccount, idSchema, (accountId) =>
    service.previewAccount(accountId),
  );
  register(IPC.addAccount, idSchema, (accountId) => service.addAccount(accountId));
  register(
    IPC.removeAccount,
    z.object({ accountId: idSchema, deleteHistory: z.boolean() }),
    ({ accountId, deleteHistory }) => service.removeAccount(accountId, deleteHistory),
  );
  handle(IPC.getOverview, () => service.getOverview());
  handle(IPC.getMilestones, () => service.getMilestones());
  register(IPC.exportMilestones, milestoneExportSchema, request => exporter.export(request));
  handle(IPC.refreshAccountTerritories, () => service.refreshAccountTerritories());
  register(IPC.getAccountState, idSchema, (accountId) =>
    service.getAccountState(accountId),
  );
  register(IPC.fetchAccounts, z.string().max(200).optional(), (accountId) =>
    service.fetchAccounts(accountId),
  );
  register(IPC.markReviewed, idSchema, (accountId) =>
    service.markReviewed(accountId),
  );
  register(IPC.searchUsers, z.string().trim().min(2).max(200), (term) =>
    service.searchUsers(term),
  );
  register(IPC.addTeamPerson, userSchema, (user) => service.addTeamPerson(user));
  register(IPC.saveTeamPerson, teamPersonSchema, (person) =>
    service.saveTeamPerson(person),
  );
  register(IPC.removeTeamPerson, idSchema, (personId) =>
    service.removeTeamPerson(personId),
  );
  handle(IPC.listTeam, () => service.listTeam());
  register(IPC.savePod, podSchema, (pod) => service.savePod(pod));
  register(IPC.removePod, idSchema, (podId) => service.removePod(podId));
  handle(IPC.listPods, () => service.listPods());
  register(IPC.copyMsxLink, msxLinkSchema, url => clipboard.writeText(url));
  register(IPC.openExternal, msxLinkSchema, async (url) => {
    await shell.openExternal(new URL(url).toString());
  });
}

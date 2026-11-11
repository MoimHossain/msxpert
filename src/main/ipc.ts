import { ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import type { AuthService } from "./auth";
import { AuthRequiredError } from "./auth";
import { MSX_ORIGIN, type MsxClient } from "./msx-client";
import type { PortfolioService } from "./portfolio-service";
import { IPC } from "../shared/ipc";
import type { OperationGate } from "./operation-gate";

const idSchema = z.string().min(1).max(200);
const nullableText = z.string().max(4000).nullable();

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
  ipcMain.handle(IPC.resetSetup, async (event) => {
    if (!isTrusted(event)) throw new Error("Untrusted application request.");
    if (!gate.tryLock("Setup is being reset. Wait for the first-run screen.")) {
      throw new Error("Finish active work or updates before resetting setup.");
    }
    try {
      return await service.resetSetup(dataPath);
    } finally {
      gate.unlock();
    }
  });
  handle(IPC.signIn, async () => {
    await auth.signIn();
    return auth.getState(await msx.getMyUserId());
  });
  handle(IPC.signOut, () => auth.signOut());
  handle(IPC.cancelSignIn, () => auth.cancelSignIn());
  handle(IPC.getSettings, () => service.getSettings());
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
  register(IPC.openExternal, z.url(), async (url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.origin !== MSX_ORIGIN) {
      throw new Error("Only Microsoft Sales links can be opened.");
    }
    await shell.openExternal(parsed.toString());
  });
}

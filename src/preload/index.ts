import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { RestartRequest, UpdateState } from "../shared/updates";
import type { FetchProgress } from "../shared/fetch";
import type { OrgProgress } from "../shared/organization";
import type { AcrProgress } from "../shared/acr";
import type {
  AppSettings,
  DesktopApi,
  Pod,
  SystemUserSearchResult,
  TeamPerson,
  TerritoryImportProgress,
} from "../shared/types";

// Sandboxed preloads cannot require relative modules at runtime, so these
// channel constants stay self-contained in the compiled preload.
const IPC = {
  acrState: "acr:state",
  acrConnect: "acr:connect",
  acrDisconnect: "acr:disconnect",
  acrFetch: "acr:fetch",
  acrCancel: "acr:cancel",
  acrProgress: "acr:progress",
  updateState: "updates:state",
  updateCheck: "updates:check",
  updateDownload: "updates:download",
  updateCancel: "updates:cancel",
  updateInstall: "updates:install",
  updateOpenReleases: "updates:open-releases",
  updateChanged: "updates:changed",
  updatePrepareRestart: "updates:prepare-restart",
  updateConfirmRestart: "updates:confirm-restart",
  bootstrap: "app:bootstrap",
  resetSetup: "app:reset-setup",
  signIn: "auth:sign-in",
  cancelSignIn: "auth:cancel-sign-in",
  authRequired: "auth:required",
  restoreSession: "auth:restore",
  refreshProfile: "profile:refresh",
  signOut: "auth:sign-out",
  getSettings: "settings:get",
  updateSettings: "settings:update",
  aiConnections: "ai:connections",
  aiTest: "ai:test",
  workiqTest: "ai:workiq-test",
  aiCancel: "ai:cancel",
  organizationState: "organization:state",
  organizationImport: "organization:import",
  organizationRefreshLinks: "organization:refresh-links",
  organizationDiscover: "organization:discover",
  organizationCancel: "organization:cancel",
  organizationSave: "organization:save",
  organizationRemove: "organization:remove",
  organizationProgress: "organization:progress",
  organizationChanged: "organization:changed",
  listTerritories: "territories:list",
  previewTerritoryImport: "territories:preview",
  importTerritories: "territories:import",
  territoryImportProgress: "territories:progress",
  searchAccounts: "accounts:search",
  previewAccount: "accounts:preview",
  addAccount: "accounts:add",
  removeAccount: "accounts:remove",
  getOverview: "portfolio:overview",
  getMilestones: "milestones:list",
  getHygieneSnapshot: "hygiene:snapshot",
  exportMilestones: "milestones:export",
  refreshAccountTerritories: "portfolio:refresh-territories",
  getAccountState: "portfolio:account-state",
  fetchAccounts: "portfolio:fetch",
  fetchProgress: "portfolio:fetch-progress",
  getFetchProgress: "portfolio:fetch-state",
  historyRun: "history:run",
  historyIndex: "history:index",
  historyDay: "history:day",
  markReviewed: "portfolio:mark-reviewed",
  searchUsers: "team:search-users",
  addTeamPerson: "team:add",
  saveTeamPerson: "team:save",
  removeTeamPerson: "team:remove",
  listTeam: "team:list",
  savePod: "pods:save",
  removePod: "pods:remove",
  listPods: "pods:list",
  openExternal: "app:open-external",
  copyMsxLink: "msx:copy-link",
} as const;

const api: DesktopApi = {
  getAcrState: () => ipcRenderer.invoke(IPC.acrState),
  connectPowerBi: () => ipcRenderer.invoke(IPC.acrConnect),
  disconnectPowerBi: () => ipcRenderer.invoke(IPC.acrDisconnect),
  fetchAcr: () => ipcRenderer.invoke(IPC.acrFetch),
  cancelAcr: () => ipcRenderer.invoke(IPC.acrCancel),
  onAcrProgress: listener => {
    const handler = (_event: IpcRendererEvent, progress: AcrProgress) => listener(progress);
    ipcRenderer.on(IPC.acrProgress, handler);
    return () => { ipcRenderer.removeListener(IPC.acrProgress, handler); };
  },
  getHygieneSnapshot: () => ipcRenderer.invoke(IPC.getHygieneSnapshot),
  getOrganization: () => ipcRenderer.invoke(IPC.organizationState),
  importOrganizationCatalog: () => ipcRenderer.invoke(IPC.organizationImport),
  refreshOrganizationLinks: () => ipcRenderer.invoke(IPC.organizationRefreshLinks),
  discoverOrganization: mode => ipcRenderer.invoke(IPC.organizationDiscover, mode),
  cancelOrganization: () => ipcRenderer.invoke(IPC.organizationCancel),
  saveOrganizationPerson: input => ipcRenderer.invoke(IPC.organizationSave, input),
  removeOrganizationPerson: id => ipcRenderer.invoke(IPC.organizationRemove, id),
  onOrganizationProgress: listener => {
    const handler = (_event: IpcRendererEvent, progress: OrgProgress) => listener(progress);
    ipcRenderer.on(IPC.organizationProgress, handler);
    return () => { ipcRenderer.removeListener(IPC.organizationProgress, handler); };
  },
  onOrganizationChanged: listener => {
    const handler = () => listener();
    ipcRenderer.on(IPC.organizationChanged, handler);
    return () => { ipcRenderer.removeListener(IPC.organizationChanged, handler); };
  },
  getAiConnections: () => ipcRenderer.invoke(IPC.aiConnections),
  testAiAccess: (config) => ipcRenderer.invoke(IPC.aiTest, config),
  testWorkiqAccess: (config) => ipcRenderer.invoke(IPC.workiqTest, config),
  cancelAiTest: () => ipcRenderer.invoke(IPC.aiCancel),
  getUpdateState: () => ipcRenderer.invoke(IPC.updateState),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updateCheck),
  downloadAndRestart: (version) => ipcRenderer.invoke(IPC.updateDownload, version),
  cancelUpdateDownload: () => ipcRenderer.invoke(IPC.updateCancel),
  restartToUpdate: (version) => ipcRenderer.invoke(IPC.updateInstall, version),
  openReleases: () => ipcRenderer.invoke(IPC.updateOpenReleases),
  onUpdateState: (listener) => {
    const handler = (_event: IpcRendererEvent, state: UpdateState) => listener(state);
    ipcRenderer.on(IPC.updateChanged, handler);
    return () => { ipcRenderer.removeListener(IPC.updateChanged, handler); };
  },
  onUpdateRestart: (listener) => {
    const handler = (_event: IpcRendererEvent, request: RestartRequest) => listener(request);
    ipcRenderer.on(IPC.updatePrepareRestart, handler);
    return () => { ipcRenderer.removeListener(IPC.updatePrepareRestart, handler); };
  },
  confirmUpdateRestart: (id, safe) => ipcRenderer.invoke(IPC.updateConfirmRestart, { id, safe }),
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  resetSetup: () => ipcRenderer.invoke(IPC.resetSetup),
  signIn: () => ipcRenderer.invoke(IPC.signIn),
  cancelSignIn: () => ipcRenderer.invoke(IPC.cancelSignIn),
  restoreSession: () => ipcRenderer.invoke(IPC.restoreSession),
  refreshProfile: () => ipcRenderer.invoke(IPC.refreshProfile),
  onAuthRequired: (listener) => {
    const handler = () => listener();
    ipcRenderer.on(IPC.authRequired, handler);
    return () => { ipcRenderer.removeListener(IPC.authRequired, handler); };
  },
  signOut: () => ipcRenderer.invoke(IPC.signOut),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  listTerritories: () => ipcRenderer.invoke(IPC.listTerritories),
  previewTerritoryImport: (ids) => ipcRenderer.invoke(IPC.previewTerritoryImport, ids),
  importTerritories: (id) => ipcRenderer.invoke(IPC.importTerritories, id),
  onTerritoryImportProgress: (listener) => {
    const handler = (_event: IpcRendererEvent, progress: TerritoryImportProgress) => listener(progress);
    ipcRenderer.on(IPC.territoryImportProgress, handler);
    return () => { ipcRenderer.removeListener(IPC.territoryImportProgress, handler); };
  },
  updateSettings: (settings: AppSettings) =>
    ipcRenderer.invoke(IPC.updateSettings, settings),
  searchAccounts: (term: string) =>
    ipcRenderer.invoke(IPC.searchAccounts, term),
  previewAccount: (accountId: string) =>
    ipcRenderer.invoke(IPC.previewAccount, accountId),
  addAccount: (accountId: string) =>
    ipcRenderer.invoke(IPC.addAccount, accountId),
  removeAccount: (accountId: string, deleteHistory: boolean) =>
    ipcRenderer.invoke(IPC.removeAccount, { accountId, deleteHistory }),
  getOverview: () => ipcRenderer.invoke(IPC.getOverview),
  getMilestones: () => ipcRenderer.invoke(IPC.getMilestones),
  exportMilestones: (request) => ipcRenderer.invoke(IPC.exportMilestones, request),
  refreshAccountTerritories: () => ipcRenderer.invoke(IPC.refreshAccountTerritories),
  getAccountState: (accountId: string) =>
    ipcRenderer.invoke(IPC.getAccountState, accountId),
  fetchAccounts: (accountId?: string) =>
    ipcRenderer.invoke(IPC.fetchAccounts, accountId),
  getFetchProgress: () => ipcRenderer.invoke(IPC.getFetchProgress),
  onFetchProgress: listener => {
    const handler = (_event: IpcRendererEvent, progress: FetchProgress) => listener(progress);
    ipcRenderer.on(IPC.fetchProgress, handler);
    return () => { ipcRenderer.removeListener(IPC.fetchProgress, handler); };
  },
  getHistoryRun: selection => ipcRenderer.invoke(IPC.historyRun, selection),
  getHistoryIndex: () => ipcRenderer.invoke(IPC.historyIndex),
  getHistoryDay: date => ipcRenderer.invoke(IPC.historyDay, date),
  markReviewed: (accountId: string) =>
    ipcRenderer.invoke(IPC.markReviewed, accountId),
  searchUsers: (term: string) => ipcRenderer.invoke(IPC.searchUsers, term),
  addTeamPerson: (user: SystemUserSearchResult) =>
    ipcRenderer.invoke(IPC.addTeamPerson, user),
  saveTeamPerson: (person: TeamPerson) =>
    ipcRenderer.invoke(IPC.saveTeamPerson, person),
  removeTeamPerson: (personId: string) =>
    ipcRenderer.invoke(IPC.removeTeamPerson, personId),
  listTeam: () => ipcRenderer.invoke(IPC.listTeam),
  savePod: (pod: Pod) => ipcRenderer.invoke(IPC.savePod, pod),
  removePod: (podId: string) => ipcRenderer.invoke(IPC.removePod, podId),
  listPods: () => ipcRenderer.invoke(IPC.listPods),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.openExternal, url),
  copyMsxLink: (url: string) => ipcRenderer.invoke(IPC.copyMsxLink, url),
};

contextBridge.exposeInMainWorld("desktop", Object.freeze(api));

import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { RestartRequest, UpdateState } from "../shared/updates";
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
  listTerritories: "territories:list",
  previewTerritoryImport: "territories:preview",
  importTerritories: "territories:import",
  territoryImportProgress: "territories:progress",
  searchAccounts: "accounts:search",
  previewAccount: "accounts:preview",
  addAccount: "accounts:add",
  removeAccount: "accounts:remove",
  getOverview: "portfolio:overview",
  refreshAccountTerritories: "portfolio:refresh-territories",
  getAccountState: "portfolio:account-state",
  fetchAccounts: "portfolio:fetch",
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
} as const;

const api: DesktopApi = {
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
  refreshAccountTerritories: () => ipcRenderer.invoke(IPC.refreshAccountTerritories),
  getAccountState: (accountId: string) =>
    ipcRenderer.invoke(IPC.getAccountState, accountId),
  fetchAccounts: (accountId?: string) =>
    ipcRenderer.invoke(IPC.fetchAccounts, accountId),
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
};

contextBridge.exposeInMainWorld("desktop", Object.freeze(api));

import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  DesktopApi,
  Pod,
  SystemUserSearchResult,
  TeamPerson,
} from "../shared/types";

// Sandboxed preloads cannot require relative modules at runtime, so these
// channel constants stay self-contained in the compiled preload.
const IPC = {
  bootstrap: "app:bootstrap",
  signIn: "auth:sign-in",
  signOut: "auth:sign-out",
  getSettings: "settings:get",
  updateSettings: "settings:update",
  searchAccounts: "accounts:search",
  previewAccount: "accounts:preview",
  addAccount: "accounts:add",
  removeAccount: "accounts:remove",
  getOverview: "portfolio:overview",
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
  bootstrap: () => ipcRenderer.invoke(IPC.bootstrap),
  signIn: () => ipcRenderer.invoke(IPC.signIn),
  signOut: () => ipcRenderer.invoke(IPC.signOut),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
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

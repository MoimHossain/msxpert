import type { MilestoneDataset, MilestoneExportRequest, MilestoneExportResult } from "./milestones";

export type IsoDate = string;
export type IsoTimestamp = string;

export interface AuthState {
  signedIn: boolean;
  name: string | null;
  username: string | null;
  userId: string | null;
  message?: string | null;
  checking?: boolean;
}

export interface UserProfile {
  id: string;
  displayName: string | null;
  jobTitle: string | null;
  email: string | null;
  department: string | null;
  officeLocation: string | null;
  photoDataUrl: string | null;
  updatedAt: string;
}

export interface ScopeSettings {
  label: string;
  dateFrom: IsoDate;
  dateTo: IsoDate;
  excludedStatusValues: number[];
  excludedStatusLabels: string[];
}

export interface AppSettings {
  scope: ScopeSettings;
  retentionSnapshots: number;
  privacyAccepted: boolean;
  territoryIds: string[];
  onboardingComplete: boolean;
  teamEnabled: boolean;
  podsEnabled: boolean;
}

export interface SalesTerritory {
  id: string;
  name: string;
  accountTeamUnitGroup: string | null;
  salesUnit: string | null;
  salesGroup: string | null;
  fiscalYear: string | null;
}

export interface TerritoryImportAccount {
  id: string;
  name: string;
  tpid: string;
  alreadyPresent: boolean;
}

export interface TerritoryImportIssue {
  id: string;
  name: string;
  message: string;
}

export interface TerritoryImportPreview {
  id: string;
  territories: SalesTerritory[];
  accounts: TerritoryImportAccount[];
  alreadyPresent: number;
  unresolved: TerritoryImportIssue[];
}

export interface TerritoryImportProgress {
  completed: number;
  total: number;
  added: number;
  skipped: number;
  failed: number;
}

export interface TerritoryImportResult {
  added: number;
  skipped: number;
  failures: TerritoryImportIssue[];
}

export interface AccountSearchResult {
  id: string;
  name: string;
  tpid: string | null;
  parentingLevel: string | null;
  country: string | null;
  territory?: AccountTerritory | null;
}

export interface AccountTerritory {
  id: string;
  name: string;
}

export interface AccountTreeNode {
  id: string;
  name: string;
  tpid: string;
  parentingLevel: string | null;
  country: string | null;
  url: string;
  territory?: AccountTerritory | null;
}

export interface AccountPreview {
  selected: AccountSearchResult;
  topParent: AccountSearchResult;
  tree: AccountTreeNode[];
  alreadyTracked: boolean;
  milestoneCount: number;
}

export interface PortfolioAccount {
  id: string;
  tpid: string;
  name: string;
  msxAccountId: string;
  country: string | null;
  createdAt: IsoTimestamp;
  territory?: AccountTerritory | null;
}

export interface NormalizedMilestone {
  hygiene?: import("./hygiene").HygieneEnrichment;
  id: string;
  number: string | null;
  name: string | null;
  date: IsoDate | null;
  status: string | null;
  statusValue: number | null;
  statusReason: string | null;
  commitment: string | null;
  category: string | null;
  workload: string | null;
  milestoneWorkload: string | null;
  solutionArea: string | null;
  helpNeeded: string | null;
  azureRegion: string | null;
  azureCapacityType: string | null;
  monthlyUse: number | null;
  monthlyUseFormatted: string | null;
  nonRecurringMonths: number | null;
  forecastComments: string | null;
  forecastCommentsModifiedOn: string | null;
  milestoneComments: string | null;
  ownerId: string | null;
  ownerEntityType?: string | null;
  ownerName: string | null;
  accountId: string | null;
  accountName: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  opportunityUrl: string | null;
  createdOn: string | null;
  createdById: string | null;
  createdByName: string | null;
  modifiedOn: string | null;
  modifiedByName: string | null;
  versionNumber: string | null;
  url: string;
}

export interface MilestoneRow extends NormalizedMilestone {
  accountUrl?: string;
  ownerUrl?: string;
  portfolioAccountId: string;
  portfolioAccountName: string;
  portfolioTpid: string;
  creatorOrg?: import("./organization").OrgUnit;
  ownerOrg?: import("./organization").OrgUnit;
  creatorOrgBasis?: string;
  ownerOrgBasis?: string;
  creatorOrgCheckedAt?: string;
  ownerOrgCheckedAt?: string;
}

export interface GoneReason {
  reason: "status" | "date" | "account" | "unavailable" | "unknown";
  summary: string;
  causes: string[];
  current?: {
    date: string | null;
    status: string | null;
    statusValue: number | null;
    statusReason: string | null;
    ownerName: string | null;
    accountName: string | null;
    modifiedOn: string | null;
  };
}

export interface MilestoneSummary {
  id: string;
  number: string | null;
  name: string | null;
  date: string | null;
  status: string | null;
  commitment: string | null;
  monthlyUse: number | null;
  ownerName: string | null;
  accountName: string | null;
  url: string;
  gone?: GoneReason;
  createdByName?: string | null;
  monthlyUseFormatted?: string | null;
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
  hops?: number;
}

export interface ModifiedMilestone extends MilestoneSummary {
  fields: FieldChange[];
  unwatchedOnly?: boolean;
}

export interface ChangeSet {
  added: MilestoneSummary[];
  modified: ModifiedMilestone[];
  disappeared: MilestoneSummary[];
  churn: ModifiedMilestone[];
}

export interface ChangeDocument extends Omit<ChangeSet, "churn"> {
  runId: string;
  generatedAt: IsoTimestamp;
  baseline: boolean;
  previousRunId: string | null;
  account: {
    id: string;
    name: string;
    tpid: string;
  };
  filter: {
    dateFrom: string;
    dateTo: string;
    windowLabel: string;
    excludedStatuses: string[];
    accountIdCount: number;
  };
  counts: {
    added: number;
    modified: number;
    unwatchedOnly: number;
    disappeared: number;
    total: number;
  };
}

export interface RunEntry {
  runId: string;
  at: IsoTimestamp;
  durationMs: number;
  ok: boolean;
  baseline?: boolean;
  counts?: ChangeDocument["counts"];
  error?: string;
}

export interface AccountOverview extends PortfolioAccount {
  hasData: boolean;
  milestones: number;
  accountRecords: number;
  onTrack: number;
  atRisk: number;
  blocked: number;
  committed: number;
  uncommitted: number;
  monthlyUse: number;
  owners: number;
  pendingChanges: number;
  lastRun: RunEntry | null;
}

export interface PortfolioOverview {
  accounts: AccountOverview[];
  totals: {
    milestones: number;
    atRisk: number;
    blocked: number;
    monthlyUse: number;
    pendingChanges: number;
  };
  scope: ScopeSettings;
}

export interface AccountState {
  account: PortfolioAccount;
  accountTree: AccountTreeNode[];
  scope: ScopeSettings;
  milestones: MilestoneRow[];
  runs: RunEntry[];
  since: ChangeSet & {
    runCount: number;
    fromRunId: string | null;
    toRunId: string | null;
  };
  reviewedThrough: string | null;
  hasData: boolean;
}

export interface FetchResult {
  ok: boolean;
  accounts: Array<{
    accountId: string;
    name: string;
    ok: boolean;
    runId?: string;
    baseline?: boolean;
    counts?: ChangeDocument["counts"];
    error?: string;
  }>;
}

export interface SystemUserSearchResult {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  disabled: boolean;
}

export interface TeamPerson {
  id: string;
  msxUserId: string | null;
  name: string;
  email: string | null;
  title: string | null;
  role: string | null;
  manager: string | null;
  level: number | null;
  notes: string | null;
  aliases: Array<{ ownerId: string | null; ownerName: string }>;
  createdAt: IsoTimestamp;
}

export type PodRole = "CSAM" | "Durable CSA" | "CAIP CSA";

export interface PodPersonAssignment {
  personId: string;
  role: PodRole;
  percentage: number | null;
  notes: string | null;
}

export interface Pod {
  id: string;
  name: string;
  notes: string | null;
  accountIds: string[];
  people: PodPersonAssignment[];
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface PodSummary extends Pod {
  accountNames: string[];
  peopleNames: Array<{ name: string; role: PodRole }>;
  milestones: number;
  onTrack: number;
  atRisk: number;
  blocked: number;
  monthlyUse: number;
  owners: number;
}

export interface BootstrapState {
  auth: AuthState;
  profile: UserProfile | null;
  settings: AppSettings;
  overview: PortfolioOverview;
  team: TeamPerson[];
  pods: PodSummary[];
  dataPath: string;
  version: string;
}

export interface DesktopApi {
  getOrganization(): Promise<import("./organization").OrgState>;
  importOrganizationCatalog(): Promise<import("./organization").OrgImportResult | null>;
  refreshOrganizationLinks(): Promise<import("./organization").OrgState>;
  discoverOrganization(mode?: import("./organization").OrgDiscoveryMode): Promise<import("./organization").OrgState>;
  cancelOrganization(): Promise<import("./organization").OrgState>;
  saveOrganizationPerson(input: import("./organization").OrgPersonInput): Promise<import("./organization").OrgState>;
  removeOrganizationPerson(id: string): Promise<import("./organization").OrgState>;
  onOrganizationProgress(listener: (progress: import("./organization").OrgProgress) => void): () => void;
  onOrganizationChanged(listener: () => void): () => void;
  getAiConnections(): Promise<import("./ai").AiConnectionsState>;
  testAiAccess(config: import("./ai").AiConfiguration): Promise<import("./ai").AiConnectionsState>;
  testWorkiqAccess(config: import("./ai").WorkiqConfiguration): Promise<import("./ai").AiConnectionsState>;
  cancelAiTest(): Promise<void>;
  getUpdateState(): Promise<import("./updates").UpdateState>;
  checkForUpdates(): Promise<import("./updates").UpdateState>;
  downloadAndRestart(version: string): Promise<void>;
  cancelUpdateDownload(): Promise<void>;
  restartToUpdate(version: string): Promise<void>;
  openReleases(): Promise<void>;
  onUpdateState(listener: (state: import("./updates").UpdateState) => void): () => void;
  onUpdateRestart(listener: (request: import("./updates").RestartRequest) => void): () => void;
  confirmUpdateRestart(id: string, safe: boolean): Promise<void>;
  bootstrap(): Promise<BootstrapState>;
  resetSetup(): Promise<BootstrapState>;
  signIn(): Promise<AuthState>;
  cancelSignIn(): Promise<void>;
  onAuthRequired(listener: () => void): () => void;
  restoreSession(): Promise<AuthState>;
  refreshProfile(): Promise<UserProfile>;
  signOut(): Promise<AuthState>;
  getSettings(): Promise<AppSettings>;
  updateSettings(settings: AppSettings): Promise<AppSettings>;
  listTerritories(): Promise<SalesTerritory[]>;
  previewTerritoryImport(territoryIds: string[]): Promise<TerritoryImportPreview>;
  importTerritories(previewId: string): Promise<TerritoryImportResult>;
  onTerritoryImportProgress(listener: (progress: TerritoryImportProgress) => void): () => void;
  searchAccounts(term: string): Promise<AccountSearchResult[]>;
  previewAccount(accountId: string): Promise<AccountPreview>;
  addAccount(accountId: string): Promise<PortfolioAccount>;
  removeAccount(accountId: string, deleteHistory: boolean): Promise<void>;
  getOverview(): Promise<PortfolioOverview>;
  getMilestones(): Promise<MilestoneDataset>;
  getHygieneSnapshot(): Promise<import("./hygiene").HygieneSnapshot>;
  exportMilestones(request: MilestoneExportRequest): Promise<MilestoneExportResult>;
  refreshAccountTerritories(): Promise<void>;
  getAccountState(accountId: string): Promise<AccountState>;
  fetchAccounts(accountId?: string): Promise<FetchResult>;
  getFetchProgress(): Promise<import("./fetch").FetchProgress | null>;
  onFetchProgress(listener: (progress: import("./fetch").FetchProgress) => void): () => void;
  getHistoryRun(selection: import("./history").HistorySelection): Promise<import("./history").HistoryRun>;
  getHistoryIndex(): Promise<import("./history").HistoryIndex>;
  getHistoryDay(date: string): Promise<import("./history").HistoryEvent[]>;
  markReviewed(accountId: string): Promise<AccountState>;
  searchUsers(term: string): Promise<SystemUserSearchResult[]>;
  addTeamPerson(user: SystemUserSearchResult): Promise<TeamPerson>;
  saveTeamPerson(person: TeamPerson): Promise<TeamPerson>;
  removeTeamPerson(personId: string): Promise<void>;
  listTeam(): Promise<TeamPerson[]>;
  savePod(pod: Pod): Promise<Pod>;
  removePod(podId: string): Promise<void>;
  listPods(): Promise<PodSummary[]>;
  openExternal(url: string): Promise<void>;
  copyMsxLink(url: string): Promise<void>;
}

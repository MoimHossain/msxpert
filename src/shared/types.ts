export type IsoDate = string;
export type IsoTimestamp = string;

export interface AuthState {
  signedIn: boolean;
  name: string | null;
  username: string | null;
  userId: string | null;
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
}

export interface AccountSearchResult {
  id: string;
  name: string;
  tpid: string | null;
  parentingLevel: string | null;
  country: string | null;
}

export interface AccountTreeNode {
  id: string;
  name: string;
  tpid: string;
  parentingLevel: string | null;
  country: string | null;
  url: string;
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
}

export interface NormalizedMilestone {
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
  ownerName: string | null;
  accountId: string | null;
  accountName: string | null;
  opportunityId: string | null;
  opportunityName: string | null;
  opportunityUrl: string | null;
  createdOn: string | null;
  modifiedOn: string | null;
  modifiedByName: string | null;
  versionNumber: string | null;
  url: string;
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
  milestones: NormalizedMilestone[];
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
  settings: AppSettings;
  overview: PortfolioOverview;
  team: TeamPerson[];
  pods: PodSummary[];
  dataPath: string;
  version: string;
}

export interface DesktopApi {
  bootstrap(): Promise<BootstrapState>;
  signIn(): Promise<AuthState>;
  signOut(): Promise<AuthState>;
  getSettings(): Promise<AppSettings>;
  updateSettings(settings: AppSettings): Promise<AppSettings>;
  searchAccounts(term: string): Promise<AccountSearchResult[]>;
  previewAccount(accountId: string): Promise<AccountPreview>;
  addAccount(accountId: string): Promise<PortfolioAccount>;
  removeAccount(accountId: string, deleteHistory: boolean): Promise<void>;
  getOverview(): Promise<PortfolioOverview>;
  getAccountState(accountId: string): Promise<AccountState>;
  fetchAccounts(accountId?: string): Promise<FetchResult>;
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
}

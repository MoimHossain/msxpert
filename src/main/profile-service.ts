import type { UserProfile } from "../shared/types";
import type { AuthService } from "./auth";
import type { MsxClient } from "./msx-client";
import type { VaultStore } from "./storage/vault";

const PROFILE = "user-profile";
const PHOTO = "user-profile-photo";
type CachedProfile = Omit<UserProfile, "photoDataUrl"> & { accountKey: string };

export class ProfileService {
  private generation = 0;

  constructor(private readonly store: VaultStore,
    private readonly auth: Pick<AuthService, "getAccountKey">,
    private readonly msx: Pick<MsxClient, "getMyProfile">) {}

  getCached(accountKey: string | null): UserProfile | null {
    const profile = this.store.get<CachedProfile>(PROFILE, "current");
    if (!profile || !accountKey || profile.accountKey !== accountKey) return null;
    const { accountKey: _key, ...fields } = profile;
    return { ...fields, photoDataUrl: this.store.get<string>(PHOTO, "current") };
  }

  clear(): void {
    this.generation++;
    this.store.transaction(() => {
      this.store.deleteKind(PROFILE);
      this.store.deleteKind(PHOTO);
    });
  }

  async refresh(): Promise<UserProfile> {
    const generation = this.generation;
    const accountKey = await this.auth.getAccountKey();
    if (!accountKey) throw new Error("Sign in with MSX before refreshing your profile.");
    const fields = await this.msx.getMyProfile();
    if (generation !== this.generation || accountKey !== await this.auth.getAccountKey()) {
      throw new Error("The profile session changed. Sign in again to refresh.");
    }
    const profile: UserProfile = { ...fields, updatedAt: new Date().toISOString() };
    const { photoDataUrl: _photo, ...json } = profile;
    this.store.transaction(() => {
      this.store.put(PROFILE, "current", { ...json, accountKey });
      if (profile.photoDataUrl) this.store.put(PHOTO, "current", profile.photoDataUrl);
      else this.store.deleteKind(PHOTO);
    });
    return profile;
  }
}

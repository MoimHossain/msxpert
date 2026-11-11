import { z } from "zod";
import type { UserProfile } from "../shared/types";
import type { AuthService } from "./auth";
import type { VaultStore } from "./storage/vault";

const PROFILE = "user-profile";
const PHOTO = "user-profile-photo";
const graphProfile = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  jobTitle: z.string().nullable(),
  mail: z.string().nullable(),
  userPrincipalName: z.string().nullable(),
  department: z.string().nullable(),
  officeLocation: z.string().nullable(),
});
type CachedProfile = Omit<UserProfile, "photoDataUrl"> & { accountKey: string };

export class ProfileService {
  private generation = 0;

  constructor(private readonly store: VaultStore,
    private readonly auth: Pick<AuthService, "getAccountKey" | "getGraphAccessToken">) {}

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

  private async request(path: string): Promise<Response> {
    let forceRefresh = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      let token: string;
      try { token = await this.auth.getGraphAccessToken(forceRefresh); } catch {
        throw new Error("Profile could not refresh. Sign in again and check delegated Microsoft Graph User.Read consent.");
      }
      const response = await fetch(`https://graph.microsoft.com/v1.0/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 401 && !forceRefresh) { forceRefresh = true; continue; }
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        const retryAfter = response.headers.get("retry-after");
        const seconds = Number(retryAfter);
        const wait = retryAfter && !Number.isNaN(seconds) ? seconds * 1000 :
          retryAfter ? Math.max(0, Date.parse(retryAfter) - Date.now()) : 500 * 2 ** attempt;
        if (!Number.isFinite(wait) || wait > 60000) throw new Error("Profile service is busy. Retry later.");
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
      return response;
    }
    throw new Error("Profile service is unavailable. Retry later.");
  }

  async refresh(): Promise<UserProfile> {
    const generation = this.generation;
    const accountKey = await this.auth.getAccountKey();
    if (!accountKey) throw new Error("Sign in with MSX before refreshing your profile.");
    const response = await this.request("me?$select=id,displayName,jobTitle,mail,userPrincipalName,department,officeLocation");
    if (!response.ok) throw new Error(`Profile request failed with HTTP ${response.status}. Check Graph User.Read consent and retry.`);
    const fields = graphProfile.parse(await response.json());
    const photo = await this.request("me/photo/$value");
    let photoDataUrl: string | null = null;
    if (photo.status !== 404) {
      if (!photo.ok) throw new Error(`Profile photo request failed with HTTP ${photo.status}. Retry later.`);
      const mime = photo.headers.get("content-type")?.split(";")[0];
      if (!mime || !["image/jpeg", "image/png", "image/webp"].includes(mime) ||
          Number(photo.headers.get("content-length")) > 5000000) throw new Error("Unsupported profile photo.");
      const bytes = Buffer.from(await photo.arrayBuffer());
      if (bytes.length > 5000000) throw new Error("Profile photo is too large.");
      photoDataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
    }
    if (generation !== this.generation || accountKey !== await this.auth.getAccountKey()) {
      throw new Error("The profile session changed. Sign in again to refresh.");
    }
    const profile: UserProfile = {
      id: fields.id, displayName: fields.displayName, jobTitle: fields.jobTitle,
      email: fields.mail ?? fields.userPrincipalName, department: fields.department,
      officeLocation: fields.officeLocation, updatedAt: new Date().toISOString(), photoDataUrl,
    };
    const { photoDataUrl: _photo, ...json } = profile;
    this.store.transaction(() => {
      this.store.put(PROFILE, "current", { ...json, accountKey });
      if (photoDataUrl) this.store.put(PHOTO, "current", photoDataUrl);
      else this.store.deleteKind(PHOTO);
    });
    return profile;
  }
}

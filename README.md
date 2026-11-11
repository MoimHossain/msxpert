# MCAPS Console

Local-first Windows desktop application for tracking an authorized manager's MSX customer portfolio, milestone changes, team roster, and POD coverage.

## Interface and setup

The workspace uses Microsoft **Fluent UI React v9** components, Fluent icons, and light/dark themes, with Settings and the signed-in profile anchored at the bottom of the navigation rail. It is an independent productivity tool, not an official Microsoft product.

Fluent packages are build-time dependencies: Vite bundles the required renderer code/icons into the app, avoiding shipping the entire component/icon source trees in the Electron runtime.

**Settings > Reset setup** signs out, archives tracked customer registrations, and restores default setup preferences/privacy consent. Confirmation requires typing `RESET`. The same privacy, sign-in, milestone-window, and first-customer flow runs again. Customer data/history, encrypted database/key, team, and POD records are retained; re-adding a customer reconnects its previous identity and history. Reset refuses to run while application operations or an update restart are active.

## Security model

- Uses the system browser for Microsoft authentication.
- Performs read-only MSX requests.
- Stores application data under the current Windows user's application-data directory.
- Encrypts every sensitive SQLite payload with AES-256-GCM.
- Protects the encryption key and MSAL cache with Windows DPAPI through Electron `safeStorage`.
- Runs the renderer with Node integration disabled, context isolation enabled, and a narrow typed preload API.
- Does not require GitHub Copilot or a separately installed `msx-cli`.

## Development

```powershell
npm install
npm run dev
```

## Validation

```powershell
npm test
npm run typecheck
npm run build
```

## Packaging

```powershell
npm run package
```

The generated installer is not production-ready until it is signed and timestamped with an approved publisher identity.

The Windows app is **`MCAPS Console.exe`** and the primary installer is **`MCAPS-Console-Setup-<version>.exe`**. The application ID, internal package/cache identity, and existing `%LOCALAPPDATA%\CSU Console` data directory are deliberately preserved so the rename does not strand previous installations' data.

Packaging also creates a byte-identical `CSU-Console-Setup-<version>.exe` update alias and points the channel manifest at it for compatibility with existing CSU alpha clients. Publish **both** installers and the generated manifest; new users download the MCAPS-named installer. Do not remove the legacy alias while older updater clients are supported. `npm run prepare:updates` prepares the alias after a custom build (or use `scripts\prepare-update-artifacts.ps1 -Directory <output-directory>`).

## Releases and updates

Download signed Windows x64 installers from [GitHub Releases](https://github.com/MoimHossain/msxpert/releases). No GitHub account is required.

Installed signed builds offer **Settings > Updates > Check for updates**, followed by **Update and restart**. The update is verified before installation, preserves local data, and waits for active work or unsaved edits before restarting. The same panel is available through **App updates** before MSX sign-in and setup. Development and unsigned builds cannot install updates.

**Temporary unsigned test releases:** explicitly marked numbered `alpha` packages also support updates, but only to newer alpha test releases. They display an **Unsigned test build** warning and verify checksums and embedded version, **not publisher identity**. They are not production releases. Install `alpha.1` to exercise updating to `alpha.2`. Switching to the future signed production channel requires installing a signed release manually.

For release infrastructure, publishing gates, and recovery instructions, see [Signing and releasing](prds/SIGNING.md). Existing installations without the updater need one manual upgrade to an updater-enabled release.

After building, run `npm run test:updates:smoke` to exercise the actual Electron preload/renderer update UI with mocked release responses. A real signed N-to-N+1 installation test is still required before publishing.

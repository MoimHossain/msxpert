# msXpert

Local-first Windows desktop application for tracking an authorized manager's MSX customer portfolio, milestone changes, team roster, and POD coverage.

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

## Releases and updates

Download signed Windows x64 installers from [GitHub Releases](https://github.com/MoimHossain/msxpert/releases). No GitHub account is required.

Installed signed builds offer **Settings > Updates > Check for updates**, followed by **Update and restart**. The update is verified before installation, preserves local data, and waits for active work or unsaved edits before restarting. The same panel is available through **App updates** before MSX sign-in and setup. Development and unsigned builds cannot install updates.

**Temporary unsigned test releases:** explicitly marked `0.4.0-alpha.*` packages also support updates, but only to newer alpha test releases. They display an **Unsigned test build** warning and verify checksums and embedded version, **not publisher identity**. They are not production releases. Install `alpha.1` to exercise updating to `alpha.2`. Switching to the future signed production channel requires installing a signed release manually.

For release infrastructure, publishing gates, and recovery instructions, see [Signing and releasing](prds/SIGNING.md). Existing installations without the updater need one manual upgrade to an updater-enabled release.

After building, run `npm run test:updates:smoke` to exercise the actual Electron preload/renderer update UI with mocked release responses. A real signed N-to-N+1 installation test is still required before publishing.

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

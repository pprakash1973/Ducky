# 🦆 Ducky

A floating duck on your Windows desktop. Say or type "draft my weekly status report" and it gathers your
last week of work (sent mail, calendar, edited files), writes the report with Claude, and opens a **draft** in
Outlook for you to review. It never sends anything.

## Run
```bash
npm install
npm run dev        # build + launch
npm test           # unit tests
npm run dist       # Windows installer in release/
```
If the Electron binary is missing after install, run `node node_modules/electron/install.js`.

## First-time setup
Tray menu > **Settings**: paste your Anthropic API key, pick the folders to scan, optionally add Azure IDs
(see [docs/IT-APP-REGISTRATION.md](docs/IT-APP-REGISTRATION.md)).

## Using it
- Click the duck: open/close chat. Drag it anywhere.
- **Ctrl+Alt+D** or the 🎤 button: speak one request. Replies are spoken back.
- Tray > "Hey Ducky wake word": hands-free mode (microphone stays on; off by default).
- Anything that changes something (creating a draft, changing scan folders) asks Allow/Decline first.

## Layout
`src/main` – app shell, agent loop (`agent/`), connectors (`connectors/outlook`, `connectors/activity`), voice, audit, settings.
`src/renderer` – avatar, chat panel, settings window. `tests/` – Vitest.

## Adding a skill
Register a tool in `src/main/agent/tools.ts` (name, schema, handler, `requiresConfirmation` if it has side effects).

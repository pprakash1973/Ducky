import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { auditPath } from './audit';
import { resetOutlook } from './connectors/outlook';
import { getApiKey, setApiKey } from './secrets';
import { DuckState, IPC } from '../shared/types';
import { DuckAgent, friendlyError } from './agent/agent';
import { loadConfig, saveConfig } from './config';
import { listenOnce, startWake, stopWake } from './voice/voice';

let avatar: BrowserWindow | null = null;
let panel: BrowserWindow | null = null;
let tray: Tray | null = null;

const AVATAR_SIZE = 140;
const PANEL_W = 340;
const PANEL_H = 420;

const preload = path.join(__dirname, 'preload.js');
const rendererFile = (...p: string[]) => path.join(__dirname, '..', 'renderer', ...p);

function createAvatar() {
  const { workArea } = screen.getPrimaryDisplay();
  avatar = new BrowserWindow({
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    x: workArea.x + workArea.width - AVATAR_SIZE - 40,
    y: workArea.y + workArea.height - AVATAR_SIZE - 40,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: { preload, contextIsolation: true }
  });
  avatar.setAlwaysOnTop(true, 'screen-saver');
  avatar.loadFile(rendererFile('avatar', 'index.html'));
  avatar.on('move', positionPanel);
  // Right-click the duck for the same menu as the tray icon (which is a blank placeholder for now).
  avatar.webContents.on('context-menu', () => trayMenu?.popup({ window: avatar ?? undefined }));
  avatar.on('closed', () => (avatar = null));
}

function createPanel() {
  panel = new BrowserWindow({
    width: PANEL_W,
    height: PANEL_H,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: { preload, contextIsolation: true }
  });
  panel.loadFile(rendererFile('panel', 'index.html'));
  panel.on('closed', () => (panel = null));
}

function positionPanel() {
  if (!avatar || !panel) return;
  const a = avatar.getBounds();
  const { workArea } = screen.getDisplayMatching(a);
  let x = a.x + a.width - PANEL_W;
  let y = a.y - PANEL_H - 8;
  if (y < workArea.y) y = a.y + a.height + 8;
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - PANEL_W));
  panel.setPosition(Math.round(x), Math.round(y));
}

function togglePanel() {
  if (!panel) return;
  if (panel.isVisible()) {
    panel.hide();
  } else {
    positionPanel();
    panel.show();
    panel.focus();
  }
}

function setState(state: DuckState) {
  avatar?.webContents.send(IPC.setState, state);
}

let agent: DuckAgent;
let busy = false;
let speakDoneResolve: (() => void) | null = null;

function say(text: string) {
  panel?.webContents.send(IPC.reply, text);
}

function showPanel() {
  if (!panel || panel.isVisible()) return;
  positionPanel();
  panel.show();
}

/** Trim a reply into something pleasant to hear; the full text stays in the chat. */
function spokenVersion(text: string): string {
  const plain = text.replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= 300) return plain;
  const cut = plain.slice(0, 300);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return (end > 80 ? cut.slice(0, end + 1) : cut) + ' The full answer is in the chat.';
}

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!avatar) return resolve();
    setState('speaking');
    const timer = setTimeout(finish, 60_000);
    function finish() {
      clearTimeout(timer);
      speakDoneResolve = null;
      resolve();
    }
    speakDoneResolve = finish;
    avatar.webContents.send(IPC.speak, spokenVersion(text));
  });
}

function stopSpeaking() {
  avatar?.webContents.send(IPC.stopSpeak);
  speakDoneResolve?.();
}

async function runCommand(text: string, spoken: boolean) {
  if (busy) {
    say('One thing at a time, please — still working on the last request.');
    return;
  }
  busy = true;
  setState('thinking');
  try {
    const reply = await agent.run(text);
    say(reply);
    if (spoken && loadConfig().speakReplies) await speak(reply);
    setState('done');
  } catch (err) {
    const msg = friendlyError(err);
    say(msg);
    setState('error');
    if (spoken && loadConfig().speakReplies) await speak(msg);
  } finally {
    busy = false;
    setTimeout(() => setState('idle'), 1500);
  }
}

let listening = false;

async function voiceTurn() {
  if (busy || listening) return; // ignore key-repeat / double clicks while already listening
  listening = true;
  try {
    await voiceTurnInner();
  } finally {
    listening = false;
  }
}

async function voiceTurnInner() {
  stopWake();
  stopSpeaking();
  showPanel();
  setState('listening');
  let heard: string | null = null;
  try {
    heard = await listenOnce();
  } catch (e) {
    say((e as Error).message);
    setState('error');
    setTimeout(() => setState('idle'), 2000);
    resumeWake();
    return;
  }
  if (!heard) {
    setState('idle');
    resumeWake();
    return;
  }
  panel?.webContents.send(IPC.heard, heard);
  await runCommand(heard, true);
  resumeWake();
}

function resumeWake() {
  if (!loadConfig().wakeWord) return;
  startWake(
    () => void voiceTurn(),
    (msg) => {
      say(`Wake word stopped: ${msg}`);
      saveConfig({ wakeWord: false });
      refreshTray();
    }
  );
}

let settingsWin: BrowserWindow | null = null;
let trayMenu: Menu | null = null;

function openSettings() {
  if (settingsWin) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 480,
    height: 640,
    title: 'Ducky Settings',
    autoHideMenuBar: true,
    webPreferences: { preload, contextIsolation: true }
  });
  settingsWin.loadFile(rendererFile('settings', 'index.html'));
  settingsWin.on('closed', () => (settingsWin = null));
}

function registerSettingsIpc() {
  ipcMain.handle('settings:get', () => {
    const c = loadConfig();
    return {
      hasKey: !!getApiKey(),
      azureClientId: c.azureClientId,
      azureTenantId: c.azureTenantId,
      wakeWord: c.wakeWord,
      speakReplies: c.speakReplies,
      scanDirs: c.scanDirs
    };
  });

  ipcMain.handle('settings:pick-folder', async () => {
    const r = await dialog.showOpenDialog(settingsWin ?? undefined!, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.on('settings:open-log', () => {
    if (fs.existsSync(auditPath())) shell.showItemInFolder(auditPath());
    else dialog.showMessageBox({ message: 'No activity yet — the log appears after Ducky first uses a tool.' });
  });

  ipcMain.handle('settings:save', (_e, s: any) => {
    try {
      if (typeof s.apiKey === 'string' && s.apiKey.trim()) setApiKey(s.apiKey);
      const prev = loadConfig();
      const next = saveConfig({
        azureClientId: String(s.azureClientId ?? '').trim(),
        azureTenantId: String(s.azureTenantId ?? '').trim(),
        wakeWord: !!s.wakeWord,
        speakReplies: !!s.speakReplies,
        scanDirs: (Array.isArray(s.scanDirs) ? s.scanDirs : []).map(String)
      });
      if (prev.azureClientId !== next.azureClientId || prev.azureTenantId !== next.azureTenantId) resetOutlook();
      if (next.wakeWord) resumeWake();
      else stopWake();
      refreshTray();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
}

function refreshTray() {
  const cfg = loadConfig();
  trayMenu = Menu.buildFromTemplate([
      { label: 'Listen now (Ctrl+Alt+D)', click: () => void voiceTurn() },
      { label: 'Show / hide chat', click: togglePanel },
      { type: 'separator' },
      {
        label: 'Hey Ducky wake word (mic stays on)',
        type: 'checkbox',
        checked: cfg.wakeWord,
        click: (item) => {
          saveConfig({ wakeWord: item.checked });
          if (item.checked) resumeWake();
          else stopWake();
          refreshTray();
        }
      },
      {
        label: 'Speak replies',
        type: 'checkbox',
        checked: cfg.speakReplies,
        click: (item) => {
          saveConfig({ speakReplies: item.checked });
          if (!item.checked) stopSpeaking();
        }
      },
      { type: 'separator' },
      { label: 'Settings…', click: openSettings },
      { label: 'Quit Ducky', click: () => app.quit() }
  ]);
  tray?.setContextMenu(trayMenu);
}

function createTray() {
  // 1x1 transparent placeholder; replace with assets/duck/tray.png later.
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Ducky');
  refreshTray();
  tray.on('click', togglePanel);
}

// Single instance: a second launch would fight over the hotkey and microphone.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// Last-resort error surfacing: tell the user in the chat instead of failing silently.
process.on('uncaughtException', (e) => {
  console.error(e);
  say(`Something unexpected went wrong: ${e.message}`);
  setState('error');
});
process.on('unhandledRejection', (e) => {
  console.error(e);
  say(`Something unexpected went wrong: ${(e as Error)?.message ?? e}`);
  setState('error');
});

app.whenReady().then(() => {
  if (!gotLock) return;
  createAvatar();
  createPanel();
  createTray();

  globalShortcut.register('Control+Alt+D', () => void voiceTurn());

  registerSettingsIpc();
  ipcMain.on(IPC.togglePanel, togglePanel);
  ipcMain.on(IPC.listen, () => void voiceTurn());
  ipcMain.on(IPC.speakDone, () => speakDoneResolve?.());

  ipcMain.on(IPC.dragMove, (_e, dx: number, dy: number) => {
    if (!avatar) return;
    const b = avatar.getBounds();
    avatar.setPosition(Math.round(b.x + dx), Math.round(b.y + dy));
  });

  agent = new DuckAgent(
    async (summary) => {
      const { response } = await dialog.showMessageBox(panel ?? undefined!, {
        type: 'question',
        buttons: ['Allow', 'Decline'],
        defaultId: 1,
        cancelId: 1,
        title: 'Ducky needs your OK',
        message: summary
      });
      return response === 0;
    },
    (status) => panel?.webContents.send(IPC.reply, `⚙ ${status}`)
  );

  ipcMain.on(IPC.command, (_e, text: string) => void runCommand(text, false));

  resumeWake();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopWake();
});
app.on('window-all-closed', () => app.quit());

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface DuckConfig {
  /** Folders scanned for recently edited files. Empty = scanning disabled. */
  scanDirs: string[];
  /** Always-on "Hey Ducky" listener. Off by default: the mic is only open when the user opts in. */
  wakeWord: boolean;
  /** Speak replies aloud. */
  speakReplies: boolean;
  /** Azure app registration for Microsoft Graph. Empty = use desktop Outlook only. */
  azureClientId: string;
  azureTenantId: string;
  /** Azure Speech region (e.g. southeastasia) and recognition language. Key is stored separately, encrypted. */
  speechRegion: string;
  speechLang: string;
}

const DEFAULTS: DuckConfig = {
  scanDirs: [],
  wakeWord: false,
  speakReplies: true,
  azureClientId: '',
  azureTenantId: '',
  speechRegion: '',
  speechLang: 'en-IN'
};

const file = () => path.join(app.getPath('userData'), 'config.json');

export function loadConfig(): DuckConfig {
  const env = process.env.DUCKY_SCAN_DIRS?.split(';').map((s) => s.trim()).filter(Boolean);
  let saved: Partial<DuckConfig> = {};
  try {
    saved = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    /* no config yet */
  }
  return { ...DEFAULTS, ...saved, ...(env?.length ? { scanDirs: env } : {}) };
}

export function saveConfig(patch: Partial<DuckConfig>): DuckConfig {
  const next = { ...loadConfig(), ...patch };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(next, null, 2));
  return next;
}

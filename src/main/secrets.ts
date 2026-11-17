import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const file = () => path.join(app.getPath('userData'), 'anthropic-key.bin');

/** Env var wins (handy for dev); otherwise the key saved from Settings, encrypted by the OS. */
export function getApiKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    if (fs.existsSync(file()) && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(fs.readFileSync(file()));
    }
  } catch {
    /* unreadable: treat as unset */
  }
  return undefined;
}

export function setApiKey(key: string) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS encryption is not available, so the key cannot be stored safely.');
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), safeStorage.encryptString(key.trim()));
}

export function clearApiKey() {
  try {
    fs.unlinkSync(file());
  } catch {
    /* already gone */
  }
}

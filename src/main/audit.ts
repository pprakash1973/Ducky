import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const MAX_BYTES = 1_000_000;
const file = () => path.join(app.getPath('userData'), 'audit.log');

/** Shrinks tool input for logging: bodies are reduced to a length, long strings truncated. */
export function redact(input: unknown, depth = 0): unknown {
  if (typeof input === 'string') return input.length > 200 ? `${input.slice(0, 200)}…(${input.length} chars)` : input;
  if (Array.isArray(input)) return input.slice(0, 20).map((v) => redact(v, depth + 1));
  if (input && typeof input === 'object' && depth < 4) {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([k, v]) =>
        /^(body|content|text)$/i.test(k) && typeof v === 'string' ? [k, `[${v.length} chars]`] : [k, redact(v, depth + 1)]
      )
    );
  }
  return input;
}

export interface AuditEntry {
  tool: string;
  input: unknown;
  outcome: 'ok' | 'error' | 'declined';
  detail?: string;
}

export function audit(entry: AuditEntry) {
  try {
    const f = file();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (fs.existsSync(f) && fs.statSync(f).size > MAX_BYTES) fs.renameSync(f, f + '.1');
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry, input: redact(entry.input) });
    fs.appendFileSync(f, line + '\n');
  } catch {
    /* auditing must never break the app */
  }
}

export const auditPath = file;

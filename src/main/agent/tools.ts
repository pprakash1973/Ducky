import type Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, saveConfig } from '../config';
import { scanRecentFiles } from '../connectors/activity/files';
import { getOutlook } from '../connectors/outlook';

export interface DuckTool {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
  /** If true, the user must approve before the handler runs. */
  requiresConfirmation?: boolean;
  /** Human-readable summary shown in the confirmation prompt. */
  describeCall?: (input: any) => string;
  handler: (input: any) => Promise<string>;
}

const registry = new Map<string, DuckTool>();

export function registerTool(tool: DuckTool) {
  registry.set(tool.name, tool);
}

export function getTool(name: string): DuckTool | undefined {
  return registry.get(name);
}

export function toolDefinitions(): Anthropic.Tool[] {
  return [...registry.values()].map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema
  }));
}

// ---- Stub tools for M2. Real Outlook / activity connectors replace these in M3/M4. ----

registerTool({
  name: 'get_current_time',
  description: 'Returns the current local date and time on the user\'s machine.',
  input_schema: { type: 'object', properties: {}, additionalProperties: false },
  handler: async () => new Date().toString()
});

registerTool({
  name: 'collect_weekly_activity',
  description:
    'Collects what the user worked on in the last N days (sent emails, calendar events, edited files). ' +
    'Call this before drafting a status report.',
  input_schema: {
    type: 'object',
    properties: { days: { type: 'number', description: 'Look-back window in days. Default 7.' } },
    additionalProperties: false
  },
  handler: async (input) => {
    const days = Math.min(Math.max(Number(input?.days) || 7, 1), 31);
    const until = new Date();
    const since = new Date(until.getTime() - days * 86_400_000);
    const outlook = await getOutlook();
    const [sent, events] = await Promise.all([outlook.listSent(since), outlook.listEvents(since, until)]);
    const dirs = loadConfig().scanDirs;
    const files = dirs.length
      ? scanRecentFiles(dirs, since)
      : 'No folders configured. Ask the user which folders to scan and call set_scan_folders.';
    return JSON.stringify({
      source: outlook.name,
      windowDays: days,
      sentEmails: sent.map((m) => ({ subject: m.subject, to: m.to.slice(0, 5), sentAt: m.sentAt })),
      calendarEvents: events,
      editedFiles: files
    });
  }
});

registerTool({
  name: 'set_scan_folders',
  description:
    'Sets the folders Ducky scans for recently edited files when building work summaries. Replaces the current list. ' +
    'Only file names and dates are read, never contents.',
  input_schema: {
    type: 'object',
    properties: { folders: { type: 'array', items: { type: 'string' }, description: 'Absolute folder paths.' } },
    required: ['folders'],
    additionalProperties: false
  },
  requiresConfirmation: true,
  describeCall: (i) => `Scan these folders for recent file activity:\n${(i.folders ?? []).join('\n')}`,
  handler: async (input) => {
    const raw: unknown[] = Array.isArray(input.folders) ? input.folders : [];
    const folders = raw.map(String).filter((p: string) => path.isAbsolute(p));
    const missing = folders.filter((p: string) => !fs.existsSync(p));
    saveConfig({ scanDirs: folders });
    return `Saved ${folders.length} folder(s).` + (missing.length ? ` Not found: ${missing.join(', ')}` : '');
  }
});

registerTool({
  name: 'create_outlook_draft',
  description:
    'Creates a DRAFT email in Outlook and opens it for the user to review. Never sends the email.',
  input_schema: {
    type: 'object',
    properties: {
      to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses (may be empty).' },
      subject: { type: 'string' },
      body: { type: 'string', description: 'Plain-text email body.' }
    },
    required: ['subject', 'body'],
    additionalProperties: false
  },
  requiresConfirmation: true,
  describeCall: (i) => `Create an Outlook draft titled "${i.subject}"`,
  handler: async (input) => {
    const outlook = await getOutlook();
    await outlook.createDraft({
      to: Array.isArray(input.to) ? input.to : [],
      subject: String(input.subject),
      body: String(input.body)
    });
    return `Draft created via ${outlook.name} and opened for the user to review. It has NOT been sent.`;
  }
});

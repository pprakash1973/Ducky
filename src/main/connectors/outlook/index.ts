import { loadConfig } from '../../config';
import { ComProvider } from './comProvider';
import { GraphProvider } from './graphProvider';
import { OutlookProvider } from './types';

export * from './types';

let cached: OutlookProvider | null = null;
let lastNote = '';

/**
 * Prefers Microsoft Graph when DUCKY_AZURE_CLIENT_ID is set and sign-in works;
 * otherwise falls back to the desktop Outlook COM provider (Windows only).
 */
export async function getOutlook(): Promise<OutlookProvider> {
  if (cached) return cached;

  const cfg = loadConfig();
  const clientId = process.env.DUCKY_AZURE_CLIENT_ID || cfg.azureClientId;
  if (clientId) {
    try {
      const graph = new GraphProvider(clientId, process.env.DUCKY_AZURE_TENANT_ID || cfg.azureTenantId || undefined);
      await graph.signIn();
      cached = graph;
      return graph;
    } catch (e) {
      lastNote = `Graph unavailable (${(e as Error).message}); using desktop Outlook.`;
      console.warn('[outlook]', lastNote);
    }
  }
  if (process.platform !== 'win32') throw new Error('No Outlook provider available on this platform.');
  cached = new ComProvider();
  return cached;
}

/** Forget the chosen provider so the next call re-reads settings (after Settings changes). */
export function resetOutlook() {
  cached = null;
  lastNote = '';
}

export function providerNote(): string {
  return lastNote;
}

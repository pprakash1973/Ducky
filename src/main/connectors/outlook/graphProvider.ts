import { app, safeStorage, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { AccountInfo, ICachePlugin, INetworkModule, PublicClientApplication, TokenCacheContext } from '@azure/msal-node';
import { netFetch } from '../../net';
import { CalEvent, DraftInput, OutlookProvider, SentMail } from './types';

const SCOPES = ['Mail.ReadWrite', 'Calendars.Read', 'User.Read'];
const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Token cache encrypted with the OS (DPAPI via Electron safeStorage). */
function cachePlugin(): ICachePlugin {
  const file = () => path.join(app.getPath('userData'), 'msal-cache.bin');
  return {
    async beforeCacheAccess(ctx: TokenCacheContext) {
      try {
        if (fs.existsSync(file()) && safeStorage.isEncryptionAvailable()) {
          ctx.tokenCache.deserialize(safeStorage.decryptString(fs.readFileSync(file())));
        }
      } catch {
        /* corrupt cache: start fresh */
      }
    },
    async afterCacheAccess(ctx: TokenCacheContext) {
      if (ctx.cacheHasChanged && safeStorage.isEncryptionAvailable()) {
        fs.writeFileSync(file(), safeStorage.encryptString(ctx.tokenCache.serialize()));
      }
    }
  };
}

/** Routes MSAL's token requests through Chromium's network stack too (proxy / corporate certs). */
const netClient: INetworkModule = {
  async sendGetRequestAsync(url, options) {
    return toNetworkResponse(await netFetch(url, { method: 'GET', headers: options?.headers }));
  },
  async sendPostRequestAsync(url, options) {
    return toNetworkResponse(
      await netFetch(url, { method: 'POST', headers: options?.headers, body: options?.body })
    );
  }
};

async function toNetworkResponse(res: Response) {
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  return { headers, body: (await res.json().catch(() => ({}))) as any, status: res.status };
}

export class GraphProvider implements OutlookProvider {
  readonly name = 'graph' as const;
  private pca: PublicClientApplication;
  private account: AccountInfo | null = null;

  constructor(clientId: string, tenantId = 'organizations') {
    this.pca = new PublicClientApplication({
      auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}` },
      cache: { cachePlugin: cachePlugin() },
      system: { networkClient: netClient }
    });
  }

  /** Silent sign-in if possible, otherwise opens the system browser once. */
  async signIn(): Promise<void> {
    const accounts = await this.pca.getTokenCache().getAllAccounts();
    if (accounts[0]) {
      try {
        const r = await this.pca.acquireTokenSilent({ account: accounts[0], scopes: SCOPES });
        this.account = r.account;
        return;
      } catch {
        /* fall through to interactive */
      }
    }
    const r = await this.pca.acquireTokenInteractive({
      scopes: SCOPES,
      openBrowser: async (url) => {
        await shell.openExternal(url);
      },
      successTemplate: '<h2>Ducky is signed in. You can close this tab. 🦆</h2>',
      errorTemplate: '<h2>Sign-in failed. Return to Ducky for details.</h2>'
    });
    this.account = r.account;
  }

  private async token(): Promise<string> {
    if (!this.account) await this.signIn();
    const r = await this.pca.acquireTokenSilent({ account: this.account!, scopes: SCOPES });
    return r.accessToken;
  }

  private async api<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await netFetch(url.startsWith('http') ? url : GRAPH + url, {
      method,
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error(`Graph ${method} failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  /** Follows @odata.nextLink up to a cap. */
  private async pages<T>(url: string, cap = 300): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = url;
    while (next && out.length < cap) {
      const page: { value: T[]; '@odata.nextLink'?: string } = await this.api('GET', next);
      out.push(...page.value);
      next = page['@odata.nextLink'];
    }
    return out.slice(0, cap);
  }

  async listSent(since: Date): Promise<SentMail[]> {
    const q =
      `/me/mailFolders/sentitems/messages?$filter=sentDateTime ge ${since.toISOString()}` +
      `&$select=subject,toRecipients,sentDateTime&$orderby=sentDateTime desc&$top=100`;
    const rows = await this.pages<any>(encodeURI(q));
    return rows.map((m) => ({
      subject: m.subject ?? '(no subject)',
      to: (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean),
      sentAt: m.sentDateTime
    }));
  }

  async listEvents(since: Date, until: Date): Promise<CalEvent[]> {
    const q =
      `/me/calendarView?startDateTime=${since.toISOString()}&endDateTime=${until.toISOString()}` +
      `&$select=subject,start,end,attendees&$orderby=start/dateTime&$top=100`;
    const rows = await this.pages<any>(q);
    // calendarView returns times in UTC unless a Prefer header says otherwise.
    return rows.map((e) => ({
      title: e.subject ?? '(no title)',
      start: new Date(e.start.dateTime + 'Z').toISOString(),
      end: new Date(e.end.dateTime + 'Z').toISOString(),
      attendees: (e.attendees ?? []).length
    }));
  }

  async createDraft(input: DraftInput): Promise<void> {
    const msg = await this.api<{ webLink: string }>('POST', '/me/messages', {
      subject: input.subject,
      body: { contentType: 'Text', content: input.body },
      toRecipients: input.to.map((address) => ({ emailAddress: { address } }))
    });
    await shell.openExternal(msg.webLink);
  }
}

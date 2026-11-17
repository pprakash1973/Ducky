import Anthropic from '@anthropic-ai/sdk';
import { audit } from '../audit';
import { netFetch } from '../net';
import { getApiKey } from '../secrets';
import { getTool, toolDefinitions } from './tools';

const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 10;
const MAX_HISTORY = 40;

const SYSTEM_PROMPT = `You are Ducky, a friendly desktop assistant shown as a small floating duck.
You help the user get work done by calling tools. Keep replies short (1-3 sentences) unless drafting content.
Rules:
- Never send emails; only create drafts for the user to review.
- For a status report: call collect_weekly_activity first, write the report from that data only (never invent work), then call create_outlook_draft.
- Report format: Summary, Accomplishments, In progress, Blockers, Next week. Infer themes from email subjects, meetings and edited-file projects; label anything uncertain as "to confirm" rather than guessing.
- If no scan folders are configured, ask the user which folders to use (set_scan_folders) or offer to continue with email and calendar only.
- If a tool is declined by the user, acknowledge it and do not retry.`;

export type ConfirmFn = (summary: string) => Promise<boolean>;

export class DuckAgent {
  private clientKey: string | undefined;
  private clientInstance: Anthropic | null = null;
  private history: Anthropic.MessageParam[] = [];

  /** Rebuilt when the saved key changes, so Settings edits apply without a restart. */
  private get client(): Anthropic {
    const key = getApiKey();
    if (!this.clientInstance || key !== this.clientKey) {
      this.clientKey = key;
      this.clientInstance = new Anthropic({ ...(key ? { apiKey: key } : {}), fetch: netFetch });
    }
    return this.clientInstance;
  }

  constructor(
    private confirm: ConfirmFn,
    private onStatus: (s: string) => void
  ) {}

  reset() {
    this.history = [];
  }

  async run(userText: string): Promise<string> {
    this.history.push({ role: 'user', content: userText });
    let reply = '';

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions(),
        output_config: { effort: 'medium' },
        messages: this.history
      });

      // Keep the full content (incl. thinking blocks) so tool loops stay valid.
      this.history.push({ role: 'assistant', content: res.content });

      if (res.stop_reason === 'refusal') {
        reply = "Sorry, I can't help with that one.";
        break;
      }

      reply = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      if (res.stop_reason !== 'tool_use') {
        if (res.stop_reason === 'max_tokens') reply += '\n(Reply was cut off.)';
        break;
      }

      // Run all tool calls, return all results in ONE user message.
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue;
        results.push(await this.runTool(block));
      }
      this.history.push({ role: 'user', content: results });
    }

    this.trimHistory();
    return reply || 'Quack? I have nothing to say.';
  }

  private async runTool(block: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
    const tool = getTool(block.name);
    if (!tool) {
      return { type: 'tool_result', tool_use_id: block.id, content: `Unknown tool ${block.name}`, is_error: true };
    }
    try {
      if (tool.requiresConfirmation) {
        const summary = tool.describeCall?.(block.input) ?? `Run ${tool.name}`;
        const ok = await this.confirm(summary);
        if (!ok) {
          audit({ tool: tool.name, input: block.input, outcome: 'declined' });
          return { type: 'tool_result', tool_use_id: block.id, content: 'The user declined this action.', is_error: true };
        }
      }
      this.onStatus(`Running ${tool.name}…`);
      const out = await tool.handler(block.input);
      audit({ tool: tool.name, input: block.input, outcome: 'ok' });
      return { type: 'tool_result', tool_use_id: block.id, content: out };
    } catch (e) {
      audit({ tool: tool.name, input: block.input, outcome: 'error', detail: (e as Error).message });
      return { type: 'tool_result', tool_use_id: block.id, content: `Tool failed: ${(e as Error).message}`, is_error: true };
    }
  }

  /** Drop the oldest whole turns, keeping history starting on a plain user text message. */
  private trimHistory() {
    while (this.history.length > MAX_HISTORY) this.history.shift();
    while (this.history.length && !(this.history[0].role === 'user' && typeof this.history[0].content === 'string')) {
      this.history.shift();
    }
  }
}

export function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError || /Could not resolve authentication/.test((e as Error)?.message ?? ''))
    return 'No valid API key. Add one in tray menu > Settings.';
  if (e instanceof Anthropic.RateLimitError) return 'I am being rate limited. Try again in a moment.';
  if (e instanceof Anthropic.APIConnectionError) return 'I cannot reach the network right now.';
  if (e instanceof Anthropic.APIError) return `API error ${e.status}: ${e.message}`;
  return `Something went wrong: ${(e as Error).message}`;
}

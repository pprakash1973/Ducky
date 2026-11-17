export interface SentMail {
  subject: string;
  to: string[];
  sentAt: string; // ISO
}

export interface CalEvent {
  title: string;
  start: string; // ISO
  end: string; // ISO
  attendees: number;
}

export interface DraftInput {
  to: string[];
  subject: string;
  body: string; // plain text
}

export interface OutlookProvider {
  readonly name: 'graph' | 'com';
  listSent(since: Date): Promise<SentMail[]>;
  listEvents(since: Date, until: Date): Promise<CalEvent[]>;
  /** Creates a draft and opens it for the user. NEVER sends. */
  createDraft(input: DraftInput): Promise<void>;
}

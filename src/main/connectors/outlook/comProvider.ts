import { execFile } from 'child_process';
import { CalEvent, DraftInput, OutlookProvider, SentMail } from './types';

/** Runs a PowerShell script with JSON input (env DUCKY_IN) and parses JSON stdout. */
function runPs<T>(script: string, input: unknown): Promise<T> {
  const full = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$in = $env:DUCKY_IN | ConvertFrom-Json
${script}`;
  const encoded = Buffer.from(full, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { env: { ...process.env, DUCKY_IN: JSON.stringify(input) }, maxBuffer: 20 * 1024 * 1024, timeout: 60_000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message).toString().trim().split('\n')[0]));
        const text = stdout.toString().trim();
        try {
          resolve((text ? JSON.parse(text) : null) as T);
        } catch {
          reject(new Error('Unexpected output from Outlook: ' + text.slice(0, 200)));
        }
      }
    );
  });
}

const asArray = <T>(v: T | T[] | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Automates the desktop Outlook app through COM. Windows only, needs classic Outlook running/installed. */
export class ComProvider implements OutlookProvider {
  readonly name = 'com' as const;

  async listSent(since: Date): Promise<SentMail[]> {
    const rows = await runPs<any>(
      `
$ol = New-Object -ComObject Outlook.Application
$items = $ol.GetNamespace('MAPI').GetDefaultFolder(5).Items
$items.Sort('[SentOn]', $true)
$since = [DateTime]::Parse($in.since).ToLocalTime()
$out = @()
foreach ($m in $items) {
  if ($m.SentOn -lt $since) { break }
  $out += [pscustomobject]@{ subject = $m.Subject; to = @($m.To -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }); sentAt = $m.SentOn.ToUniversalTime().ToString('o') }
  if ($out.Count -ge 200) { break }
}
ConvertTo-Json -InputObject @($out) -Compress -Depth 4`,
      { since: since.toISOString() }
    );
    return asArray<SentMail>(rows);
  }

  async listEvents(since: Date, until: Date): Promise<CalEvent[]> {
    const rows = await runPs<any>(
      `
$ol = New-Object -ComObject Outlook.Application
$items = $ol.GetNamespace('MAPI').GetDefaultFolder(9).Items
$items.IncludeRecurrences = $true
$items.Sort('[Start]')
$s = [DateTime]::Parse($in.since).ToLocalTime()
$e = [DateTime]::Parse($in.until).ToLocalTime()
$fmt = (Get-Culture).DateTimeFormat.ShortDatePattern + ' ' + (Get-Culture).DateTimeFormat.ShortTimePattern
$filter = "[Start] >= '" + $s.ToString($fmt) + "' AND [End] <= '" + $e.ToString($fmt) + "'"
$out = @()
foreach ($a in $items.Restrict($filter)) {
  $out += [pscustomobject]@{ title = $a.Subject; start = $a.Start.ToUniversalTime().ToString('o'); end = $a.End.ToUniversalTime().ToString('o'); attendees = $a.Recipients.Count }
  if ($out.Count -ge 200) { break }
}
ConvertTo-Json -InputObject @($out) -Compress -Depth 4`,
      { since: since.toISOString(), until: until.toISOString() }
    );
    return asArray<CalEvent>(rows);
  }

  async createDraft(input: DraftInput): Promise<void> {
    await runPs<unknown>(
      `
$ol = New-Object -ComObject Outlook.Application
$mail = $ol.CreateItem(0)
$mail.To = ($in.to -join ';')
$mail.Subject = $in.subject
$mail.Body = $in.body
$mail.Display($false)
'null'`,
      input
    );
  }
}

import { ChildProcess, spawn } from 'child_process';

/**
 * Offline speech recognition using Windows' built-in System.Speech engine.
 * It needs no keys or downloads; accuracy is modest. The functions below are the
 * seam where Azure Speech or whisper.cpp can be swapped in later.
 */

const PREAMBLE = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$e = New-Object System.Speech.Recognition.SpeechRecognitionEngine
`;

const DICTATION = `${PREAMBLE}
$e.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
$e.SetInputToDefaultAudioDevice()
$e.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.2)
$e.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromSeconds(1.5)
$r = $e.Recognize([TimeSpan]::FromSeconds(6))
if ($r) { @{ text = $r.Text } | ConvertTo-Json -Compress } else { '{"text":null}' }
`;

// Loops until the wake phrase is heard with decent confidence, prints one line, exits.
const WAKE = `${PREAMBLE}
$c = New-Object System.Speech.Recognition.Choices
foreach ($p in @('hey ducky','hey duck','okay ducky')) { $c.Add($p) }
$gb = New-Object System.Speech.Recognition.GrammarBuilder
$gb.Append($c)
$e.LoadGrammar((New-Object System.Speech.Recognition.Grammar($gb)))
$e.SetInputToDefaultAudioDevice()
while ($true) {
  $r = $e.Recognize([TimeSpan]::FromSeconds(10))
  if ($r -and $r.Confidence -ge 0.8) { '{"wake":true}'; break }
}
`;

function spawnPs(script: string): ChildProcess {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    windowsHide: true
  });
}

function collect(child: ChildProcess): Promise<{ out: string; err: string; code: number | null }> {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    child.stdout?.on('data', (d) => (out += d));
    child.stderr?.on('data', (d) => (err += d));
    child.on('close', (code) => resolve({ out: out.trim(), err: err.trim(), code }));
    child.on('error', (e) => resolve({ out, err: e.message, code: -1 }));
  });
}

let active: ChildProcess | null = null;

function stopActive() {
  if (active && !active.killed) active.kill();
  active = null;
}

/** Listens for one utterance. Resolves null on silence; throws on mic/engine failure. */
export async function listenOnce(): Promise<string | null> {
  stopActive();
  const child = spawnPs(DICTATION);
  active = child;
  const { out, err, code } = await collect(child);
  const supersededOrStopped = active !== child; // killed on purpose by stopWake()/another listen
  if (active === child) active = null;
  if (!out && supersededOrStopped) return null;
  if (code !== 0 && !out) throw new Error(friendly(err, code));
  try {
    return (JSON.parse(out).text as string | null)?.trim() || null;
  } catch {
    throw new Error(friendly(err || out, code));
  }
}

let wakeRunning = false;

/** Starts the always-on wake-word listener. Calls onWake once, then stops (restart after handling). */
export function startWake(onWake: () => void, onError: (msg: string) => void) {
  if (wakeRunning) return;
  wakeRunning = true;
  const child = spawnPs(WAKE);
  active = child;
  collect(child).then(({ out, err, code }) => {
    wakeRunning = false;
    if (active === child) active = null;
    if (out.includes('"wake"')) onWake();
    else if (code !== 0 && code !== null) onError(friendly(err));
    // code null = killed on purpose (mute / switching to dictation)
  });
}

export function stopWake() {
  stopActive();
  wakeRunning = false;
}

/** PowerShell reports errors as CLIXML on stderr; pull the readable message out of it. */
function readableError(raw: string): string {
  if (!raw.includes('CLIXML')) return raw;
  const msgs = [...raw.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)].map((m) =>
    m[1].replace(/_x000D_|_x000A_/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()
  );
  return msgs.filter(Boolean).join(' ').trim();
}

function friendly(raw: string, code?: number | null): string {
  const first = readableError(raw).split('\n')[0] || `the listener exited unexpectedly (code ${code ?? 'none'})`;
  if (/audio|device|microphone/i.test(first)) return 'I cannot access a microphone. Check Windows Settings > Privacy > Microphone.';
  if (/language|recognizer|culture/i.test(first)) return 'No Windows speech recognizer is installed for your language.';
  return `Speech recognition failed: ${first}`;
}

import { netFetch } from '../net';

export interface AzureSpeechOptions {
  key: string;
  region: string;
  language: string;
}

/**
 * Azure Speech "short audio" REST recognition (up to ~60 s of 16 kHz mono PCM WAV).
 * Returns null when nothing intelligible was heard; throws a readable Error on failure.
 */
export async function recognizeAzure(wav: Buffer, o: AzureSpeechOptions): Promise<string | null> {
  const region = o.region.trim().toLowerCase();
  const url =
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${encodeURIComponent(o.language)}&format=simple`;
  let res: Response;
  try {
    res = await netFetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': o.key.trim(),
        'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
        Accept: 'application/json'
      },
      body: new Uint8Array(wav)
    });
  } catch {
    throw new Error('I could not reach Azure Speech. Check your network.');
  }
  if (res.status === 401 || res.status === 403) throw new Error('Azure Speech rejected the key or region. Check Settings.');
  if (!res.ok) throw new Error(`Azure Speech returned an error (HTTP ${res.status}).`);
  const json = (await res.json()) as { RecognitionStatus?: string; DisplayText?: string };
  if (json.RecognitionStatus === 'Success') return json.DisplayText?.trim() || null;
  if (json.RecognitionStatus === 'NoMatch' || json.RecognitionStatus === 'InitialSilenceTimeout') return null;
  throw new Error(`Azure Speech could not process the audio (${json.RecognitionStatus ?? 'unknown'}).`);
}

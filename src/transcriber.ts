import { requestUrl } from "obsidian";

/**
 * Транскрипция через ElevenLabs Speech-to-Text (Scribe).
 * Используем requestUrl (идёт через главный процесс Electron) вместо fetch,
 * чтобы не упереться в CORS. multipart-тело собираем вручную.
 */
export async function transcribe(
  audio: Blob,
  apiKey: string,
  language: string
): Promise<string> {
  if (!apiKey) throw new Error("Не задан ElevenLabs API key (настройки плагина)");

  const boundary = "----VoiceCommandBoundary" + Date.now().toString(16);
  const body = await buildMultipartBody(boundary, audio, language);

  const resp = await requestUrl({
    url: "https://api.elevenlabs.io/v1/speech-to-text",
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
    throw: false,
  });

  if (resp.status !== 200) {
    throw new Error(`ElevenLabs API ${resp.status}: ${resp.text?.slice(0, 300)}`);
  }
  const text: string = resp.json?.text ?? "";
  if (!text.trim()) throw new Error("ElevenLabs вернул пустой транскрипт");
  return text.trim();
}

async function buildMultipartBody(
  boundary: string,
  audio: Blob,
  language: string
): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const parts: (Uint8Array | ArrayBuffer)[] = [];

  const field = (name: string, value: string) =>
    enc.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    );

  parts.push(field("model_id", "scribe_v1"));
  if (language) parts.push(field("language_code", language));

  parts.push(
    enc.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`
    )
  );
  parts.push(await audio.arrayBuffer());
  parts.push(enc.encode(`\r\n--${boundary}--\r\n`));

  const total = parts.reduce(
    (n, p) => n + (p instanceof ArrayBuffer ? p.byteLength : p.byteLength),
    0
  );
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    const bytes = p instanceof ArrayBuffer ? new Uint8Array(p) : p;
    out.set(bytes, offset);
    offset += bytes.byteLength;
  }
  return out.buffer;
}

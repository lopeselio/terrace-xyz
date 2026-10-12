/**
 * Ask an AI model to answer a closed yes/no football question, grounded with live web search.
 *
 * Runs inside a CRE node (HTTP capability), so it calls the providers' REST APIs directly:
 * the SDKs need a Node/browser fetch, which the workflow's WASM runtime doesn't have.
 *
 * Every node asks independently and the DON only accepts an answer they all agree on, so
 * a model that wavers simply produces no answer this run and the question is retried.
 */
import { ok, type HTTPSendRequester } from "@chainlink/cre-sdk";

export type AiProvider = "gemini" | "anthropic";
export type Verdict = "YES" | "NO" | "VOID" | "PENDING";

export type QuestionContext = {
  question: string;
  closedAt: string; // ISO time the question closed
  match?: string; // e.g. "Arsenal 2-1 Chelsea (Premier League, 2026-10-11)"
};

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** UTF-8 + base64 without TextEncoder/btoa, which the workflow runtime may lack. */
function toBase64(text: string): string {
  const bytes: number[] = [];
  for (const ch of text) {
    let cp = ch.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[n & 63] : "=";
  }
  return out;
}

/** UTF-8 decode + JSON.parse without TextDecoder. */
function fromBody(b: Uint8Array): unknown {
  let s = "";
  for (let i = 0; i < b.length; ) {
    const x = b[i++];
    let cp: number;
    if (x < 0x80) cp = x;
    else if (x < 0xe0) cp = ((x & 31) << 6) | (b[i++] & 63);
    else if (x < 0xf0) cp = ((x & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else cp = ((x & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    s += String.fromCodePoint(cp);
  }
  return JSON.parse(s);
}

export function prompt(ctx: QuestionContext): string {
  return [
    ctx.match
      ? "You settle prediction questions for a football app. The official match data below is the source of truth: answer from it. Search the web only if it can't settle the question."
      : "You settle prediction questions for a football app. Search the web for the facts, then answer.",
    "",
    `Question: ${ctx.question}`,
    `The question closed at: ${ctx.closedAt}`,
    ctx.match ? `Official match data:\n${ctx.match}` : "",
    "",
    "Reply with exactly one word:",
    "YES - the event clearly happened.",
    "NO - it clearly did not happen.",
    "PENDING - it is still too early to know (e.g. the match hasn't finished).",
    "VOID - the question is ambiguous, unanswerable, or the event was called off.",
    "If reliable sources disagree, reply VOID. Do not add any other text.",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

/** Pull the one-word verdict out of free text; anything else counts as PENDING (retry later). */
export function parseVerdict(text: string): Verdict {
  const word = text.trim().toUpperCase().match(/\b(YES|NO|VOID|PENDING)\b/g);
  return word && word.length > 0 ? (word[word.length - 1] as Verdict) : "PENDING";
}

function askAnthropic(send: HTTPSendRequester, apiKey: string, model: string, ctx: QuestionContext): Verdict {
  const body = {
    model,
    max_tokens: 16000,
    // Thinking is always on for this model family; a one-word ruling doesn't need much.
    output_config: { effort: "low" },
    // Route refusals to another model automatically instead of stopping.
    fallbacks: "default",
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
    messages: [{ role: "user", content: prompt(ctx) }],
  };
  const res = send
    .sendRequest({
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      multiHeaders: {
        "x-api-key": { values: [apiKey] },
        "anthropic-version": { values: ["2023-06-01"] },
        "anthropic-beta": { values: ["server-side-fallback-2026-07-01"] },
        "content-type": { values: ["application/json"] },
      },
      body: toBase64(JSON.stringify(body)),
      timeout: "60s",
    })
    .result();
  if (!ok(res)) throw new Error(`anthropic returned ${res.statusCode}`);

  const msg = fromBody(res.body) as { stop_reason?: string; content?: { type: string; text?: string }[] };
  // A refusal from the whole fallback chain, or a paused search turn: try again next run.
  if (msg.stop_reason === "refusal" || msg.stop_reason === "pause_turn") return "PENDING";
  const texts = (msg.content ?? []).filter((b) => b.type === "text" && b.text).map((b) => b.text!);
  return parseVerdict(texts[texts.length - 1] ?? "");
}

function askGemini(send: HTTPSendRequester, apiKey: string, model: string, ctx: QuestionContext): Verdict {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt(ctx) }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0 },
  };
  const res = send
    .sendRequest({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      method: "POST",
      multiHeaders: {
        "x-goog-api-key": { values: [apiKey] },
        "content-type": { values: ["application/json"] },
      },
      body: toBase64(JSON.stringify(body)),
      timeout: "60s",
    })
    .result();
  if (!ok(res)) throw new Error(`gemini returned ${res.statusCode}`);

  const out = fromBody(res.body) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (out.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join(" ");
  return parseVerdict(text);
}

/** Node-mode entry point: one model call, one verdict. */
export function askVerdict(
  send: HTTPSendRequester,
  provider: AiProvider,
  model: string,
  apiKey: string,
  ctx: QuestionContext,
): Verdict {
  return provider === "anthropic" ? askAnthropic(send, apiKey, model, ctx) : askGemini(send, apiKey, model, ctx);
}

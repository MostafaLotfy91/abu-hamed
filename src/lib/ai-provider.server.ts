// AI model for the shopping assistant and admin insights. Any OpenAI-compatible provider, chosen with env vars
// (server only, never VITE_):
//   AI_API_KEY    required; e.g. a free Google AI Studio key (https://aistudio.google.com/apikey)
//   AI_PROVIDER   "gemini" (default) | "groq" | "openrouter" | "openai"
//   AI_MODEL      optional; overrides the provider's default model
//   AI_BASE_URL   optional; any other OpenAI-compatible endpoint (then AI_PROVIDER is only a label)
//   AI_FALLBACK_MODELS  optional, Gemini only; comma-separated models tried when the main one is rate-limited
//                 (default gemini-flash-lite-latest; empty = none)
// Both features need tool calling; the defaults below support it on the free tiers.
import { createOpenAI } from "@ai-sdk/openai";

export const AI_PRESETS = {
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-flash-latest",
  },
  groq: { baseURL: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.3-70b-instruct:free",
  },
  openai: { baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
} as const;

export type AiProvider = keyof typeof AI_PRESETS;
export type AiConfig = {
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
  fallbackModels: string[];
};

/** Free-tier quotas are per model; this one has its own (larger) quota. */
const GEMINI_FALLBACK = "gemini-flash-lite-latest";

/** The configured provider, or null when AI_API_KEY is missing (the features then answer "not configured"). */
export function aiConfig(env: Record<string, string | undefined> = process.env): AiConfig | null {
  const apiKey = env["AI_API_KEY"]?.trim();
  if (!apiKey) return null;
  const name = (env["AI_PROVIDER"]?.trim().toLowerCase() || "gemini") as AiProvider;
  const preset = AI_PRESETS[name] ?? AI_PRESETS.gemini;
  const provider = AI_PRESETS[name] ? name : "gemini";
  const model = env["AI_MODEL"]?.trim() || preset.model;
  const fallbacks = env["AI_FALLBACK_MODELS"] ?? (provider === "gemini" ? GEMINI_FALLBACK : "");
  return {
    provider,
    baseURL: (env["AI_BASE_URL"]?.trim() || preset.baseURL).replace(/\/+$/, ""),
    apiKey,
    model,
    fallbackModels: fallbacks
      .split(",")
      .map((m) => m.trim())
      .filter((m) => m && m !== model),
  };
}

/** Chat-completions model (the endpoint every OpenAI-compatible provider implements, incl. tool calls). */
export function aiModel(cfg: AiConfig) {
  return createOpenAI({
    baseURL: cfg.baseURL,
    apiKey: cfg.apiKey,
    name: cfg.provider,
    fetch: cfg.provider === "gemini" ? geminiFetchFor(cfg.fallbackModels) : undefined,
  }).chat(cfg.model);
}

/** Schema keywords the Gemini OpenAI-compatible endpoint rejects ("Unknown name ..."). */
const GEMINI_UNSUPPORTED = new Set(["$schema", "additionalProperties"]);

/** Removes unsupported keywords from tool parameter schemas (recursively). Tool input is still validated by zod. */
export function stripUnsupportedSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUnsupportedSchema);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !GEMINI_UNSUPPORTED.has(k))
        .map(([k, v]) => [k, stripUnsupportedSchema(v)]),
    );
  return value;
}

/*
 * Gemini's OpenAI-compatible endpoint differs from OpenAI on tool calls:
 *  - streamed tool_calls may lack "index"/"type" and carry extra_content.google.thought_signature, which the AI
 *    SDK's strict chunk schema rejects ("Type validation failed");
 *  - newer models require that signature to be sent back with the tool call on the next step.
 * geminiFetch normalizes responses to OpenAI shape, remembers signatures by call id, and attaches them (or
 * Google's documented placeholder) when the conversation is sent back.
 */
const SKIP_SIGNATURE = "skip_thought_signature_validator";
const signatures = new Map<string, string>();
const rememberSignature = (id: string, sig: string) => {
  signatures.set(id, sig);
  if (signatures.size > 500) signatures.delete(signatures.keys().next().value!);
};

type ToolCallDelta = {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
  extra_content?: { google?: { thought_signature?: string } };
};
type Chunk = { choices?: { delta?: { tool_calls?: ToolCallDelta[] } }[] };

/** One streamed Gemini chunk in strict OpenAI shape (signatures recorded, extra fields removed). */
export function normalizeGeminiChunk<T>(chunk: T): T {
  for (const choice of (chunk as Chunk)?.choices ?? []) {
    const calls = choice?.delta?.tool_calls;
    if (!Array.isArray(calls)) continue;
    choice.delta!.tool_calls = calls.map((c, i) => {
      const id = c.id || `call_${Date.now().toString(36)}_${i}`;
      const sig = c.extra_content?.google?.thought_signature;
      if (sig) rememberSignature(id, sig);
      return {
        index: typeof c.index === "number" ? c.index : i,
        id,
        type: c.type ?? "function",
        function: { name: c.function?.name, arguments: c.function?.arguments ?? "" },
      };
    });
  }
  return chunk;
}

/** Request body for Gemini: clean tool schemas; tool calls sent back carry their thought signature. */
export function prepareGeminiRequest(body: string): string {
  try {
    const b = JSON.parse(body) as {
      tools?: { function?: { parameters?: unknown } }[];
      messages?: { role?: string; tool_calls?: ToolCallDelta[] }[];
    };
    for (const t of b.tools ?? [])
      if (t.function?.parameters)
        t.function.parameters = stripUnsupportedSchema(t.function.parameters);
    for (const m of b.messages ?? [])
      if (m.role === "assistant" && Array.isArray(m.tool_calls))
        for (const c of m.tool_calls)
          c.extra_content = {
            google: { thought_signature: (c.id && signatures.get(c.id)) || SKIP_SIGNATURE },
          };
    return JSON.stringify(b);
  } catch {
    return body; // not JSON: send unchanged
  }
}

/** Rewrites each `data: {...}` line of an SSE stream with normalizeGeminiChunk. */
function normalizeSse(stream: ReadableStream<Uint8Array>) {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = "";
  const fix = (line: string) => {
    const t = line.replace(/\r$/, "");
    if (!t.startsWith("data:")) return line;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") return line;
    try {
      return `data: ${JSON.stringify(normalizeGeminiChunk(JSON.parse(payload)))}`;
    } catch {
      return line;
    }
  };
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctl) {
        buf += dec.decode(chunk, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          ctl.enqueue(enc.encode(`${fix(buf.slice(0, i))}\n`));
          buf = buf.slice(i + 1);
        }
      },
      flush(ctl) {
        buf += dec.decode();
        if (buf) ctl.enqueue(enc.encode(fix(buf)));
      },
    }),
  );
}

/** Same request body with one field changed (undefined removes it); null when the body isn't JSON. */
function withField(body: string, key: string, value: unknown): string | null {
  try {
    return JSON.stringify({ ...JSON.parse(body), [key]: value });
  } catch {
    return null;
  }
}

/**
 * fetch for Gemini (see above), plus:
 *  - low reasoning effort (Flash otherwise "thinks" for seconds before every step); resent without it if a
 *    model rejects the setting;
 *  - free-tier quotas are per model, so on 429/503 the same request goes to each fallback model in turn.
 */
export function geminiFetchFor(fallbackModels: readonly string[] = []): typeof fetch {
  return async (input, init) => {
    const original = typeof init?.body === "string" ? prepareGeminiRequest(init.body) : null;
    let body =
      original && !original.includes('"reasoning_effort"')
        ? (withField(original, "reasoning_effort", "low") ?? original)
        : original;
    const send = (b: string | null) => fetch(input, b === null ? init : { ...init, body: b });

    let res = await send(body);
    if (res.status === 400 && body !== original) {
      await res.body?.cancel();
      body = original;
      res = await send(body);
    }
    for (const model of fallbackModels) {
      if (res.status !== 429 && res.status !== 503) break;
      const next = body && withField(body, "model", model);
      if (!next) break;
      const alt = await send(next);
      if (alt.ok || alt.status === 429 || alt.status === 503) {
        await res.body?.cancel();
        res = alt;
        body = next;
      } else await alt.body?.cancel(); // fallback model unavailable: keep the original answer
    }
    return normalizeResponse(res);
  };
}

/** fetch for Gemini with the default fallback model. */
export const geminiFetch: typeof fetch = geminiFetchFor([GEMINI_FALLBACK]);

function normalizeResponse(res: Response): Response {
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !res.body || !type.includes("text/event-stream")) return res;
  return new Response(normalizeSse(res.body), {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

/**
 * Supabase settings the AI endpoints need on the server. The VITE_ copies (which every deployment has) are used
 * when the server-only names aren't set.
 */
export function serverSupabaseEnv(env: Record<string, string | undefined> = process.env) {
  const url = env["SUPABASE_URL"] || env["VITE_SUPABASE_URL"];
  const anon = env["SUPABASE_PUBLISHABLE_KEY"] || env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  return { url, anon };
}

/** Names (never values) of the settings an AI endpoint is missing, for a clear "not configured" answer. */
export function missingAiSettings(env: Record<string, string | undefined> = process.env) {
  const { url, anon } = serverSupabaseEnv(env);
  return [
    ...(aiConfig(env) ? [] : ["AI_API_KEY"]),
    ...(url ? [] : ["SUPABASE_URL"]),
    ...(anon ? [] : ["SUPABASE_PUBLISHABLE_KEY"]),
  ];
}

/**
 * Short provider error for diagnostics in the error event (the UI still shows a friendly message). Provider
 * messages don't contain the key, but anything key-shaped is redacted anyway.
 */
export function safeReason(e: unknown): string | undefined {
  const err = e as {
    message?: string;
    responseBody?: string;
    lastError?: { message?: string };
  } | null;
  const text = err?.responseBody || err?.lastError?.message || err?.message;
  if (!text) return undefined;
  return text
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[key]")
    .replace(/\b(sk|gsk|sk-or)[-_][0-9A-Za-z_-]{10,}/g, "[key]")
    .replace(/\s+/g, " ")
    .slice(0, 300);
}

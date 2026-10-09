// AI model for the shopping assistant and admin insights. Any OpenAI-compatible provider, chosen with env vars
// (server only, never VITE_):
//   AI_API_KEY    required; e.g. a free Google AI Studio key (https://aistudio.google.com/apikey)
//   AI_PROVIDER   "gemini" (default) | "groq" | "openrouter" | "openai"
//   AI_MODEL      optional; overrides the provider's default model
//   AI_BASE_URL   optional; any other OpenAI-compatible endpoint (then AI_PROVIDER is only a label)
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
export type AiConfig = { provider: string; baseURL: string; apiKey: string; model: string };

/** The configured provider, or null when AI_API_KEY is missing (the features then answer "not configured"). */
export function aiConfig(env: Record<string, string | undefined> = process.env): AiConfig | null {
  const apiKey = env["AI_API_KEY"]?.trim();
  if (!apiKey) return null;
  const name = (env["AI_PROVIDER"]?.trim().toLowerCase() || "gemini") as AiProvider;
  const preset = AI_PRESETS[name] ?? AI_PRESETS.gemini;
  return {
    provider: AI_PRESETS[name] ? name : "gemini",
    baseURL: (env["AI_BASE_URL"]?.trim() || preset.baseURL).replace(/\/+$/, ""),
    apiKey,
    model: env["AI_MODEL"]?.trim() || preset.model,
  };
}

/** Chat-completions model (the endpoint every OpenAI-compatible provider implements, incl. tool calls). */
export function aiModel(cfg: AiConfig) {
  return createOpenAI({
    baseURL: cfg.baseURL,
    apiKey: cfg.apiKey,
    name: cfg.provider,
    fetch: cfg.provider === "gemini" ? geminiFetch : undefined,
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

/** fetch for Gemini: same request, with tool schemas cleaned of keywords it rejects. */
export const geminiFetch: typeof fetch = (input, init) => {
  if (typeof init?.body === "string" && init.body.includes('"tools"')) {
    try {
      const body = JSON.parse(init.body) as { tools?: { function?: { parameters?: unknown } }[] };
      for (const t of body.tools ?? [])
        if (t.function?.parameters)
          t.function.parameters = stripUnsupportedSchema(t.function.parameters);
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      /* not JSON: send unchanged */
    }
  }
  return fetch(input, init);
};

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

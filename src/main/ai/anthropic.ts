// Phase L Lane A — Anthropic Messages API wrapper.
//
// Single entry point for all AI calls from main. Reads the user's Claude API
// key from local-db settings (`AiSettingsRow.claudeKey`, populated via the
// Phase J.3 Settings → AI tab) — we never bundle a key in the build, never
// auto-inject from env. Cost goes against the user's own key.
//
// Two methods:
//   - generate(opts)            → Promise<string> (non-streaming, full body)
//   - generateStream(opts, cb)  → Promise<void>   (SSE chunks, reuses J.7 pattern)
//
// Both honour a 30s timeout (long-form completions for Listing Studio can
// take ~10s; we add headroom). On missing key → throws a deterministic
// `Error('Claude API key not configured — set in Settings → AI')` that the
// IPC handler surfaces verbatim to the renderer.
//
// Prompt caching: optionally attach `cache_control: { type: 'ephemeral' }`
// to the system prompt. This makes repeated calls with the same long system
// prompt (e.g. Listing Studio's task-specific system text) ~5x cheaper after
// the first hit. Caller opts in via `opts.cacheSystem = true`.

import { net } from 'electron';
import { localStore, DEFAULT_AI_SETTINGS } from '../local-db';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/** Default timeout — generous because Listing Studio long-form can take ~10s. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Soft cap on output tokens so a runaway model can't burn the user's quota. */
const DEFAULT_MAX_TOKENS = 1024;

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicGenerateOpts {
  /** Model id; defaults to local-db AiSettings.models.completion. */
  model?: string;
  /** System prompt; cached when `cacheSystem=true`. */
  system?: string;
  /** Conversation history. Must contain at least one user message. */
  messages: AnthropicMessage[];
  /** Output token cap. Defaults to 1024. */
  maxTokens?: number;
  /** Attach prompt-caching cache_control to system block. */
  cacheSystem?: boolean;
  /** Timeout override (ms). Defaults to 30s. */
  timeoutMs?: number;
}

/** Reads the configured key. Throws when empty so callers surface a clean error. */
function readKey(): string {
  const state = localStore.read();
  const key = (state.ai_settings ?? DEFAULT_AI_SETTINGS).claudeKey;
  if (!key || key.length === 0) {
    throw new Error('Claude API key not configured — set in Settings → AI');
  }
  return key;
}

/** Reads the default `completion` model from local-db settings. */
function defaultModel(): string {
  const state = localStore.read();
  const ai = state.ai_settings ?? DEFAULT_AI_SETTINGS;
  return ai.models?.completion || DEFAULT_AI_SETTINGS.models.completion;
}

function buildRequestBody(opts: AnthropicGenerateOpts, stream: boolean): unknown {
  const model = opts.model || defaultModel();
  const max_tokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const body: Record<string, unknown> = {
    model,
    max_tokens,
    messages: opts.messages,
    stream,
  };
  if (opts.system) {
    if (opts.cacheSystem) {
      body.system = [
        {
          type: 'text',
          text: opts.system,
          cache_control: { type: 'ephemeral' },
        },
      ];
    } else {
      body.system = opts.system;
    }
  }
  return body;
}

/** Extract the readable error message from a non-OK Anthropic response. */
async function readAnthropicError(res: Response): Promise<string> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    return `HTTP ${res.status}`;
  }
  if (!text) return `HTTP ${res.status}`;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string; type?: string } };
    const msg = parsed?.error?.message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  } catch {
    /* fall through */
  }
  return text.slice(0, 512);
}

/**
 * Non-streaming generation. Returns the concatenated text content from all
 * `text` content blocks in the assistant's response.
 *
 * Validation:
 *   - messages must be a non-empty array
 *   - each message must have valid role + non-empty string content
 * Throws on missing key, HTTP error, timeout, or unparseable response.
 */
export async function generate(opts: AnthropicGenerateOpts): Promise<string> {
  if (!Array.isArray(opts.messages) || opts.messages.length === 0) {
    throw new Error('anthropic.generate: messages must be a non-empty array');
  }
  for (const m of opts.messages) {
    if (m.role !== 'user' && m.role !== 'assistant') {
      throw new Error('anthropic.generate: each message must have role user|assistant');
    }
    if (typeof m.content !== 'string' || m.content.length === 0) {
      throw new Error('anthropic.generate: each message must have non-empty string content');
    }
  }

  const key = readKey();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': ANTHROPIC_VERSION,
  };

  let res: Response;
  try {
    res = await net.fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildRequestBody(opts, false)),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new Error(`Anthropic request timed out after ${timeoutMs}ms`);
    }
    throw new Error(
      `Anthropic request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    const errMsg = await readAnthropicError(res);
    throw new Error(`Anthropic API error (${res.status}): ${errMsg}`);
  }

  // Successful response shape:
  // { content: [{ type: 'text', text: '...' }, ...], stop_reason, usage, ... }
  let parsed: unknown;
  try {
    const text = await res.text();
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Anthropic response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Anthropic response was not an object');
  }
  const content = (parsed as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    throw new Error('Anthropic response missing content array');
  }
  const textParts: string[] = [];
  for (const block of content) {
    if (
      block &&
      typeof block === 'object' &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
    ) {
      textParts.push((block as { text: string }).text);
    }
  }
  return textParts.join('').trim();
}

/**
 * Streaming generation. Calls `onChunk(text)` for each `content_block_delta`
 * SSE event carrying a `text_delta`. Resolves when the stream completes
 * (`message_stop`). Rejects on auth / network failure.
 *
 * Caller is responsible for plumbing chunks back to the renderer (e.g. via
 * `AiStreamChunk` IPC). This wrapper only emits the text deltas — we hide the
 * raw SSE shape, but the underlying pattern mirrors Phase J.7's AI Advisor.
 */
export async function generateStream(
  opts: AnthropicGenerateOpts,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!Array.isArray(opts.messages) || opts.messages.length === 0) {
    throw new Error('anthropic.generateStream: messages must be a non-empty array');
  }
  const key = readKey();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await net.fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
        accept: 'text/event-stream',
      },
      body: JSON.stringify(buildRequestBody(opts, true)),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      throw new Error(`Anthropic stream timed out after ${timeoutMs}ms`);
    }
    throw new Error(
      `Anthropic stream failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    clearTimeout(timeoutId);
    const errMsg = await readAnthropicError(res);
    throw new Error(`Anthropic API error (${res.status}): ${errMsg}`);
  }

  if (!res.body) {
    clearTimeout(timeoutId);
    throw new Error('Anthropic response missing body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIdx = buffer.indexOf('\n\n');
      while (separatorIdx >= 0) {
        const event = buffer.slice(0, separatorIdx);
        buffer = buffer.slice(separatorIdx + 2);
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const dataPart = line.slice(5).trimStart();
          if (!dataPart || dataPart === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataPart) as {
              type?: string;
              delta?: { type?: string; text?: string };
            };
            if (
              parsed?.type === 'content_block_delta' &&
              parsed.delta?.type === 'text_delta' &&
              typeof parsed.delta.text === 'string'
            ) {
              onChunk(parsed.delta.text);
            }
          } catch {
            /* skip malformed line */
          }
        }
        separatorIdx = buffer.indexOf('\n\n');
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// Phase L Lane A — tests for the Anthropic wrapper.
//
// We mock both `electron` (for `net.fetch`) and `../local-db` (for `localStore`)
// so the tests run in a pure node environment without touching disk or network.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks must be hoisted before the SUT import. ---
// We use `vi.hoisted` so the mock factories can reference the same shared
// state objects that the test cases mutate later. Without hoisting, vitest's
// transform would put the `vi.mock()` calls above the variable declarations
// and throw a ReferenceError at import time.

const hoisted = vi.hoisted(() => {
  const fetchMock = vi.fn();
  const mockState = {
    ai_settings: {
      claudeKey: 'sk-test-key',
      models: {
        completion: 'claude-opus-4-7',
        vision: 'claude-opus-4-7',
        fast: 'claude-haiku-4-5',
        advisor: 'claude-opus-4-7',
      },
      brandVoice: { pov: '', toneWords: [] as string[], bannedWords: [] as string[] },
    },
  };
  return { fetchMock, mockState };
});

const { fetchMock, mockState } = hoisted;

vi.mock('electron', () => ({
  net: { fetch: (...args: unknown[]) => hoisted.fetchMock(...args) },
}));

vi.mock('../../local-db', () => ({
  localStore: { read: () => hoisted.mockState },
  DEFAULT_AI_SETTINGS: hoisted.mockState.ai_settings,
}));

// SUT import comes after the mocks.
import { generate } from '../anthropic';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('anthropic.generate', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    // Reset the key to "configured" for the happy paths.
    mockState.ai_settings.claudeKey = 'sk-test-key';
  });

  it('throws a clear error when the Claude API key is not configured', async () => {
    mockState.ai_settings.claudeKey = '';
    await expect(
      generate({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/Claude API key not configured.*Settings.*AI/);
    // We never hit fetch when the key is missing.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the concatenated text content from a successful response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        content: [
          { type: 'text', text: 'A Thrilling New Adventure' },
          { type: 'text', text: '\nRationale: bold action verbs.' },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 8 },
      }),
    );

    const result = await generate({
      system: 'be concise',
      messages: [{ role: 'user', content: 'rewrite title for B0XYZ' }],
    });

    expect(result).toContain('A Thrilling New Adventure');
    expect(result).toContain('Rationale');

    // Verify request shape: correct URL + headers + body.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['content-type']).toBe('application/json');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('claude-opus-4-7');
    expect(body.system).toBe('be concise');
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([{ role: 'user', content: 'rewrite title for B0XYZ' }]);
  });

  it('surfaces a useful error when Anthropic responds with 401', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        error: { type: 'authentication_error', message: 'Invalid API key' },
      }),
    );

    await expect(
      generate({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/Anthropic API error \(401\).*Invalid API key/);
  });

  it('wraps a cached system block when cacheSystem=true', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { content: [{ type: 'text', text: 'ok' }] }),
    );

    await generate({
      system: 'long stable system prompt',
      messages: [{ role: 'user', content: 'go' }],
      cacheSystem: true,
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(Array.isArray(body.system)).toBe(true);
    expect(body.system[0]).toEqual({
      type: 'text',
      text: 'long stable system prompt',
      cache_control: { type: 'ephemeral' },
    });
  });
});

// Phase R — telemetry transport: essential (always-on, PII-free) vs optional
// (consent-gated) routing, and the packaged → /api/events forward.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  appState: { isPackaged: true },
  readToken: vi.fn(async () => 'tok' as string | null),
  performApiRequest: vi.fn(async () => ({ ok: true, status: 201, data: { ok: true } })),
}));

// `app` is the SAME object reference the module captures at import; mutating
// appState.isPackaged is visible because track() reads app.isPackaged per call.
vi.mock('electron', () => ({ app: hoisted.appState }));
vi.mock('../auth-store', () => ({ readToken: hoisted.readToken }));
vi.mock('../api-client', () => ({ performApiRequest: hoisted.performApiRequest }));

import { track, setConsent } from '../telemetry';

// track() forwards fire-and-forget (void async); let those microtasks settle.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  hoisted.appState.isPackaged = true;
  hoisted.readToken.mockReset().mockResolvedValue('tok');
  hoisted.performApiRequest.mockReset().mockResolvedValue({ ok: true, status: 201, data: { ok: true } });
  setConsent(false); // optional tier default OFF
});

describe('telemetry transport', () => {
  it('forwards essential activation events even with consent OFF (packaged)', async () => {
    track({ name: 'feature.activation.enable', props: { module: 'analytics', source: 'user', ts: 1 } });
    await flush();
    expect(hoisted.performApiRequest).toHaveBeenCalledTimes(1);
    expect(hoisted.performApiRequest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/events',
      body: { name: 'feature.activation.enable', props: { module: 'analytics', source: 'user', ts: 1 } },
    });
  });

  it('does NOT forward optional events without consent', async () => {
    track({ name: 'ai.generate.title', props: { ok: true } });
    await flush();
    expect(hoisted.performApiRequest).not.toHaveBeenCalled();
  });

  it('optional events with consent ON still do not hit /api/events (Sentry deferred)', async () => {
    setConsent(true);
    track({ name: 'ai.generate.title', props: {} });
    await flush();
    expect(hoisted.performApiRequest).not.toHaveBeenCalled();
  });

  it('dev (not packaged) does not transport — console.debug only', async () => {
    hoisted.appState.isPackaged = false;
    track({ name: 'feature.activation.reset', props: { ts: 1 } });
    await flush();
    expect(hoisted.performApiRequest).not.toHaveBeenCalled();
  });

  it('skips transport when signed out (no token) — no 401/refresh provoked', async () => {
    hoisted.readToken.mockResolvedValue(null);
    track({ name: 'feature.activation.enable', props: { module: 'ai', source: 'user' } });
    await flush();
    expect(hoisted.readToken).toHaveBeenCalled();
    expect(hoisted.performApiRequest).not.toHaveBeenCalled();
  });

  it('ignores an empty event name', async () => {
    track({ name: '' });
    await flush();
    expect(hoisted.performApiRequest).not.toHaveBeenCalled();
  });
});

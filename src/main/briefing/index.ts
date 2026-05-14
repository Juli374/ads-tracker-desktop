// Phase M.5 Lane E — Weekly Author Briefing main-process singleton.
//
// Wires `WeeklyBriefer` to production dependencies:
//   - HTTP   = performApiRequest (proxy-aware + Bearer-auth)
//   - AI     = anthropic.generate (reads claude key from local-db)
//   - Store  = localStore.mutate (atomic JSON write with FIFO cap)
//   - Notify = Electron Notification (native toast)
//   - Push   = BrowserWindow.getAllWindows + webContents.send
//
// Re-exports the singleton so IPC handlers (and tests via setInstance) have
// a single source of truth.
//
// Email integration is intentionally NOT wired here. See
// `docs/electron-migration/email-integration.md` for the design — wiring
// would slot into `notifyFn` (call SendGrid/Resend after the Notification
// fires).

import { BrowserWindow, Notification } from 'electron';
import {
  WeeklyBriefer,
  type BrieferDeps,
  type BriefingAiGenerateFn,
} from './briefer';
import {
  localStore,
  BRIEFING_HISTORY_CAP,
  DEFAULT_AI_SETTINGS,
  type WeeklyBriefingRow,
} from '../local-db';
import { performApiRequest } from '../api-client';
import { generate as anthropicGenerate } from '../ai/anthropic';
import { IpcChannel, type WeeklyBriefing } from '../../shared/ipc';

let instance: WeeklyBriefer | null = null;

/**
 * Production wiring. Idempotent — repeat calls return the same instance.
 */
export function getWeeklyBriefer(): WeeklyBriefer {
  if (instance) return instance;

  /**
   * Anthropic invocation. We use a small `maxTokens` cap (≈900) because the
   * briefing is bounded to ~280 words. cacheSystem=true lets prompt-caching
   * amortise the system prompt across weeks; weekly cadence means each call
   * is a fresh `digest` so only the system block hits cache.
   */
  const aiGenerateFn: BriefingAiGenerateFn = async (opts) => {
    const aiSettings = localStore.read().ai_settings ?? DEFAULT_AI_SETTINGS;
    const model = aiSettings.models?.completion || DEFAULT_AI_SETTINGS.models.completion;
    const text = await anthropicGenerate({
      model,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      maxTokens: 900,
      cacheSystem: opts.cacheSystem,
    });
    return { text, model };
  };

  const deps: BrieferDeps = {
    fetchFn: performApiRequest,
    aiGenerateFn,
    notifyFn: (briefing: WeeklyBriefing) => {
      try {
        if (typeof Notification?.isSupported !== 'function' || !Notification.isSupported()) {
          return;
        }
        const body = briefing.content
          ? briefing.content.slice(0, 240) + (briefing.content.length > 240 ? '…' : '')
          : 'Open Ads Tracker to read your briefing.';
        const n = new Notification({
          title: 'Your weekly briefing',
          body,
          silent: false,
        });
        // Click-to-focus the main window. Best-effort — don't crash if no
        // window is open.
        n.on('click', () => {
          const windows = BrowserWindow.getAllWindows();
          const win = windows.find((w) => !w.isDestroyed());
          if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
          }
        });
        n.show();
      } catch {
        // ignore — never crash main on notification failure
      }
    },
    emitChange: (briefing) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          try {
            win.webContents.send(IpcChannel.BriefingChanged, briefing);
          } catch {
            // ignore: window may have closed between checks
          }
        }
      }
    },
    appendBriefing: (partial) => {
      let stored: WeeklyBriefingRow | null = null;
      localStore.mutate((state) => {
        const id = state.next_briefing_id ?? 1;
        const row: WeeklyBriefingRow = { id, ...partial };
        const list = Array.isArray(state.weekly_briefings) ? state.weekly_briefings : [];
        list.push(row);
        // FIFO cap: drop oldest until length ≤ CAP. We sort defensively in
        // case the list grew out of order.
        if (list.length > BRIEFING_HISTORY_CAP) {
          list.sort((a, b) => a.generated_at.localeCompare(b.generated_at));
          while (list.length > BRIEFING_HISTORY_CAP) list.shift();
        }
        state.weekly_briefings = list;
        state.next_briefing_id = id + 1;
        stored = row;
      });
      if (!stored) {
        // Defensive: mutate's update callback always runs, so this can't
        // realistically happen. Surface a clear error if it does.
        throw new Error('appendBriefing failed to store row');
      }
      return stored;
    },
    listBriefings: () => {
      const state = localStore.read();
      return Array.isArray(state.weekly_briefings) ? state.weekly_briefings : [];
    },
    readBrandVoice: () => {
      const aiSettings = localStore.read().ai_settings ?? DEFAULT_AI_SETTINGS;
      const bv = aiSettings.brandVoice;
      if (!bv) return undefined;
      return {
        pov: bv.pov,
        toneWords: bv.toneWords,
        bannedWords: bv.bannedWords,
      };
    },
  };

  instance = new WeeklyBriefer(deps);
  return instance;
}

/** Tests only — replace the singleton (or reset to null). */
export function setInstance(next: WeeklyBriefer | null): void {
  if (instance && instance !== next) {
    instance.stop();
  }
  instance = next;
}

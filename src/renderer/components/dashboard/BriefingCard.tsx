// Phase M.5 Lane E — dashboard widget showing the latest weekly briefing.
//
// Compact summary tile: heading, first ~120 chars of the briefing, "View full
// briefing" button. When no briefing has been generated yet (or the user is
// on `start` tier), we render a discreet Pro-tier nudge instead.
//
// We do not fetch the briefing on every Dashboard mount — the latest briefing
// is small (under a few KB) and lives on disk, so the read is sync-fast. We
// also subscribe to `briefing.onChange` so the card auto-updates when a new
// briefing lands (background cron or manual runNow from BriefingPage).

import React, { useEffect, useState } from 'react';
import { Sparkles, Lock, Loader2, AlertTriangle } from 'lucide-react';
import { Card } from '../ui';
import { useEntitlement } from '../../hooks/useEntitlement';
import { useNav } from '../../contexts/NavContext';
import { LockedFeature } from '../LockedFeature';
import type { WeeklyBriefing } from '../../../shared/ipc';

/**
 * Truncate `content` to the first paragraph + ~140 chars cap. We avoid mid-word
 * cuts by trimming back to the previous space.
 */
function summarise(content: string, limit = 140): string {
  if (!content) return '';
  const firstPara = content.split(/\n\n+/, 1)[0] ?? content;
  if (firstPara.length <= limit) return firstPara.trim();
  const slice = firstPara.slice(0, limit);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim() + '…';
}

function fmtRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const diff = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return 'today';
  if (diff < 2 * day) return 'yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  return iso.slice(0, 10);
}

export const BriefingCard: React.FC = () => {
  const { on, tierRequired } = useEntitlement('ai.weekly_briefing');
  const { navigate } = useNav();
  const [briefing, setBriefing] = useState<WeeklyBriefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void window.api.briefing
      .getLast()
      .then((b) => {
        if (cancelled) return;
        setBriefing(b);
      })
      .catch(() => {
        // We swallow — empty state is the same UX as "failed to load latest".
        if (!cancelled) setBriefing(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribe to push events so the card refreshes when main writes a new
  // briefing (cron fire or manual runNow).
  useEffect(() => {
    if (!window.api.briefing?.onChange) return undefined;
    return window.api.briefing.onChange((next) => setBriefing(next));
  }, []);

  // Locked card — Pro upsell. We re-use LockedFeature so click-through opens
  // the standard UpgradeModal.
  if (!on) {
    return (
      <Card
        title={
          <span className="flex items-center gap-2">
            <Sparkles size={14} className="text-amber-500" />
            Weekly briefing
          </span>
        }
        bodyClassName="px-5 py-4"
        data-testid="briefing-card-locked"
      >
        <div className="space-y-3">
          <p className="text-sm text-zinc-600">
            Get a personalised 250-word briefing every Sunday: top movers,
            underperformers, and 5 suggested actions.
          </p>
          <LockedFeature feature="ai.weekly_briefing" mode="dim">
            <button
              type="button"
              data-testid="briefing-card-upgrade"
              className="
                inline-flex items-center gap-1.5 px-3 h-7 rounded-md
                text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600
              "
            >
              <Lock size={11} />
              Unlock ({tierRequired === 'business' ? 'Business' : 'Pro'})
            </button>
          </LockedFeature>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={14} className="text-amber-500" />
          Weekly briefing
        </span>
      }
      rightSlot={
        briefing && (
          <span className="text-[11px] text-zinc-500">
            {fmtRelative(briefing.generated_at)}
          </span>
        )
      }
      bodyClassName="px-5 py-4"
      data-testid="briefing-card"
    >
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 size={12} className="animate-spin" />
          Loading…
        </div>
      ) : !briefing ? (
        <div className="space-y-3" data-testid="briefing-card-empty">
          <p className="text-sm text-zinc-600">
            You don&apos;t have a briefing yet. Generate one to see your week
            at a glance.
          </p>
          <button
            type="button"
            data-testid="briefing-card-open-empty"
            onClick={() => navigate('briefing')}
            className="
              inline-flex items-center gap-1.5 px-3 h-7 rounded-md text-xs
              font-medium text-amber-700 bg-amber-50 hover:bg-amber-100
            "
          >
            <Sparkles size={11} />
            Generate now
          </button>
        </div>
      ) : briefing.error ? (
        <div
          className="space-y-2"
          data-testid="briefing-card-error"
        >
          <div className="inline-flex items-start gap-1.5 px-2 py-1 rounded border border-amber-300 bg-amber-50 text-[11px] text-amber-900">
            <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
            <span>{briefing.error}</span>
          </div>
          <button
            type="button"
            data-testid="briefing-card-open-error"
            onClick={() => navigate('briefing')}
            className="
              inline-flex items-center gap-1.5 px-3 h-7 rounded-md text-xs
              font-medium text-zinc-700 border border-zinc-300 hover:bg-zinc-50
            "
          >
            Open briefing
          </button>
        </div>
      ) : (
        <div className="space-y-3" data-testid="briefing-card-content">
          <p className="text-sm text-zinc-700 line-clamp-3">
            {summarise(briefing.content)}
          </p>
          <button
            type="button"
            data-testid="briefing-card-open"
            onClick={() => navigate('briefing')}
            className="
              inline-flex items-center gap-1.5 px-3 h-7 rounded-md text-xs
              font-medium text-zinc-700 border border-zinc-300 hover:bg-zinc-50
            "
          >
            View full briefing
          </button>
        </div>
      )}
    </Card>
  );
};

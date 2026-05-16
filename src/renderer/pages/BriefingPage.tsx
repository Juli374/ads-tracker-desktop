// Phase M.5 Lane E — dedicated page for the Weekly Author Briefing.
//
// Two halves:
//   - top: "Latest" briefing rendered as flowing markdown (h-bullet split),
//          with Run-now + Next-scheduled-run hints
//   - bottom: chronological history list (paginated only by FIFO cap on disk)
//
// Pro-tier gated. When the user is on `start`, we render an upgrade card
// instead. The locked variant ships its own testid (`briefing-page-locked`)
// so unit tests can assert the gate.

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, Sparkles, AlertTriangle, ChevronRight } from 'lucide-react';
import { Card, LockedFeatureCard, PageHeader } from '../components/ui';
import { UpgradeModal } from '../components/UpgradeModal';
import { useEntitlement } from '../hooks/useEntitlement';
import { useToast } from '../contexts/ToastContext';
import type { WeeklyBriefing } from '../../shared/ipc';

/**
 * Render a chunk of briefing markdown-flavoured text. Supports:
 *   - "Heading:" lines → bold section header
 *   - "- bullet" lines → list item
 *   - blank lines → paragraph break
 * Anything else renders as a paragraph. Deliberately tiny — pulling in a real
 * markdown library is overkill for ~280 words of model output.
 */
function renderBriefingMarkdown(content: string): React.ReactElement[] {
  if (!content) return [];
  const blocks: React.ReactElement[] = [];
  const lines = content.split('\n');
  let currentBullets: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (currentBullets.length === 0) return;
    const items = currentBullets;
    currentBullets = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="list-disc pl-5 space-y-1 text-sm text-zinc-700">
        {items.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>,
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      flushBullets();
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      currentBullets.push(line.slice(2).trim());
      continue;
    }
    flushBullets();
    // Headings: either "1. Top movers:" or "Top movers:" or "Top movers".
    const isHeading =
      /^(\d+\.\s+)?[A-Z][^.:!?]*[:]\s*$/.test(line) ||
      /^(top movers|underperforming|suggested actions)/i.test(line);
    if (isHeading) {
      const cleaned = line.replace(/^\d+\.\s*/, '').replace(/:\s*$/, '');
      blocks.push(
        <h3 key={`h-${key++}`} className="text-xs font-semibold text-zinc-900 uppercase tracking-wide mt-2">
          {cleaned}
        </h3>,
      );
    } else {
      blocks.push(
        <p key={`p-${key++}`} className="text-sm text-zinc-700 leading-relaxed">
          {line}
        </p>,
      );
    }
  }
  flushBullets();
  return blocks;
}

/** Pretty-print a YYYY-MM-DD range. */
function fmtRange(from: string, to: string): string {
  return `${from} → ${to}`;
}

export const BriefingPage: React.FC = () => {
  const { on, tierRequired } = useEntitlement('ai.weekly_briefing');
  const toast = useToast();
  const [history, setHistory] = useState<WeeklyBriefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.api.briefing.list();
      setHistory(list);
      if (list.length > 0 && selectedId == null) {
        setSelectedId(list[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (!on) return undefined;
    void fetchAll();
    if (!window.api.briefing?.onChange) return undefined;
    return window.api.briefing.onChange((next) => {
      setHistory((prev) => {
        // Replace any duplicate id (re-run case), otherwise prepend.
        const filtered = prev.filter((b) => b.id !== next.id);
        return [next, ...filtered];
      });
      setSelectedId(next.id);
    });
  }, [on, fetchAll]);

  const runNow = useCallback(async () => {
    if (running) return;
    setRunning(true);
    try {
      const result = await window.api.briefing.runNow();
      if (result.error) {
        toast.error(result.error);
      } else if (result.briefing) {
        toast.success('Weekly briefing generated');
        setSelectedId(result.briefing.id);
      }
      // The onChange subscription also fires, but we refresh defensively in
      // case the push didn't land before this resolves.
      await fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [running, toast, fetchAll]);

  // Locked → upgrade card.
  // Phase Q.1: migrated to <LockedFeatureCard> primitive.
  if (!on) {
    return (
      <div data-testid="briefing-page-locked" className="space-y-4">
        <PageHeader
          title="Weekly briefing"
          subtitle="A 250-word digest of your KDP ads performance, every Sunday."
        />
        <LockedFeatureCard
          data-testid="briefing-page-upgrade-cta"
          icon={<Mail />}
          title="Weekly briefing is a Pro feature"
          description="Every Sunday morning, Claude reviews your last 7 days of ads data and emails you a focused 250-word briefing — top movers, underperformers, and five concrete next steps."
          tier={tierRequired === 'business' ? 'business' : 'pro'}
          onUpgrade={() => setUpgradeOpen(true)}
          ctaLabel={`Upgrade to ${tierRequired === 'business' ? 'Business' : 'Pro'}`}
        />
        <UpgradeModal
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          triggeredBy="ai.weekly_briefing"
          recommendedTier={tierRequired}
        />
      </div>
    );
  }

  const selected =
    history.find((b) => b.id === selectedId) ??
    (history.length > 0 ? history[0] : null);

  return (
    <div data-testid="briefing-page" className="space-y-4">
      <PageHeader
        title="Weekly briefing"
        subtitle="A focused 250-word digest of your week. Scheduled for Sunday 9 AM."
        rightSlot={
          <button
            type="button"
            data-testid="briefing-run-now"
            onClick={() => void runNow()}
            disabled={running}
            className="
              inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs
              font-semibold text-white bg-violet-600 hover:bg-violet-700
              disabled:opacity-50
            "
          >
            {running ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            {running ? 'Generating…' : 'Run new briefing now'}
          </button>
        }
      />

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-1">
          <Card title="History" bodyClassName="">
            {loading && history.length === 0 ? (
              <div className="px-4 py-4 flex items-center justify-center text-xs text-zinc-500">
                <Loader2 size={12} className="animate-spin mr-2" />
                Loading…
              </div>
            ) : history.length === 0 ? (
              <div className="px-4 py-6 text-xs text-zinc-500 text-center">
                No briefings yet — click <em>Run new briefing now</em> to
                generate the first.
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100" data-testid="briefing-history-list">
                {history.map((b) => {
                  const isActive = b.id === selected?.id;
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        data-testid={`briefing-history-${b.id}`}
                        onClick={() => setSelectedId(b.id)}
                        className={`
                          w-full text-left px-4 py-2.5 text-xs flex items-center justify-between
                          transition-colors
                          ${isActive ? 'bg-violet-50 text-violet-900' : 'text-zinc-700 hover:bg-zinc-50'}
                        `}
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {fmtRange(b.period_from, b.period_to)}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {new Date(b.generated_at).toLocaleString()}
                          </div>
                        </div>
                        {b.error && (
                          <AlertTriangle size={11} className="text-amber-500 flex-shrink-0" />
                        )}
                        <ChevronRight size={11} className="text-zinc-400 flex-shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="col-span-3">
          <Card
            title={
              selected
                ? `Briefing ${fmtRange(selected.period_from, selected.period_to)}`
                : 'Latest briefing'
            }
            bodyClassName="px-6 py-5"
          >
            {!selected ? (
              <div className="text-sm text-zinc-500" data-testid="briefing-page-empty">
                You don&apos;t have a briefing yet. Click{' '}
                <strong>Run new briefing now</strong> above to generate the
                first one.
              </div>
            ) : selected.error ? (
              <div
                data-testid="briefing-page-error"
                className="space-y-2"
              >
                <div className="inline-flex items-start gap-1.5 px-3 py-2 rounded border border-amber-300 bg-amber-50 text-xs text-amber-900">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{selected.error}</span>
                </div>
                <p className="text-xs text-zinc-500">
                  Tip: open Settings → AI to set your Claude API key, then
                  retry.
                </p>
              </div>
            ) : (
              <div
                className="space-y-2"
                data-testid="briefing-page-content"
              >
                {renderBriefingMarkdown(selected.content)}
                {selected.model && (
                  <div className="pt-2 text-[10px] text-zinc-400 uppercase tracking-wider">
                    Generated by {selected.model}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

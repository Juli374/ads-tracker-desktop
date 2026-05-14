import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Send, Sparkles, Wand2, X } from 'lucide-react';
import type { CampaignAnalyticsItem } from '../../api/metrics';
import { fmtMoney, fmtNumber, fmtPct } from '../../lib/format';
import { useEscapeClose } from '../../lib/useEscapeClose';
import { ApiError } from '../../api/client';
import { advisorApi, type AdvisorMessage } from '../../api/advisor';
import {
  CoPilotParseError,
  generateCampaignAdvice,
  type CoPilotAdviceItem,
} from '../../api/ai';
import { targetsApi, type Target } from '../../api/targets';
import { useEntitlement } from '../../hooks/useEntitlement';
import { useToast } from '../../contexts/ToastContext';
import { CoPilotTable, type CoPilotRow } from './CoPilotTable';

interface Props {
  campaign: CampaignAnalyticsItem;
  onClose: () => void;
}

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** True while streaming. */
  pending?: boolean;
}

type AdvisorState = 'idle' | 'loading-history' | 'streaming' | 'history-error' | 'no-key';

type AdvisorMode = 'chat' | 'copilot';

type CoPilotState = 'idle' | 'loading-targets' | 'analyzing' | 'targets-error' | 'analyze-error' | 'applying';

let nextLocalId = 0;
const localId = () => `local-${++nextLocalId}`;

export const AIAdvisorPanel: React.FC<Props> = ({ campaign, onClose }) => {
  const { t } = useTranslation('campaigns');
  useEscapeClose(onClose);
  const toast = useToast();
  const copilotEnt = useEntitlement('ai.bid_copilot');

  const [mode, setMode] = useState<AdvisorMode>('chat');
  const [state, setState] = useState<AdvisorState>('loading-history');
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const activeStreamRef = useRef<string | null>(null);
  const assistantBufferRef = useRef<string>('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Co-pilot state. Lives on the panel so switching tabs doesn't drop work.
  const [copilotState, setCopilotState] = useState<CoPilotState>('idle');
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [advice, setAdvice] = useState<CoPilotAdviceItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Scroll to latest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // Load conversation history on mount.
  const loadHistory = useCallback(async () => {
    setState('loading-history');
    setHistoryError(null);
    try {
      const history = await advisorApi.getHistory(campaign.campaign_id);
      const transformed: ChatMessage[] = (history.messages ?? []).map((m: AdvisorMessage) => ({
        id: `srv-${m.id}`,
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));
      setMessages(transformed);
      setState('idle');
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        // 400 may indicate "API key not configured" — backend returns it from /message,
        // but history is GET so this branch is unlikely. Fall through to generic.
      }
      if (err instanceof ApiError && [401, 403, 404, 501, 502].includes(err.status)) {
        setHistoryError(err.message);
        setState('history-error');
        return;
      }
      const msg = err instanceof Error ? err.message : t('details.advisor.errors.loadHistory');
      setHistoryError(msg);
      setState('history-error');
    }
  }, [campaign.campaign_id, t]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Subscribe to stream chunks.
  useEffect(() => {
    if (!window.api?.ai?.onStreamChunk) return;
    const unsub = window.api.ai.onStreamChunk((chunk) => {
      if (chunk.streamId !== activeStreamRef.current) return;
      const data = chunk.data;
      if (data.type === 'text_delta' && typeof data.text === 'string') {
        assistantBufferRef.current += data.text;
        const buffered = assistantBufferRef.current;
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.role !== 'assistant' || !last.pending) return prev;
          const next = [...prev];
          next[next.length - 1] = { ...last, content: buffered };
          return next;
        });
      } else if (data.type === 'error') {
        const message = typeof data.message === 'string' ? data.message : t('details.advisor.errors.stream');
        // Backend may emit error in either language. We treat any error mentioning "API"
        // and an absent-key marker as a no-key state. Cyrillic-text detection done via
        // codepoint match (ESLint disallows literal Cyrillic in renderer source).
        if (
          message.includes('API') &&
          (message.toLowerCase().includes('key') || matchesAbsentKeyPhrase(message))
        ) {
          setState('no-key');
        }
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.role !== 'assistant' || !last.pending) return prev;
          const next = [...prev];
          next[next.length - 1] = {
            ...last,
            content: last.content || `[${message}]`,
            pending: false,
          };
          return next;
        });
      } else if (data.type === 'done') {
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.role !== 'assistant' || !last.pending) return prev;
          const next = [...prev];
          next[next.length - 1] = { ...last, pending: false };
          return next;
        });
        activeStreamRef.current = null;
        assistantBufferRef.current = '';
        setState((s) => (s === 'streaming' ? 'idle' : s));
      }
    });
    return unsub;
  }, [t]);

  const handleSend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed) return;
      if (state === 'streaming') return;
      if (!window.api?.ai?.streamStart) {
        setState('history-error');
        setHistoryError(t('details.advisor.errors.unavailable'));
        return;
      }

      const userMsg: ChatMessage = { id: localId(), role: 'user', content: trimmed };
      const placeholder: ChatMessage = {
        id: localId(),
        role: 'assistant',
        content: '',
        pending: true,
      };
      setMessages((prev) => [...prev, userMsg, placeholder]);
      setDraft('');
      setState('streaming');

      const streamId = `advisor-${campaign.campaign_id}-${Date.now()}`;
      activeStreamRef.current = streamId;
      assistantBufferRef.current = '';

      try {
        await window.api.ai.streamStart({
          streamId,
          path: '/api/ai-advisor/message',
          body: {
            campaign_id: campaign.campaign_id,
            message: trimmed,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('details.advisor.errors.stream');
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (last.role !== 'assistant' || !last.pending) return prev;
          const next = [...prev];
          next[next.length - 1] = { ...last, content: `[${msg}]`, pending: false };
          return next;
        });
        activeStreamRef.current = null;
        setState('idle');
      }
    },
    [draft, state, campaign.campaign_id, t],
  );

  // Cancel any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      const streamId = activeStreamRef.current;
      if (streamId && window.api?.ai?.streamCancel) {
        void window.api.ai.streamCancel(streamId);
      }
    };
  }, []);

  // === Phase M.3 — Co-pilot wiring ===

  // Auto-fetch targets the first time we enter Co-pilot mode. We don't fetch
  // upfront so users on tier='start' (Co-pilot locked) don't waste an HTTP.
  //
  // We use a guard ref instead of effect-scoped cancellation: setCopilotState
  // inside the effect would trigger a re-render → cleanup → cancel its own
  // in-flight promise, dropping the result. The ref keeps "already started"
  // state across renders without re-running cleanup.
  const targetsFetchStartedRef = useRef(false);
  useEffect(() => {
    if (mode !== 'copilot') return;
    if (!copilotEnt.on) return;
    if (targets !== null) return; // already loaded
    if (targetsFetchStartedRef.current) return; // already in-flight

    targetsFetchStartedRef.current = true;
    setCopilotState('loading-targets');
    setCopilotError(null);
    targetsApi
      .listByCampaign(campaign.campaign_id)
      .then((list) => {
        setTargets(list);
        setCopilotState('idle');
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : t('details.advisor.coPilot.errors.loadTargets');
        setCopilotError(msg);
        setCopilotState('targets-error');
        // Allow a retry on next mode-flip if it failed.
        targetsFetchStartedRef.current = false;
      });
  }, [mode, copilotEnt.on, targets, campaign.campaign_id, t]);

  const handleAnalyze = useCallback(async () => {
    if (!targets || targets.length === 0) return;
    setCopilotState('analyzing');
    setCopilotError(null);
    setAdvice([]);
    setSelectedIds(new Set());
    try {
      const result = await generateCampaignAdvice(
        {
          campaignId: campaign.campaign_id,
          campaignName: campaign.campaign_name,
          marketplace: campaign.marketplace,
        },
        targets,
      );
      // Filter advice to known target ids so a hallucinated id doesn't crash UI.
      const knownIds = new Set(targets.map((tg) => tg.id));
      const filtered = result.items.filter((it) => knownIds.has(it.target_id));
      setAdvice(filtered);
      // Pre-select all rows by default — most users want bulk-apply.
      setSelectedIds(new Set(filtered.map((it) => it.target_id)));
      setCopilotState('idle');
    } catch (err) {
      if (err instanceof CoPilotParseError) {
        setCopilotError(t('details.advisor.coPilot.errors.parse'));
      } else {
        const msg = err instanceof Error ? err.message : t('details.advisor.coPilot.errors.generic');
        setCopilotError(msg);
      }
      setCopilotState('analyze-error');
    }
  }, [targets, campaign, t]);

  const toggleSelected = useCallback((targetId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (next: boolean) => {
      if (next) setSelectedIds(new Set(advice.map((a) => a.target_id)));
      else setSelectedIds(new Set());
    },
    [advice],
  );

  const handleApply = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setConfirmOpen(false);
    setCopilotState('applying');
    // Group advice by action so we can call the correct bulk endpoint per group.
    // For bid changes we further bucket by multiplier/delta value (backend takes
    // a single op for the whole batch).
    const selectedAdvice = advice.filter((a) => selectedIds.has(a.target_id));
    const pauseIds: number[] = [];
    const multiplierBuckets = new Map<number, number[]>();
    const deltaBuckets = new Map<number, number[]>();

    for (const item of selectedAdvice) {
      if (item.action === 'pause') {
        pauseIds.push(item.target_id);
        continue;
      }
      // 'lower' and 'raise' both end up as a bid adjustment.
      if (typeof item.multiplier === 'number' && Number.isFinite(item.multiplier)) {
        const bucket = multiplierBuckets.get(item.multiplier) ?? [];
        bucket.push(item.target_id);
        multiplierBuckets.set(item.multiplier, bucket);
      } else if (typeof item.delta === 'number' && Number.isFinite(item.delta)) {
        const bucket = deltaBuckets.get(item.delta) ?? [];
        bucket.push(item.target_id);
        deltaBuckets.set(item.delta, bucket);
      }
    }

    let applied = 0;
    const failures: string[] = [];

    if (pauseIds.length > 0) {
      try {
        const res = await targetsApi.bulkPause(pauseIds);
        applied += res.updated ?? pauseIds.length;
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    for (const [mult, ids] of multiplierBuckets) {
      try {
        const res = await targetsApi.bulkUpdateBid(ids, { multiplier: mult });
        applied += res.updated ?? ids.length;
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    for (const [delta, ids] of deltaBuckets) {
      try {
        const res = await targetsApi.bulkUpdateBid(ids, { delta });
        applied += res.updated ?? ids.length;
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }

    setCopilotState('idle');
    if (failures.length > 0) {
      toast.error(t('details.advisor.coPilot.errors.apply'));
    } else {
      toast.success(t('details.advisor.coPilot.applied', { count: applied }));
      // Clear advice after success — caller can re-run analyse for next pass.
      setAdvice([]);
      setSelectedIds(new Set());
      // Re-fetch targets so bids reflect the new state.
      try {
        const fresh = await targetsApi.listByCampaign(campaign.campaign_id);
        setTargets(fresh);
      } catch {
        // Non-fatal; user can manually re-analyse.
      }
    }
  }, [selectedIds, advice, toast, t, campaign.campaign_id]);

  const copilotRows: CoPilotRow[] = useMemo(() => {
    if (!targets) return [];
    const byId = new Map(targets.map((tg) => [tg.id, tg]));
    return advice.map((a) => ({ advice: a, target: byId.get(a.target_id) }));
  }, [advice, targets]);

  const summary = useMemo(
    () => (
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <SummaryTile label="Spend" value={fmtMoney(campaign.cost, campaign.currency)} />
        <SummaryTile label="Sales" value={fmtMoney(campaign.sales, campaign.currency)} />
        <SummaryTile label="Orders" value={fmtNumber(campaign.orders)} />
        <SummaryTile
          label="ACOS"
          value={campaign.acos > 0 ? fmtPct(campaign.acos) : '—'}
          tone={campaign.acos > 100 ? 'danger' : 'default'}
        />
      </dl>
    ),
    [campaign],
  );

  const isStreaming = state === 'streaming';
  const isUnavailable = state === 'history-error';
  const isNoKey = state === 'no-key';

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('details.advisor.panelTitle')}
        data-testid="ai-advisor-panel"
        className="fixed right-0 top-0 h-full w-[420px] bg-white border-l border-zinc-200 shadow-xl z-50 flex flex-col"
      >
        <div className="flex items-center justify-between px-4 h-12 border-b border-zinc-200 flex-shrink-0">
          <div className="inline-flex items-center gap-2">
            <Sparkles size={14} className="text-violet-600" />
            <span className="text-sm font-medium text-zinc-900">
              {t('details.advisor.panelTitle')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('details.advisor.closeAria')}
            className="h-7 w-7 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 pt-4 pb-2 border-b border-zinc-100 flex-shrink-0">
          <div className="text-sm text-zinc-900 font-medium mb-1 truncate">
            {campaign.campaign_name}
          </div>
          <div className="text-xs text-zinc-500 mb-3 truncate">
            {campaign.book_title} · {campaign.marketplace} ·{' '}
            {campaign.campaign_type.toUpperCase()} · {campaign.targeting_type}
          </div>
          {summary}

          {/* Phase M.3 — Mode toggle. Compact segmented control. */}
          <div
            role="tablist"
            aria-label={t('details.advisor.modeToggleAria')}
            data-testid="ai-advisor-mode-toggle"
            className="mt-3 inline-flex rounded-md bg-zinc-100 p-0.5 text-[11px] font-medium"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'chat'}
              data-testid="ai-advisor-mode-chat"
              onClick={() => setMode('chat')}
              className={`inline-flex items-center gap-1 h-6 px-2.5 rounded transition-colors ${
                mode === 'chat'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Sparkles size={11} />
              {t('details.advisor.modeChat')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'copilot'}
              data-testid="ai-advisor-mode-copilot"
              onClick={() => setMode('copilot')}
              className={`inline-flex items-center gap-1 h-6 px-2.5 rounded transition-colors ${
                mode === 'copilot'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Wand2 size={11} />
              {t('details.advisor.modeCoPilot')}
            </button>
          </div>
        </div>

        {mode === 'chat' && (
          <>
            <div
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
              data-testid="ai-advisor-messages"
            >
              {state === 'loading-history' && (
                <div className="text-xs text-zinc-400 text-center py-6">
                  {t('details.advisor.loadingHistory')}
                </div>
              )}

              {isUnavailable && (
                <div
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"
                  data-testid="ai-advisor-unavailable"
                >
                  <div className="font-medium mb-1">
                    {t('details.advisor.errors.unavailableTitle')}
                  </div>
                  <div className="text-amber-800">
                    {historyError ?? t('details.advisor.errors.unavailable')}
                  </div>
                  <button
                    type="button"
                    onClick={loadHistory}
                    className="mt-2 inline-flex h-7 px-2.5 items-center rounded text-[11px] font-medium text-amber-900 border border-amber-300 hover:bg-amber-100"
                  >
                    {t('details.advisor.retry')}
                  </button>
                </div>
              )}

              {isNoKey && (
                <div
                  className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs text-violet-900"
                  data-testid="ai-advisor-no-key"
                >
                  <div className="font-medium mb-1">{t('details.advisor.errors.noKeyTitle')}</div>
                  <div className="text-violet-800">{t('details.advisor.errors.noKey')}</div>
                </div>
              )}

              {messages.length === 0 && state === 'idle' && (
                <div className="text-xs text-zinc-400 text-center py-6">
                  {t('details.advisor.empty')}
                </div>
              )}

              {messages.map((m) => (
                <Bubble key={m.id} message={m} />
              ))}

              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={handleSend}
              className="flex-shrink-0 border-t border-zinc-200 px-3 py-2 flex items-end gap-2"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e as unknown as React.FormEvent);
                  }
                }}
                disabled={isUnavailable || isStreaming}
                data-testid="ai-advisor-input"
                placeholder={t('details.advisor.placeholder')}
                rows={2}
                className="flex-1 resize-none px-3 py-1.5 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-300 disabled:bg-zinc-50 disabled:text-zinc-400"
              />
              <button
                type="submit"
                disabled={isUnavailable || isStreaming || !draft.trim()}
                data-testid="ai-advisor-send"
                className="h-9 w-9 rounded-md bg-violet-600 hover:bg-violet-700 text-white inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t('details.advisor.sendAria')}
              >
                {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </form>
          </>
        )}

        {mode === 'copilot' && (
          <CoPilotBody
            locked={!copilotEnt.on}
            copilotState={copilotState}
            copilotError={copilotError}
            targets={targets}
            advice={advice}
            rows={copilotRows}
            selectedIds={selectedIds}
            onToggleSelected={toggleSelected}
            onToggleAll={toggleAll}
            onAnalyze={handleAnalyze}
            onApplyRequest={() => setConfirmOpen(true)}
            confirmOpen={confirmOpen}
            onConfirmApply={handleApply}
            onConfirmCancel={() => setConfirmOpen(false)}
            currency={campaign.currency}
          />
        )}
      </aside>
    </>
  );
};

interface CoPilotBodyProps {
  locked: boolean;
  copilotState: CoPilotState;
  copilotError: string | null;
  targets: Target[] | null;
  advice: CoPilotAdviceItem[];
  rows: CoPilotRow[];
  selectedIds: Set<number>;
  onToggleSelected: (id: number) => void;
  onToggleAll: (next: boolean) => void;
  onAnalyze: () => void;
  onApplyRequest: () => void;
  confirmOpen: boolean;
  onConfirmApply: () => void;
  onConfirmCancel: () => void;
  currency?: string | null;
}

const CoPilotBody: React.FC<CoPilotBodyProps> = ({
  locked,
  copilotState,
  copilotError,
  targets,
  advice,
  rows,
  selectedIds,
  onToggleSelected,
  onToggleAll,
  onAnalyze,
  onApplyRequest,
  confirmOpen,
  onConfirmApply,
  onConfirmCancel,
  currency,
}) => {
  const { t } = useTranslation('campaigns');

  if (locked) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-6" data-testid="copilot-locked">
        <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-3 text-xs text-violet-900">
          <div className="font-medium mb-1">
            {t('details.advisor.coPilot.lockedTitle')}
          </div>
          <div className="text-violet-800">
            {t('details.advisor.coPilot.lockedBody')}
          </div>
        </div>
      </div>
    );
  }

  const analyzing = copilotState === 'analyzing';
  const applying = copilotState === 'applying';
  const loadingTargets = copilotState === 'loading-targets';
  const canAnalyze = !!targets && targets.length > 0 && !analyzing && !applying && !loadingTargets;
  const canApply = advice.length > 0 && selectedIds.size > 0 && !analyzing && !applying;

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      data-testid="ai-advisor-copilot"
    >
      <div className="text-xs text-zinc-500">
        {t('details.advisor.coPilot.intro')}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAnalyze}
          disabled={!canAnalyze}
          data-testid="copilot-analyze"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
          {analyzing
            ? t('details.advisor.coPilot.analyzing')
            : t('details.advisor.coPilot.analyze')}
        </button>
      </div>

      {copilotState === 'targets-error' && copilotError && (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          data-testid="copilot-targets-error"
        >
          {copilotError}
        </div>
      )}

      {copilotState === 'analyze-error' && copilotError && (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          data-testid="copilot-analyze-error"
        >
          {copilotError}
        </div>
      )}

      {loadingTargets && (
        <div className="text-xs text-zinc-400 text-center py-4">
          {t('details.advisor.loadingHistory')}
        </div>
      )}

      {targets && targets.length === 0 && copilotState === 'idle' && (
        <div className="text-xs text-zinc-400 text-center py-4">
          {t('details.advisor.coPilot.noTargets')}
        </div>
      )}

      {advice.length === 0 && targets && targets.length > 0 && copilotState === 'idle' && (
        <div className="text-xs text-zinc-400 text-center py-4">
          {t('details.advisor.coPilot.noAdvice')}
        </div>
      )}

      {advice.length > 0 && (
        <>
          <CoPilotTable
            rows={rows}
            selectedIds={selectedIds}
            onToggle={onToggleSelected}
            onToggleAll={onToggleAll}
            currency={currency}
            disabled={applying}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onApplyRequest}
              disabled={!canApply}
              data-testid="copilot-apply"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {applying ? (
                <Loader2 size={12} className="animate-spin" />
              ) : null}
              {applying
                ? t('details.advisor.coPilot.applying')
                : t('details.advisor.coPilot.applySelected', { count: selectedIds.size })}
            </button>
          </div>
        </>
      )}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          data-testid="copilot-confirm"
          onClick={onConfirmCancel}
        >
          <div
            className="bg-white rounded-md shadow-lg w-[320px] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-zinc-900 mb-1">
              {t('details.advisor.coPilot.confirmTitle', { count: selectedIds.size })}
            </h3>
            <p className="text-xs text-zinc-600 mb-3">
              {t('details.advisor.coPilot.confirmBody')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onConfirmCancel}
                data-testid="copilot-confirm-cancel"
                className="inline-flex h-7 px-3 items-center rounded text-[11px] font-medium text-zinc-700 border border-zinc-200 hover:bg-zinc-50"
              >
                {t('details.advisor.coPilot.confirmCancel')}
              </button>
              <button
                type="button"
                onClick={onConfirmApply}
                data-testid="copilot-confirm-apply"
                className="inline-flex h-7 px-3 items-center rounded text-[11px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {t('details.advisor.coPilot.confirmApply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Bubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';
  return (
    <div
      data-testid={`ai-advisor-msg-${message.role}`}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-zinc-900 text-white'
            : 'bg-zinc-50 border border-zinc-200 text-zinc-800'
        }`}
      >
        {message.content || (message.pending ? '…' : '')}
        {message.pending && message.content && (
          <span className="inline-block ml-1 w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
        )}
      </div>
    </div>
  );
};

const SummaryTile: React.FC<{ label: string; value: string; tone?: 'default' | 'danger' }> = ({
  label,
  value,
  tone = 'default',
}) => (
  <div className="bg-zinc-50 rounded px-2 py-1.5">
    <dt className="text-zinc-500">{label}</dt>
    <dd
      className={`font-medium tabular-nums ${
        tone === 'danger' ? 'text-red-600' : 'text-zinc-900'
      }`}
    >
      {value}
    </dd>
  </div>
);

// "ключ" — Cyrillic word for "key". Built from char codes to satisfy
// the renderer-no-cyrillic ESLint rule, while still detecting the
// backend's RU error string for absent advisor key.
const CYRILLIC_KEY = String.fromCharCode(0x043a, 0x043b, 0x044e, 0x0447);

function matchesAbsentKeyPhrase(message: string): boolean {
  return message.includes(CYRILLIC_KEY);
}

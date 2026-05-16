// Phase M.1 — Niche Explorer: AI synthesis panel.
//
// Sends the imported `NicheKeyword[]` rows to Anthropic via the existing
// `ai:generate` IPC (task='ask'), with a prompt that asks for strict JSON.
// We parse the response with `parseSynthesisJson` (tolerant of fenced markdown).
//
// We do NOT stream — the answer is small (under 200 tokens) and the user
// wants the structured result, not a typing animation.

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { aiApi } from '../../api/ai';
import { parseSynthesisJson, type NicheKeyword, type NicheSynthesis } from '../../api/niche';

interface Props {
  /** Imported rows. We stringify them in the prompt body. */
  rows: NicheKeyword[];
  /** Optional initial synthesis (re-restored when switching tabs). */
  initial?: NicheSynthesis | null;
  /** Called when synthesis succeeds — caller persists weakCovers / etc. */
  onResult(synthesis: NicheSynthesis): void;
  /** Minimum rows before the analyse button is enabled. */
  minRows?: number;
}

/** Maximum number of rows we send to the model — keeps token cost bounded. */
const MAX_ROWS_IN_PROMPT = 30;

function buildPrompt(rows: NicheKeyword[]): string {
  const keyword = rows[0]?.keyword || '(no keyword)';
  const head = rows.slice(0, MAX_ROWS_IN_PROMPT);
  const lines = head.map((r, i) => {
    return `${i + 1}. ASIN=${r.asin || 'unknown'} | "${r.title || 'no title'}" | BSR=${r.bsr || 'n/a'} | reviews=${r.reviewCount || 0} | pages=${r.pageCount || 0} | est-rev=${r.estimatedRevenue || 0}`;
  });
  return `You are analysing the Amazon KDP niche "${keyword}" using a list of competing books.

Competing books (top ${head.length}):
${lines.join('\n')}

Return STRICT JSON only — no markdown fences, no prose before or after. Schema:

{
  "saturation": <integer 1-10, where 1=wide-open and 10=fully saturated>,
  "weakCovers": [<ASINs that look like weak covers — heuristics: thin niche-relevance hints in title, low review counts, indie self-pub flags>],
  "angle": "<one short paragraph (~40 words) suggesting an opening for an author entering this niche>",
  "notes": "<optional 1-2 short caveats>"
}

Important:
- "saturation" must reflect how crowded the niche is (high BSRs + many books with deep reviews = saturated).
- "weakCovers" is a JSON array of strings (ASIN strings), at most 5 entries.
- Output exactly one JSON object. No code fences. No "Here is the JSON:" preamble.`;
}

export const NicheAiSynthesis: React.FC<Props> = ({ rows, initial, onResult, minRows = 3 }) => {
  const { t } = useTranslation('research');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [synthesis, setSynthesis] = useState<NicheSynthesis | null>(initial ?? null);

  const canRun = rows.length >= minRows;

  const onRun = useCallback(async () => {
    if (!canRun) return;
    setLoading(true);
    setError(null);
    try {
      const prompt = buildPrompt(rows);
      const result = await aiApi.generate({ task: 'ask', prompt });
      let parsed: NicheSynthesis;
      try {
        parsed = parseSynthesisJson(result.text);
      } catch {
        setError(
          t('synthesis.parseError', {
            preview: result.text.slice(0, 120) + (result.text.length > 120 ? '…' : ''),
          }),
        );
        return;
      }
      setSynthesis(parsed);
      onResult(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Detect the known "missing key" case and show a friendlier message.
      if (/api key not configured/i.test(message)) {
        setError(t('synthesis.missingKey'));
      } else {
        setError(t('synthesis.error', { message }));
      }
    } finally {
      setLoading(false);
    }
  }, [rows, canRun, onResult, t]);

  return (
    <Card data-testid="niche-synthesis-card">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 inline-flex items-center gap-1.5">
              <Sparkles size={14} className="text-amber-500" />
              {t('synthesis.title')}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">{t('synthesis.subtitle')}</p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={onRun}
            disabled={loading || !canRun}
            data-testid="niche-synthesis-run"
            leftIcon={loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          >
            {loading ? t('synthesis.running') : t('synthesis.runButton')}
          </Button>
        </div>

        {!canRun && (
          <p className="text-[11px] text-zinc-500" data-testid="niche-synthesis-min-rows">
            {t('synthesis.minRows')}
          </p>
        )}

        {error && (
          <div
            data-testid="niche-synthesis-error"
            className="flex items-start gap-2 px-3 py-2 rounded-md border border-amber-300 bg-amber-50 text-xs text-amber-900"
          >
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {synthesis && (
          <div className="space-y-2 pt-1" data-testid="niche-synthesis-result">
            <div className="flex items-center gap-3">
              <div className="text-xs font-medium text-zinc-700">{t('synthesis.saturationLabel')}:</div>
              <SaturationBar value={synthesis.saturation} />
              <span className="text-[10px] text-zinc-400">{t('synthesis.saturationScale')}</span>
            </div>

            <div>
              <div className="text-xs font-medium text-zinc-700">{t('synthesis.weakCoversLabel')}:</div>
              {synthesis.weakCovers.length === 0 ? (
                <p className="text-xs text-zinc-500 italic mt-0.5">{t('synthesis.noWeakCovers')}</p>
              ) : (
                <div className="flex flex-wrap gap-1 mt-1">
                  {synthesis.weakCovers.map((asin) => (
                    <span
                      key={asin}
                      data-testid={`niche-synthesis-weak-${asin}`}
                      className="
                        font-mono text-[11px] px-1.5 py-0.5 rounded
                        bg-amber-100 text-amber-800 border border-amber-200
                      "
                    >
                      {asin}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-medium text-zinc-700">{t('synthesis.angleLabel')}:</div>
              <p className="text-sm text-zinc-800 mt-0.5 leading-relaxed">{synthesis.angle}</p>
            </div>

            {synthesis.notes && (
              <div>
                <div className="text-xs font-medium text-zinc-700">{t('synthesis.notesLabel')}:</div>
                <p className="text-xs text-zinc-500 mt-0.5 italic">{synthesis.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

/** Visual saturation indicator — 10 segments, filled in proportion. */
const SaturationBar: React.FC<{ value: number }> = ({ value }) => {
  const clamped = Math.max(1, Math.min(10, value));
  return (
    <div className="inline-flex items-center gap-1" data-testid="niche-synthesis-saturation" aria-label={`Saturation ${clamped}/10`}>
      {Array.from({ length: 10 }, (_, i) => {
        const filled = i < clamped;
        const isHot = clamped >= 7;
        const isWarm = clamped >= 4;
        const colorClass = filled
          ? isHot
            ? 'bg-red-500'
            : isWarm
              ? 'bg-amber-500'
              : 'bg-emerald-500'
          : 'bg-zinc-200';
        return <span key={i} className={`h-3 w-2 rounded-sm ${colorClass}`} />;
      })}
      <span className="ml-1.5 text-xs font-semibold tabular-nums text-zinc-700">{clamped}/10</span>
    </div>
  );
};

// Phase M.1 — Niche Explorer / Research page.
//
// User flow:
//   1. Choose tab: "By keyword" (top books in a niche query) or "By ASIN"
//      (reverse-search a competitor — reuses the L.4 ReverseAsin parser shape).
//   2. Type the niche / ASIN + select marketplace.
//   3. EITHER import CSV (Publisher Rocket export) OR enter rows manually.
//   4. Table renders rows with BSR-to-revenue estimates.
//   5. Click "Analyse niche" → Anthropic returns JSON synthesis
//      {saturation, weakCovers, angle, notes}. The weakCovers list highlights
//      the matching rows in the table.
//   6. Save the current research project to localStorage so it can be reopened
//      later from the "Saved research" card.
//
// Tier-gating: whole page wrapped in `useEntitlement('ai.niche_explorer')`.
// Start-tier users see an upgrade card.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { LockedFeature } from '../components/LockedFeature';
import { useEntitlement } from '../hooks/useEntitlement';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useMarketplaces } from '../contexts/MarketplacesContext';
import {
  DEFAULT_MARKETPLACE,
  parseNicheKeywordCsv,
  parseSynthesisJson as _parseSynthesisJson, // re-exported so smoke-tests can import indirectly
  researchProjectsKey,
  type Marketplace,
  type NicheKeyword,
  type NicheSynthesis,
  type ResearchProject,
} from '../api/niche';
import { isAsinShape } from '../api/reverseAsin';
import { NicheCsvImport } from '../components/niche/NicheCsvImport';
import { NicheKeywordTable } from '../components/niche/NicheKeywordTable';
import { NicheAiSynthesis } from '../components/niche/NicheAiSynthesis';

// Silence the unused re-export (kept for documentation / future smoke-tests).
void _parseSynthesisJson;

type Tab = 'keyword' | 'asin';

/** Default marketplaces shown in the picker if the server hasn't yielded a list yet. */
const FALLBACK_MARKETPLACES: Marketplace[] = ['USA', 'UK', 'DE', 'FR', 'CA', 'AU', 'JP'];

/**
 * Whitelist of marketplaces we have multipliers for. Server may return codes
 * we don't recognise (custom Amazon regions for some sellers) — those just fall
 * back to USA-baseline.
 */
const KNOWN_MARKETPLACES: ReadonlyArray<Marketplace> = [
  'USA',
  'UK',
  'CA',
  'AU',
  'DE',
  'FR',
  'ES',
  'IT',
  'JP',
  'IN',
  'MX',
  'BR',
  'NL',
];

function toMarketplace(code: string): Marketplace {
  const upper = code.toUpperCase() as Marketplace;
  return KNOWN_MARKETPLACES.includes(upper) ? upper : DEFAULT_MARKETPLACE;
}

/** Blank row used by the manual-entry table. */
function emptyRow(keyword: string): NicheKeyword {
  return {
    keyword,
    asin: '',
    title: '',
    bsr: 0,
    estimatedRevenue: 0,
    pageCount: 0,
    reviewCount: 0,
    releaseDate: '',
  };
}

export const ResearchPage: React.FC = () => {
  const { t } = useTranslation('research');
  const { on: featureOn } = useEntitlement('ai.niche_explorer');

  if (!featureOn) {
    return (
      <div data-testid="research-page-locked" className="space-y-4">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <Card>
          <div className="p-8 text-center space-y-3">
            <Compass className="mx-auto text-violet-500" size={28} />
            <h3 className="text-lg font-semibold text-zinc-900">{t('locked.title')}</h3>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">{t('locked.description')}</p>
            <LockedFeature feature="ai.niche_explorer" mode="dim">
              <Button variant="primary" size="md" data-testid="research-page-upgrade-cta">
                {t('locked.cta')}
              </Button>
            </LockedFeature>
          </div>
        </Card>
      </div>
    );
  }
  return <ResearchPageInner />;
};

const ResearchPageInner: React.FC = () => {
  const { t } = useTranslation('research');
  const toast = useToast();
  const { user } = useAuth();
  const { list: marketplaceCodes } = useMarketplaces();

  const [tab, setTab] = useState<Tab>('keyword');
  const [keyword, setKeyword] = useState('');
  const [asin, setAsin] = useState('');
  const [marketplace, setMarketplace] = useState<Marketplace>(DEFAULT_MARKETPLACE);

  const [rows, setRows] = useState<NicheKeyword[]>([]);
  const [importing, setImporting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [synthesis, setSynthesis] = useState<NicheSynthesis | null>(null);

  const [projects, setProjects] = useState<ResearchProject[]>([]);

  // Persist + load research projects per user.
  const storageKey = useMemo(() => researchProjectsKey(user?.id), [user?.id]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setProjects([]);
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Filter to well-shaped entries; tolerate corruption.
        const ok = parsed.filter(
          (p): p is ResearchProject =>
            !!p && typeof p === 'object' && typeof (p as ResearchProject).id === 'string',
        );
        setProjects(ok);
      } else {
        setProjects([]);
      }
    } catch {
      setProjects([]);
    }
  }, [storageKey]);

  const persistProjects = useCallback(
    (next: ResearchProject[]) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // localStorage can throw on quota — surface a soft toast but don't block.
      }
      setProjects(next);
    },
    [storageKey],
  );

  // Effective marketplace picker options: server list ∩ known, or fallback.
  const marketplaceOptions = useMemo<Marketplace[]>(() => {
    if (!Array.isArray(marketplaceCodes) || marketplaceCodes.length === 0) {
      return FALLBACK_MARKETPLACES;
    }
    return marketplaceCodes
      .map((c) => toMarketplace(c))
      .filter((c, i, arr) => arr.indexOf(c) === i);
  }, [marketplaceCodes]);

  // ASIN tab requires a 10-char ASIN.
  const asinValid = asin.trim() === '' || isAsinShape(asin);

  const onCsvParsed = useCallback(
    (parsed: NicheKeyword[]) => {
      if (parsed.length === 0) {
        toast.error(t('import.importEmpty'));
        return;
      }
      setRows(parsed);
      setSynthesis(null); // re-run synthesis against the new data
      toast.success(t('import.importSuccess', { count: parsed.length }));
    },
    [toast, t],
  );

  /** Parser specialised to the current tab — picks the right adapter. */
  const csvParser = useCallback(
    (text: string): NicheKeyword[] => {
      // Both tabs use the same NicheKeyword shape; "By ASIN" mode just sources
      // its keyword label from the competitor ASIN so the synthesis prompt is
      // still seeded properly.
      const seedKeyword = tab === 'asin' ? `ASIN ${asin.trim() || 'unknown'}` : keyword.trim();
      return parseNicheKeywordCsv(text, seedKeyword);
    },
    [tab, keyword, asin],
  );

  const onCsvError = useCallback(
    (message: string) => {
      toast.error(message);
    },
    [toast],
  );

  const onSynthesis = useCallback((s: NicheSynthesis) => {
    setSynthesis(s);
  }, []);

  const onAddManualRow = useCallback(() => {
    const seedKeyword = tab === 'asin' ? `ASIN ${asin.trim() || 'unknown'}` : keyword.trim();
    setRows((prev) => [...prev, emptyRow(seedKeyword)]);
    setManualOpen(true);
  }, [tab, asin, keyword]);

  const onUpdateRow = useCallback((idx: number, patch: Partial<NicheKeyword>) => {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    );
  }, []);

  const onDeleteRow = useCallback((idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const onClearRows = useCallback(() => {
    setRows([]);
    setSynthesis(null);
  }, []);

  const weakCoverSet = useMemo(
    () => new Set(synthesis?.weakCovers ?? []),
    [synthesis],
  );

  const canSaveProject = rows.length > 0;

  const onSaveProject = useCallback(() => {
    const label =
      tab === 'asin'
        ? asin.trim() || 'ASIN'
        : keyword.trim() || 'keyword';
    const project: ResearchProject = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      mode: tab,
      marketplace,
      createdAt: new Date().toISOString(),
      rowCount: rows.length,
    };
    const next = [project, ...projects].slice(0, 20);
    persistProjects(next);
    toast.success(t('projects.saved', { label }));
  }, [tab, asin, keyword, marketplace, rows.length, projects, persistProjects, toast, t]);

  const onDeleteProject = useCallback(
    (id: string) => {
      const next = projects.filter((p) => p.id !== id);
      persistProjects(next);
    },
    [projects, persistProjects],
  );

  return (
    <div className="space-y-4" data-testid="research-page">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        rightSlot={
          <Button
            variant="secondary"
            size="sm"
            onClick={onSaveProject}
            disabled={!canSaveProject}
            data-testid="research-save-project"
            leftIcon={<Save size={12} />}
          >
            {t('projects.saveCurrent')}
          </Button>
        }
      />

      {/* Tab switcher */}
      <div
        className="inline-flex bg-white border border-zinc-200 rounded-md p-0.5"
        role="tablist"
        data-testid="research-tabs"
      >
        {(['keyword', 'asin'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            data-testid={`research-tab-${id}`}
            className={`px-3 h-7 text-xs font-medium rounded transition-colors ${
              tab === id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            {id === 'keyword' ? t('tabs.byKeyword') : t('tabs.byAsin')}
          </button>
        ))}
      </div>

      {/* Query input + marketplace picker + CSV import */}
      <Card data-testid="research-query-card">
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-[1fr_180px_auto] gap-3 items-end">
            <div>
              {tab === 'keyword' ? (
                <>
                  <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                    {t('query.keywordLabel')}
                  </label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder={t('query.keywordPlaceholder')}
                    className="
                      w-full h-9 px-3 text-sm rounded-md border border-zinc-200
                      bg-white text-zinc-900 placeholder:text-zinc-300
                      focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
                    "
                    data-testid="research-keyword-input"
                  />
                </>
              ) : (
                <>
                  <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                    {t('query.asinLabel')}
                  </label>
                  <input
                    type="text"
                    value={asin}
                    onChange={(e) => setAsin(e.target.value.toUpperCase().trim())}
                    placeholder={t('query.asinPlaceholder')}
                    maxLength={10}
                    className={`
                      w-full h-9 px-3 text-sm font-mono rounded-md
                      border bg-white text-zinc-900 placeholder:text-zinc-300
                      focus:outline-none focus:ring-2 focus:ring-zinc-900/10
                      ${asinValid ? 'border-zinc-200 focus:border-zinc-400' : 'border-red-300 focus:border-red-500 focus:ring-red-500/10'}
                    `}
                    data-testid="research-asin-input"
                  />
                  {!asinValid && (
                    <p className="mt-1 text-[11px] text-red-600">{t('query.asinInvalid')}</p>
                  )}
                </>
              )}
            </div>
            <div>
              <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                {t('query.marketplaceLabel')}
              </label>
              <select
                value={marketplace}
                onChange={(e) => setMarketplace(toMarketplace(e.target.value))}
                data-testid="research-marketplace-select"
                className="w-full h-9 px-2 text-sm rounded-md border border-zinc-200 bg-white text-zinc-900"
              >
                {marketplaceOptions.map((mp) => (
                  <option key={mp} value={mp}>
                    {mp}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-400 mt-0.5">{t('query.marketplaceHint')}</p>
            </div>
            <NicheCsvImport
              importing={importing}
              setImporting={setImporting}
              parse={csvParser}
              onParsed={onCsvParsed}
              onError={onCsvError}
              data-testid="research-csv-import"
            />
          </div>

          <button
            type="button"
            onClick={() => setManualOpen((v) => !v)}
            className="text-[11px] text-violet-700 hover:underline self-start"
            data-testid="research-manual-toggle"
          >
            {t('import.manualEntryToggle')}
          </button>

          {manualOpen && (
            <ManualEntryEditor
              rows={rows}
              onAddRow={onAddManualRow}
              onUpdateRow={onUpdateRow}
              onDeleteRow={onDeleteRow}
              onClearAll={onClearRows}
            />
          )}
        </div>
      </Card>

      {/* Results table */}
      <NicheKeywordTable rows={rows} marketplace={marketplace} weakCovers={weakCoverSet} />

      {/* AI synthesis */}
      <NicheAiSynthesis rows={rows} initial={synthesis} onResult={onSynthesis} />

      {/* Saved projects */}
      <Card data-testid="research-projects-card" title={t('projects.title')}>
        <div className="p-4">
          {projects.length === 0 ? (
            <p className="text-xs text-zinc-500 italic" data-testid="research-projects-empty">
              {t('projects.empty')}
            </p>
          ) : (
            <ul className="space-y-1.5" data-testid="research-projects-list">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 text-sm py-1"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-zinc-900 truncate">
                      {p.label}
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        {p.mode} · {p.marketplace}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {t('projects.savedAtSuffix', {
                        rowCount: p.rowCount,
                        when: new Date(p.createdAt).toLocaleString(),
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteProject(p.id)}
                    aria-label={t('projects.delete')}
                    data-testid={`research-project-delete-${p.id}`}
                    className="h-6 w-6 inline-flex items-center justify-center rounded text-zinc-400 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Manual entry sub-component.
// Lightweight editable table — used when the user doesn't have a PR export.
// ─────────────────────────────────────────────────────────────────────────────

interface ManualEntryProps {
  rows: NicheKeyword[];
  onAddRow(): void;
  onUpdateRow(idx: number, patch: Partial<NicheKeyword>): void;
  onDeleteRow(idx: number): void;
  onClearAll(): void;
}

const ManualEntryEditor: React.FC<ManualEntryProps> = ({
  rows,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  onClearAll,
}) => {
  const { t } = useTranslation('research');

  return (
    <div
      className="border-t border-zinc-100 pt-3 space-y-2"
      data-testid="research-manual-editor"
    >
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold text-zinc-900">{t('manual.title')}</h4>
          <p className="text-[11px] text-zinc-500">{t('manual.subtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={onAddRow}
            data-testid="research-manual-add-row"
            leftIcon={<Plus size={12} />}
          >
            {t('manual.addRow')}
          </Button>
          {rows.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              data-testid="research-manual-clear"
              leftIcon={<X size={12} />}
            >
              {t('manual.clearAll')}
            </Button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
              <th className="text-left px-2 py-1.5 font-medium">{t('table.asin')}</th>
              <th className="text-left px-2 py-1.5 font-medium">{t('table.bookTitle')}</th>
              <th className="text-right px-2 py-1.5 font-medium">{t('table.bsr')}</th>
              <th className="text-right px-2 py-1.5 font-medium">{t('table.pageCount')}</th>
              <th className="text-right px-2 py-1.5 font-medium">{t('table.reviewCount')}</th>
              <th className="text-left px-2 py-1.5 font-medium">{t('table.releaseDate')}</th>
              <th className="px-2 py-1.5 w-6"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-zinc-100">
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={row.asin}
                    onChange={(e) =>
                      onUpdateRow(idx, { asin: e.target.value.toUpperCase().trim() })
                    }
                    maxLength={10}
                    placeholder="B0…"
                    className="w-full h-7 px-1.5 text-xs font-mono rounded border border-zinc-200 focus:border-zinc-400 focus:outline-none"
                    data-testid={`research-manual-asin-${idx}`}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={row.title}
                    onChange={(e) => onUpdateRow(idx, { title: e.target.value })}
                    placeholder="Book title"
                    className="w-full h-7 px-1.5 text-xs rounded border border-zinc-200 focus:border-zinc-400 focus:outline-none"
                    data-testid={`research-manual-title-${idx}`}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    value={row.bsr || ''}
                    onChange={(e) => onUpdateRow(idx, { bsr: Number(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full h-7 px-1.5 text-xs text-right tabular-nums rounded border border-zinc-200 focus:border-zinc-400 focus:outline-none"
                    data-testid={`research-manual-bsr-${idx}`}
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    value={row.pageCount || ''}
                    onChange={(e) =>
                      onUpdateRow(idx, { pageCount: Number(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="w-full h-7 px-1.5 text-xs text-right tabular-nums rounded border border-zinc-200 focus:border-zinc-400 focus:outline-none"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="number"
                    value={row.reviewCount || ''}
                    onChange={(e) =>
                      onUpdateRow(idx, { reviewCount: Number(e.target.value) || 0 })
                    }
                    placeholder="0"
                    className="w-full h-7 px-1.5 text-xs text-right tabular-nums rounded border border-zinc-200 focus:border-zinc-400 focus:outline-none"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    type="text"
                    value={row.releaseDate}
                    onChange={(e) => onUpdateRow(idx, { releaseDate: e.target.value })}
                    placeholder="MM/DD/YYYY"
                    className="w-full h-7 px-1.5 text-xs rounded border border-zinc-200 focus:border-zinc-400 focus:outline-none"
                  />
                </td>
                <td className="px-1 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => onDeleteRow(idx)}
                    aria-label="Delete row"
                    className="h-6 w-6 inline-flex items-center justify-center rounded text-zinc-400 hover:text-red-600 hover:bg-red-50"
                    data-testid={`research-manual-delete-${idx}`}
                  >
                    <Trash2 size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// Loader2 import kept for future skeleton state if we add server fetches.
void Loader2;

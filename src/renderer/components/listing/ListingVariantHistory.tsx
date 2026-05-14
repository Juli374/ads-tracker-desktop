// Phase L Lane A — variant history for Listing Studio.
//
// Each Regenerate result is appended to localStorage under
// `listing-studio:variants:<asin>:<task>` (latest first). User clicks a
// variant to restore it into the "proposed" pane. Display caps at 8 items
// to avoid local-storage bloat; older entries fall off.
//
// Stored shape (LS):
//   { entries: [{ text, rationale?, model, createdAt }, ...] }

import React from 'react';
import { Clock, X } from 'lucide-react';
import type { ListingTask } from './ListingTaskTabs';

export interface VariantEntry {
  text: string;
  rationale?: string;
  model?: string;
  createdAt: string; // ISO
}

const MAX_ENTRIES = 8;

export function variantStorageKey(asin: string, task: ListingTask): string {
  return `listing-studio:variants:${asin}:${task}`;
}

export function loadVariants(asin: string, task: ListingTask): VariantEntry[] {
  if (!asin) return [];
  try {
    const raw = window.localStorage.getItem(variantStorageKey(asin, task));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { entries?: unknown };
    if (!parsed || !Array.isArray(parsed.entries)) return [];
    return parsed.entries
      .filter((e): e is VariantEntry => {
        return (
          typeof e === 'object' &&
          e !== null &&
          typeof (e as VariantEntry).text === 'string' &&
          typeof (e as VariantEntry).createdAt === 'string'
        );
      })
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function appendVariant(asin: string, task: ListingTask, entry: VariantEntry): VariantEntry[] {
  if (!asin) return [];
  const current = loadVariants(asin, task);
  const next = [entry, ...current].slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(
      variantStorageKey(asin, task),
      JSON.stringify({ entries: next }),
    );
  } catch {
    // Safe fallback — quota exceeded / private mode. Variants are non-critical.
  }
  return next;
}

export function clearVariants(asin: string, task: ListingTask): void {
  if (!asin) return;
  try {
    window.localStorage.removeItem(variantStorageKey(asin, task));
  } catch {
    /* ignore */
  }
}

interface Props {
  variants: VariantEntry[];
  onRestore(entry: VariantEntry): void;
  onClear(): void;
}

export const ListingVariantHistory: React.FC<Props> = ({ variants, onRestore, onClear }) => {
  if (variants.length === 0) {
    return (
      <div
        data-testid="listing-variant-history-empty"
        className="text-xs text-zinc-400 italic px-1"
      >
        No variants yet. Generated drafts will appear here.
      </div>
    );
  }
  return (
    <div data-testid="listing-variant-history">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
          History
        </span>
        <button
          type="button"
          data-testid="listing-variant-history-clear"
          onClick={onClear}
          className="text-[10px] text-zinc-400 hover:text-zinc-700 inline-flex items-center gap-0.5"
        >
          <X size={10} /> clear
        </button>
      </div>
      <ul className="space-y-1.5">
        {variants.map((v, idx) => (
          <li key={`${v.createdAt}-${idx}`}>
            <button
              type="button"
              data-testid={`listing-variant-${idx}`}
              onClick={() => onRestore(v)}
              className="
                w-full text-left rounded-md border border-zinc-200 bg-white
                px-2.5 py-1.5 hover:bg-zinc-50 hover:border-zinc-300 transition-colors
              "
            >
              <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-0.5">
                <span className="inline-flex items-center gap-1">
                  <Clock size={10} />
                  {formatTime(v.createdAt)}
                </span>
                {v.model && <span className="font-mono">{v.model}</span>}
              </div>
              <p className="text-xs text-zinc-700 line-clamp-2">{v.text}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

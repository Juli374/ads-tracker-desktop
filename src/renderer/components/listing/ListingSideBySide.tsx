// Phase L Lane A — side-by-side `current` vs `proposed` viewer for Listing Studio.
//
// Two columns, equal width. Read-only textareas (we deliberately don't make
// the proposed column editable — if the user wants to tweak before applying,
// they can use the Apply button to push it and then edit on the Books page,
// or copy/paste manually).
//
// Empty proposed → muted placeholder. Long text → both sides scroll
// independently inside `min-h-[12rem] max-h-[24rem]`.

import React from 'react';

interface Props {
  current: string;
  proposed: string;
  /** Optional model label shown next to the proposed column. */
  modelLabel?: string;
  /** Optional rationale shown below the proposed text. */
  rationale?: string;
  /** When true, proposed column shows a "Generating…" shimmer. */
  loading?: boolean;
}

export const ListingSideBySide: React.FC<Props> = ({
  current,
  proposed,
  modelLabel,
  rationale,
  loading = false,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="listing-side-by-side">
      <Column label="Current" testId="listing-side-current">
        <Body text={current} placeholder="No current text on file." />
      </Column>
      <Column
        label="Proposed by AI"
        testId="listing-side-proposed"
        labelMeta={modelLabel ? <span className="text-[10px] text-zinc-400 font-mono">{modelLabel}</span> : null}
      >
        {loading ? (
          <div className="space-y-1.5" data-testid="listing-side-proposed-loading">
            <div className="h-3 w-3/4 bg-zinc-100 rounded animate-pulse" />
            <div className="h-3 w-full bg-zinc-100 rounded animate-pulse" />
            <div className="h-3 w-5/6 bg-zinc-100 rounded animate-pulse" />
          </div>
        ) : (
          <Body text={proposed} placeholder="Click Regenerate to draft new copy." />
        )}
        {rationale && !loading && (
          <p
            data-testid="listing-side-rationale"
            className="mt-2 text-[11px] text-zinc-500 italic border-l-2 border-violet-200 pl-2"
          >
            {rationale}
          </p>
        )}
      </Column>
    </div>
  );
};

interface ColProps {
  label: string;
  labelMeta?: React.ReactNode;
  testId: string;
  children: React.ReactNode;
}

const Column: React.FC<ColProps> = ({ label, labelMeta, testId, children }) => (
  <div data-testid={testId} className="flex flex-col">
    <div className="flex items-center justify-between mb-1.5 px-0.5">
      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{label}</span>
      {labelMeta}
    </div>
    <div className="flex-1 min-h-[12rem] max-h-[24rem] overflow-y-auto rounded-md border border-zinc-200 bg-white px-3 py-2.5">
      {children}
    </div>
  </div>
);

const Body: React.FC<{ text: string; placeholder: string }> = ({ text, placeholder }) => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return <p className="text-sm text-zinc-400 italic">{placeholder}</p>;
  }
  return <pre className="text-sm text-zinc-800 whitespace-pre-wrap font-sans">{trimmed}</pre>;
};

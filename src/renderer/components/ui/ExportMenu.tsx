import React, { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, File as FileIcon, type LucideIcon } from 'lucide-react';

export interface ExportMenuItem {
  id: 'xlsx' | 'pdf' | 'csv';
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface ExportMenuProps {
  /**
   * Convenience: when only XLSX is provided, renders a single button with download icon.
   * Otherwise renders a dropdown menu.
   */
  items: ExportMenuItem[];
  disabled?: boolean;
  testId?: string;
  buttonLabel?: string;
}

const ICONS: Record<ExportMenuItem['id'], LucideIcon> = {
  xlsx: FileSpreadsheet,
  pdf: FileText,
  csv: FileIcon,
};

export const ExportMenu: React.FC<ExportMenuProps> = ({
  items,
  disabled,
  testId = 'export-menu',
  buttonLabel = 'Export',
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  // Single-item → render direct button.
  if (items.length === 1) {
    const it = items[0];
    const Icon = ICONS[it.id];
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={it.onClick}
        disabled={disabled || it.disabled}
        aria-label={it.label}
        className="
          inline-flex items-center gap-1.5 h-8 px-3 rounded-md
          text-xs font-medium text-zinc-700 border border-zinc-200 bg-white
          hover:bg-zinc-50 transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed
        "
      >
        <Icon size={13} />
        {it.label}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className="
          inline-flex items-center gap-1.5 h-8 px-3 rounded-md
          text-xs font-medium text-zinc-700 border border-zinc-200 bg-white
          hover:bg-zinc-50 transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed
        "
      >
        <Download size={13} />
        {buttonLabel}
      </button>
      {open && (
        <div
          role="menu"
          data-testid={`${testId}-popover`}
          className="
            absolute right-0 mt-1 z-50 min-w-[140px] py-1
            bg-white border border-zinc-200 rounded-md shadow-md
          "
        >
          {items.map((it) => {
            const Icon = ICONS[it.id];
            return (
              <button
                key={it.id}
                role="menuitem"
                type="button"
                data-testid={`${testId}-${it.id}`}
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className="
                  w-full flex items-center gap-2 px-3 h-8 text-xs text-zinc-700
                  hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed
                "
              >
                <Icon size={13} />
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  value: number;
  onSave: (next: number) => Promise<void>;
  // Форматтер для display-режима (e.g. fmtMoney). По умолчанию — toFixed(2).
  format?: (n: number) => string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ariaLabel?: string;
  // Дополнительные классы для display-mode (выравнивание, размер шрифта).
  displayClassName?: string;
}

// Inline-edit numeric value: клик → input → Enter/blur сохраняет, Esc отменяет.
// На ошибке от сервера откатываем к исходному значению + кидаем error в caller
// (через rejected promise from onSave). Caller отвечает за toast.
export const EditableNumber: React.FC<Props> = ({
  value,
  onSave,
  format,
  min,
  max,
  step = 0.01,
  disabled = false,
  ariaLabel,
  displayClassName = 'text-right tabular-nums',
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(String(value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Sentinel: блокируем повторный submit от blur после Enter.
  const submittedRef = useRef(false);

  useEffect(() => {
    if (editing) {
      setDraft(String(value));
      submittedRef.current = false;
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, value]);

  const cancel = () => {
    submittedRef.current = true;
    setEditing(false);
  };

  const submit = async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const next = Number(draft);
    if (!Number.isFinite(next)) {
      setEditing(false);
      return;
    }
    if (next === value) {
      setEditing(false);
      return;
    }
    if (min != null && next < min) return;
    if (max != null && next > max) return;
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // Ошибку отдаёт caller через toast, мы откатываемся к value.
      setDraft(String(value));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => !disabled && setEditing(true)}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`
          inline-flex items-center gap-1
          ${displayClassName}
          ${disabled ? 'cursor-default' : 'cursor-text hover:bg-zinc-100 rounded px-1 -mx-1'}
          transition-colors
        `}
      >
        {format ? format(value) : value.toFixed(2)}
        {saving && <Loader2 size={10} className="animate-spin text-zinc-400" />}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      value={draft}
      step={step}
      min={min}
      max={max}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={() => {
        if (!submittedRef.current) submit();
      }}
      disabled={saving}
      aria-label={ariaLabel}
      className={`
        h-6 w-20 px-1.5 text-xs rounded border border-zinc-300 bg-white
        focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-500
        disabled:opacity-50 ${displayClassName}
      `}
    />
  );
};

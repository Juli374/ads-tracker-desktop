import React, { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const TokenPasteScreen: React.FC = () => {
  const { saveTokenAndVerify, error } = useAuth();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLocalError(null);
    setBusy(true);
    try {
      await saveTokenAndVerify(token.trim());
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Не удалось проверить токен');
    } finally {
      setBusy(false);
    }
  };

  const displayError = localError ?? error;

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md mx-auto px-8">
        <div className="bg-white border border-zinc-200 rounded-xl shadow-card overflow-hidden">
          <div className="px-7 pt-7 pb-5 border-b border-zinc-100">
            <div className="w-9 h-9 rounded-lg bg-zinc-900 flex items-center justify-center mb-4">
              <KeyRound size={16} strokeWidth={2.2} className="text-white" />
            </div>
            <h1 className="text-base font-semibold text-zinc-900 tracking-tight">
              Авторизация
            </h1>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Вставь API-ключ <span className="font-mono">at_live_…</span> с
              веб-версии (Настройки → API Ключи). Сохраняется локально через
              системный keychain.
            </p>
          </div>

          <form onSubmit={onSubmit} className="px-7 py-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                Access token
              </label>
              <textarea
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="at_live_xxxxxxxxxxxxxxxx..."
                rows={4}
                spellCheck={false}
                className="
                  w-full px-3 py-2 text-xs font-mono
                  border border-zinc-200 rounded-md
                  text-zinc-900 placeholder:text-zinc-400
                  focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
                  resize-none
                "
              />
            </div>

            {displayError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {displayError}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !token.trim()}
              className="
                w-full h-9 rounded-md bg-zinc-900 text-white text-sm font-medium
                hover:bg-zinc-800 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-2
              "
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {busy ? 'Проверяем…' : 'Войти'}
            </button>
          </form>
        </div>

        <div className="mt-4 text-[11px] text-zinc-400 leading-relaxed text-center">
          Создай ключ на kdpbook.click → Настройки → API Ключи → «+ Создать ключ».
          <br />Полный ключ показывается только один раз при создании.
        </div>
      </div>
    </div>
  );
};

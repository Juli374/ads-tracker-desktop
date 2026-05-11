import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AiSettings } from '../../../shared/ipc';
import { Card } from '../ui';
import { useToast } from '../../contexts/ToastContext';

/**
 * Phase J.3 Lane C — AI settings tab.
 *
 * Persists Claude API key + 4 model slots + brand-voice profile in local-db
 * (NOT Railway — personal-use track). Test button performs a real Anthropic
 * `/v1/messages` call from main process using the *just-typed* key (renderer
 * passes the field value, never the saved one — this lets the user verify a
 * new key before saving).
 */

type KeyStatus = 'configured' | 'not_configured' | 'invalid';
type TestStatus = { kind: 'idle' } | { kind: 'pass' } | { kind: 'fail'; error: string };

const SLOT_KEYS: Array<keyof AiSettings['models']> = [
  'completion',
  'vision',
  'fast',
  'advisor',
];

/**
 * Hard-coded model options. Future Anthropic models can be added here without
 * touching backend; the user can also paste a custom model id (kept as free text
 * fallback through the same dropdown via 'custom' shim). We intentionally do
 * not fetch the model list — Anthropic exposes one but it requires the key,
 * and we want the dropdown to render before the user even pastes a key.
 */
const MODEL_CHOICES: ReadonlyArray<string> = [
  'claude-opus-4-7',
  'claude-sonnet-4-7',
  'claude-haiku-4-5',
  'claude-3-5-sonnet-latest',
  'claude-3-5-haiku-latest',
];

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '•'.repeat(key.length);
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const AITab: React.FC = () => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [keyValue, setKeyValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<AiSettings['models']>({
    completion: 'claude-opus-4-7',
    vision: 'claude-opus-4-7',
    fast: 'claude-haiku-4-5',
    advisor: 'claude-opus-4-7',
  });
  const [pov, setPov] = useState('');
  const [toneText, setToneText] = useState('');
  const [bannedText, setBannedText] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>({ kind: 'idle' });

  // Hydrate from local-db on mount.
  useEffect(() => {
    let cancelled = false;
    window.api.ai
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        setKeyValue(s.claudeKey);
        setSavedKey(s.claudeKey);
        setModels(s.models);
        setPov(s.brandVoice.pov);
        setToneText(s.brandVoice.toneWords.join('\n'));
        setBannedText(s.brandVoice.bannedWords.join('\n'));
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const keyStatus: KeyStatus = useMemo(() => {
    if (testStatus.kind === 'fail') return 'invalid';
    if (savedKey.length > 0) return 'configured';
    return 'not_configured';
  }, [savedKey, testStatus]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const next: AiSettings = {
        claudeKey: keyValue,
        models,
        brandVoice: {
          pov: pov.trim(),
          toneWords: linesToList(toneText),
          bannedWords: linesToList(bannedText),
        },
      };
      await window.api.ai.setSettings(next);
      setSavedKey(keyValue);
      toast.success(t('ai.saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ai.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!keyValue.trim()) {
      toast.error(t('ai.testNeedsKey'));
      return;
    }
    setTesting(true);
    setTestStatus({ kind: 'idle' });
    try {
      const res = await window.api.ai.testKey(keyValue.trim(), models.fast);
      if (res.ok) {
        setTestStatus({ kind: 'pass' });
        toast.success(t('ai.testPass'));
      } else {
        const error = res.error ?? `HTTP ${res.status}`;
        setTestStatus({ kind: 'fail', error });
        toast.error(t('ai.testFail', { error }));
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      setTestStatus({ kind: 'fail', error });
      toast.error(t('ai.testFail', { error }));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="settings-ai-tab">
      {/* Key card */}
      <Card title={t('ai.keyTitle')}>
        <div className="px-5 py-5 space-y-4">
          <p className="text-xs text-zinc-500 leading-relaxed flex items-start gap-2">
            <Sparkles size={13} className="text-violet-500 mt-0.5 flex-shrink-0" />
            <span>{t('ai.keySubtitle')}</span>
          </p>

          <div>
            <label
              htmlFor="ai-key-input"
              className="block text-[11px] font-medium text-zinc-700 mb-1.5"
            >
              {t('ai.keyLabel')}
            </label>
            <div className="flex items-stretch gap-2">
              <div className="relative flex-1">
                <input
                  id="ai-key-input"
                  data-testid="settings-ai-key-input"
                  type={showKey ? 'text' : 'password'}
                  value={keyValue}
                  onChange={(e) => setKeyValue(e.target.value)}
                  placeholder={t('ai.keyPlaceholder')}
                  autoComplete="off"
                  spellCheck={false}
                  className="
                    w-full h-9 px-3 pr-9 text-xs font-mono rounded-md
                    border border-zinc-200 bg-white text-zinc-900
                    placeholder:text-zinc-400
                    focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
                  "
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  aria-label={showKey ? t('ai.keyHide') : t('ai.keyShow')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700"
                >
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !loaded}
                data-testid="settings-ai-test-key"
                className="
                  inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium
                  border border-zinc-200 bg-white text-zinc-700
                  hover:bg-zinc-50 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap
                "
              >
                {testing ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} />
                )}
                {testing ? t('ai.testing') : t('ai.test')}
              </button>
            </div>

            {savedKey.length > 0 && !showKey && (
              <p className="text-[10px] text-zinc-400 font-mono mt-1.5">
                {maskKey(savedKey)}
              </p>
            )}

            {testStatus.kind === 'pass' && (
              <p
                className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 mt-2"
                data-testid="settings-ai-test-pass"
              >
                <CheckCircle2 size={12} /> {t('ai.testPass')}
              </p>
            )}
            {testStatus.kind === 'fail' && (
              <p
                className="inline-flex items-center gap-1.5 text-[11px] text-red-600 mt-2"
                data-testid="settings-ai-test-fail"
                role="alert"
              >
                <XCircle size={12} /> {testStatus.error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span>{t('ai.statusLabel')}:</span>
              <KeyStatusBadge status={keyStatus} />
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !loaded}
              data-testid="settings-ai-save"
              className="
                inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium
                bg-zinc-900 text-white hover:bg-zinc-800 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {saving ? t('ai.saving') : t('ai.save')}
            </button>
          </div>
        </div>
      </Card>

      {/* Model slots card */}
      <Card title={t('ai.modelsTitle')}>
        <div className="px-5 py-5 space-y-4">
          <p className="text-[11px] text-zinc-500">{t('ai.modelsHint')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SLOT_KEYS.map((slot) => (
              <ModelSlotField
                key={slot}
                slot={slot}
                value={models[slot]}
                onChange={(v) => setModels((m) => ({ ...m, [slot]: v }))}
                label={t(`ai.models.${slot}` as 'ai.models.completion')}
              />
            ))}
          </div>
        </div>
      </Card>

      {/* Brand voice card */}
      <Card title={t('ai.brandTitle')}>
        <div className="px-5 py-5 space-y-4">
          <p className="text-[11px] text-zinc-500">{t('ai.brandHint')}</p>

          <div>
            <label
              htmlFor="ai-brand-pov"
              className="block text-[11px] font-medium text-zinc-700 mb-1.5"
            >
              {t('ai.brandPov')}
            </label>
            <input
              id="ai-brand-pov"
              data-testid="settings-ai-pov"
              type="text"
              value={pov}
              onChange={(e) => setPov(e.target.value)}
              placeholder={t('ai.brandPovPlaceholder')}
              className="
                w-full h-9 px-3 text-xs rounded-md
                border border-zinc-200 bg-white text-zinc-900
                placeholder:text-zinc-400
                focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
              "
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="ai-brand-tone"
                className="block text-[11px] font-medium text-zinc-700 mb-1.5"
              >
                {t('ai.brandTone')}
              </label>
              <textarea
                id="ai-brand-tone"
                data-testid="settings-ai-tone"
                value={toneText}
                onChange={(e) => setToneText(e.target.value)}
                placeholder={t('ai.brandTonePlaceholder')}
                rows={5}
                className="
                  w-full px-3 py-2 text-xs rounded-md
                  border border-zinc-200 bg-white text-zinc-900
                  placeholder:text-zinc-400 font-mono leading-relaxed
                  focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
                  resize-y
                "
              />
            </div>
            <div>
              <label
                htmlFor="ai-brand-banned"
                className="block text-[11px] font-medium text-zinc-700 mb-1.5"
              >
                {t('ai.brandBanned')}
              </label>
              <textarea
                id="ai-brand-banned"
                data-testid="settings-ai-banned"
                value={bannedText}
                onChange={(e) => setBannedText(e.target.value)}
                placeholder={t('ai.brandBannedPlaceholder')}
                rows={5}
                className="
                  w-full px-3 py-2 text-xs rounded-md
                  border border-zinc-200 bg-white text-zinc-900
                  placeholder:text-zinc-400 font-mono leading-relaxed
                  focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
                  resize-y
                "
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

interface SlotProps {
  slot: keyof AiSettings['models'];
  value: string;
  label: string;
  onChange(v: string): void;
}

const ModelSlotField: React.FC<SlotProps> = ({ slot, value, label, onChange }) => {
  // Allow free text by listing common choices in a datalist; user can paste a
  // custom id (e.g. a beta model) without rebuilding the dropdown.
  const listId = `ai-model-list-${slot}`;
  return (
    <div>
      <label
        htmlFor={`ai-model-${slot}`}
        className="block text-[11px] font-medium text-zinc-700 mb-1.5"
      >
        {label}
      </label>
      <input
        id={`ai-model-${slot}`}
        data-testid={`settings-ai-model-${slot}`}
        list={listId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="
          w-full h-9 px-3 text-xs font-mono rounded-md
          border border-zinc-200 bg-white text-zinc-900
          focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400
        "
      />
      <datalist id={listId}>
        {MODEL_CHOICES.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  );
};

const KeyStatusBadge: React.FC<{
  status: KeyStatus;
}> = ({ status }) => {
  const { t } = useTranslation('settings');
  const cls =
    status === 'configured'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : status === 'invalid'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-zinc-100 text-zinc-600 border-zinc-200';
  const label =
    status === 'configured'
      ? t('ai.statusConfigured')
      : status === 'invalid'
      ? t('ai.statusInvalid')
      : t('ai.statusNotConfigured');
  return (
    <span
      data-testid="settings-ai-status"
      className={`inline-flex items-center px-2 h-5 rounded-full text-[10px] font-medium uppercase tracking-wider border ${cls}`}
    >
      {label}
    </span>
  );
};

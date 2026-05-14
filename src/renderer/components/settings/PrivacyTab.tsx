// Phase N — Privacy / telemetry consent tab.
//
// Stub UI for the consent toggle. Persists `telemetry_consent` in local-db
// via the `telemetry:setConsent` IPC. The transport behind it is a no-op
// today (see src/main/telemetry.ts) — wiring this tab now means the
// UX is in place before crash reporting / analytics are added.

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Shield } from 'lucide-react';
import { Card } from '../ui';
import { useToast } from '../../contexts/ToastContext';

export const PrivacyTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.api.telemetry
      .getConsent()
      .then((value) => {
        if (cancelled) return;
        setConsent(value);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    try {
      await window.api.telemetry.setConsent(next);
      setConsent(next);
      toast.success(next ? t('privacy.optedIn') : t('privacy.optedOut'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('privacy.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="settings-privacy-tab">
      <Card title={t('privacy.title')}>
        <div className="px-5 py-5 space-y-4">
          <p className="text-xs text-zinc-500 leading-relaxed flex items-start gap-2">
            <Shield size={13} className="text-zinc-500 mt-0.5 flex-shrink-0" />
            <span>{t('privacy.intro')}</span>
          </p>

          <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3">
            <label
              htmlFor="privacy-consent"
              className="flex items-start gap-3 cursor-pointer"
            >
              <input
                id="privacy-consent"
                type="checkbox"
                checked={consent}
                disabled={!loaded || saving}
                onChange={(e) => handleToggle(e.target.checked)}
                data-testid="settings-privacy-consent"
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
              />
              <span className="flex-1">
                <span className="block text-xs font-medium text-zinc-900">
                  {t('privacy.consentLabel')}
                </span>
                <span className="block text-[11px] text-zinc-500 mt-1 leading-relaxed">
                  {t('privacy.consentHint')}
                </span>
              </span>
              {saving && <Loader2 size={13} className="animate-spin text-zinc-400 mt-0.5" />}
            </label>
          </div>

          <div className="text-[11px] text-zinc-400 leading-relaxed border-t border-zinc-100 pt-3">
            <p className="mb-1">
              <strong>{t('privacy.statusLabel')}:</strong>{' '}
              <span data-testid="settings-privacy-status">
                {consent ? t('privacy.statusOn') : t('privacy.statusOff')}
              </span>
            </p>
            <p>{t('privacy.transportStub')}</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

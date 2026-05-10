import React, { useCallback, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import { amazonAdsApi } from '../../api/amazonAds';
import { Card } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { useDeepLink } from '../../lib/useDeepLink';

const REDIRECT_URI = 'ads-tracker-desktop://callback';

/**
 * Генерим CSRF state локально и сохраняем в main через IPC. Фоллбек на
 * Math.random — для тестов / окружений без crypto.randomUUID (jsdom иногда
 * без него). В реальном Chromium всегда есть.
 */
function generateOAuthState(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: 32 hex chars. Не криптографически идеально, но лучше пусто.
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
}

export const CredentialsTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [connecting, setConnecting] = useState(false);
  const [completing, setCompleting] = useState(false);

  // === Deeplink callback handler ===
  // Когда юзер вернулся из браузера — main → renderer присылает deeplink-event.
  // Мы достаём state из URL, consume'им сохранённое в main значение и
  // сравниваем (constant-time не нужно — этот state одноразовый).
  // CSRF-mitigation: state живёт в main процесса (safeStorage), renderer не
  // может его подделать без compromised-main; и consumeState() one-shot —
  // повторный callback не сможет реюзать state.
  useDeepLink(
    useCallback(
      async (event) => {
        let url: URL;
        try {
          url = new URL(event.url);
        } catch {
          return;
        }
        if (url.host !== 'callback' && url.pathname.replace(/\/+/g, '') !== 'callback')
          return;

        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code) {
          toast.error(t('amazonAds.errors.missingCode'));
          return;
        }

        // ВАЖНО: сначала consume — это очищает saved state в main, чтобы
        // повторный callback (или атакующий, который как-то достучался до
        // нашего deeplink-handler'а) не мог его переиспользовать.
        let savedState: string | null = null;
        try {
          savedState = await window.api.oauth.consumeState();
        } catch {
          savedState = null;
        }

        if (!savedState || !state || savedState !== state) {
          toast.error(t('amazonAds.errors.stateMismatch'));
          return;
        }

        setCompleting(true);
        try {
          await amazonAdsApi.completeOAuth(code, state, REDIRECT_URI);
          toast.success(t('amazonAds.connected'));
        } catch (err) {
          toast.error(
            err instanceof ApiError ? err.message : t('amazonAds.errors.callbackFailed'),
          );
        } finally {
          setCompleting(false);
        }
      },
      [toast, t],
    ),
  );

  const handleConnect = async () => {
    setConnecting(true);
    try {
      // 1. Генерим state локально → пишем в main → запрашиваем authorize URL
      //    с тем же state у бэкенда. Если backend сгенерирует свой state
      //    (некоторые реализации так делают), мы используем именно его —
      //    тогда наш consume сравнит правильное значение.
      const localState = generateOAuthState();
      await window.api.oauth.writeState(localState);

      const res = await amazonAdsApi.startOAuth(REDIRECT_URI);

      // Если backend вернул собственный state — используем его (перезаписываем
      // local). Иначе используем local. В обоих случаях state в main строго
      // совпадает с тем, что улетит в Amazon redirect_uri → callback.
      if (res.state && res.state !== localState) {
        await window.api.oauth.writeState(res.state);
      }

      await window.api.shell.openExternal(res.url);
      toast.info(t('amazonAds.openHint'));
    } catch (err) {
      // При ошибке — чистим saved state, чтобы устаревшее значение не висело.
      try {
        await window.api.oauth.consumeState();
      } catch {
        // ignore
      }
      if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
        toast.error(t('amazonAds.errors.endpointUnavailable'));
      } else {
        toast.error(err instanceof ApiError ? err.message : t('amazonAds.errors.startFailed'));
      }
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Card title={t('credentials.cardTitle')} data-testid="settings-credentials-tab">
      <div className="px-5 py-4 space-y-3">
        <div className="text-xs text-zinc-500">{t('credentials.subtitle')}</div>
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting || completing}
          data-testid="credentials-connect-button"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connecting || completing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <ExternalLink size={12} />
          )}
          {completing
            ? t('amazonAds.completing')
            : connecting
            ? t('amazonAds.connecting')
            : t('amazonAds.connect')}
        </button>
        <div className="text-[10px] text-zinc-400 font-mono">
          {t('amazonAds.redirectUriPrefix', { uri: REDIRECT_URI })}
        </div>
      </div>
    </Card>
  );
};

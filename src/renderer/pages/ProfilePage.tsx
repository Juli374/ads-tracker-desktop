import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Upload, User as UserIcon } from 'lucide-react';
import { Card, ErrorBanner, PageHeader } from '../components/ui';
import { profileApi, type UserProfile } from '../api/profile';
import { ApiError } from '../api/client';
import { useToast } from '../contexts/ToastContext';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

export const ProfilePage: React.FC = () => {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const p = await profileApi.get();
        if (cancelled) return;
        setProfile(p);
        setFullName(p.full_name ?? '');
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : 'Failed to load profile';
        setLoadError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed) {
      toast.error(t('profile.errors.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const next = await profileApi.update({ full_name: trimmed });
      setProfile(next);
      setFullName(next.full_name ?? '');
      toast.success(t('profile.saved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('profile.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarPick = () => {
    fileRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow re-uploading same file later

    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      toast.error(t('profile.errors.avatarType'));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(t('profile.errors.avatarSize'));
      return;
    }

    setUploadingAvatar(true);
    try {
      const next = await profileApi.uploadAvatar(file);
      setProfile(next);
      toast.success(t('profile.avatarUploaded'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('profile.errors.avatarFailed'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="profile-page">
      <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />

      {loadError && <ErrorBanner message={loadError} />}

      {loading ? (
        <Card title={t('profile.loading')}>
          <div className="px-5 py-6 text-xs text-zinc-400">{t('profile.loading')}</div>
        </Card>
      ) : (
        profile && (
          <>
            <Card title={t('profile.sections.avatar')}>
              <div className="px-5 py-4 flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-500 overflow-hidden">
                  {profile.avatar ? (
                    <img
                      src={profile.avatar}
                      alt={profile.full_name ?? profile.email}
                      data-testid="profile-avatar-img"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserIcon size={28} />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={handleAvatarPick}
                    disabled={uploadingAvatar}
                    data-testid="profile-avatar-upload-btn"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 transition-colors w-fit"
                  >
                    {uploadingAvatar ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Upload size={12} />
                    )}
                    {uploadingAvatar ? t('profile.avatarUploading') : t('profile.avatarUpload')}
                  </button>
                  <span className="text-[11px] text-zinc-500">{t('profile.avatarHint')}</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPTED_AVATAR_TYPES.join(',')}
                    onChange={handleAvatarChange}
                    data-testid="profile-avatar-input"
                    className="hidden"
                  />
                </div>
              </div>
            </Card>

            <Card title={t('profile.sections.info')}>
              <form onSubmit={handleSave} className="px-5 py-4 space-y-4">
                <Field label={t('profile.fields.email')}>
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600"
                  />
                  <span className="block mt-1 text-[11px] text-zinc-500">
                    {t('profile.fields.emailHint')}
                  </span>
                </Field>

                <Field label={t('profile.fields.fullName')}>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    data-testid="profile-fullname-input"
                    className="w-full h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
                  />
                </Field>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">
                    {t('profile.fields.role', { role: profile.role })}
                  </span>
                  <button
                    type="submit"
                    disabled={saving || !fullName.trim()}
                    data-testid="profile-save-btn"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                  >
                    {saving && <Loader2 size={12} className="animate-spin" />}
                    {t('profile.save')}
                  </button>
                </div>
              </form>
            </Card>
          </>
        )
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-[11px] font-medium text-zinc-600 mb-1">{label}</span>
    {children}
  </label>
);

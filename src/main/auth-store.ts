import { app, safeStorage } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

// Никаких хардкод-токенов в исходниках. Токен берётся из:
// 1. ENV ADS_TRACKER_API_TOKEN (для CI/тестов)
// 2. Encrypted via safeStorage (production)
// 3. Plain-file fallback (unsigned dev — при отсутствии keychain)
// Если ни один источник не дал токен — возвращаем null, юзер увидит LoginScreen.

const TOKEN_FILE_ENC = 'auth-token.bin';
const TOKEN_FILE_PLAIN = 'auth-token.txt';

const encPath = (): string => path.join(app.getPath('userData'), TOKEN_FILE_ENC);
const plainPath = (): string => path.join(app.getPath('userData'), TOKEN_FILE_PLAIN);

function envToken(): string | null {
  const raw = process.env.ADS_TRACKER_API_TOKEN?.trim();
  return raw && raw.length > 0 ? raw : null;
}

async function readEncrypted(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const buf = await fs.readFile(encPath());
    return safeStorage.decryptString(buf);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

async function readPlain(): Promise<string | null> {
  try {
    const txt = await fs.readFile(plainPath(), 'utf8');
    const trimmed = txt.trim();
    if (trimmed.length > 0) {
      // Migration warn: plain-file всё ещё лежит на диске. writeToken теперь
      // его не создаёт (кроме explicit opt-in через ENV), но старые установки
      // могли его оставить. Видим в логах → знаем, что юзера надо мигрировать.
      // eslint-disable-next-line no-console
      console.warn(
        '[auth-store] reading token from plain-file fallback; safeStorage will be used on next writeToken()',
      );
      return trimmed;
    }
    return null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return null;
  }
}

export async function readToken(): Promise<string | null> {
  // 1) ENV override (тесты/CI)
  const fromEnv = envToken();
  if (fromEnv) return fromEnv;

  // 2) Зашифрованный keychain (production/signed builds)
  const fromEnc = await readEncrypted();
  if (fromEnc) return fromEnc;

  // 3) Plain-файл (unsigned dev/personal build, fallback когда
  //    safeStorage недоступен — например DMG без notarization)
  const fromPlain = await readPlain();
  if (fromPlain) return fromPlain;

  // 4) Ничего не нашли — юзер увидит LoginScreen.
  return null;
}

export async function writeToken(token: string): Promise<void> {
  // Всегда сначала пытаемся подчистить plain-файл — независимо от того,
  // удалось ли потом зашифровать. Иначе старое незашифрованное значение
  // лежит на диске даже после перехода на keychain (security-finding #3).
  try {
    await fs.unlink(plainPath());
  } catch {
    // ignore: ENOENT в норме
  }
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token);
    await fs.writeFile(encPath(), encrypted, { mode: 0o600 });
    return;
  }
  // Fallback: запись без шифрования НЕ разрешена по умолчанию. Это убирает
  // незаметную ловушку, в которой токен оказывался на диске в plaintext, если
  // safeStorage внезапно недоступен (например первый запуск signed-DMG до
  // unlock'а keychain'а). Опт-ин — только через ENV, чтобы dev мог
  // воспроизвести сценарий локально, но release-юзер никогда не наткнётся.
  if (process.env.ADS_TRACKER_ALLOW_PLAIN_TOKEN === '1') {
    // eslint-disable-next-line no-console
    console.warn(
      '[auth-store] safeStorage unavailable — writing token in plaintext per ADS_TRACKER_ALLOW_PLAIN_TOKEN=1',
    );
    await fs.writeFile(plainPath(), token, { encoding: 'utf8', mode: 0o600 });
    return;
  }
  throw new Error(
    'safeStorage encryption unavailable. Set ADS_TRACKER_ALLOW_PLAIN_TOKEN=1 to opt into plaintext fallback (dev only).',
  );
}

export async function clearToken(): Promise<void> {
  for (const p of [encPath(), plainPath()]) {
    try {
      await fs.unlink(p);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Игнорируем — не блокируем sign-out из-за одного из файлов
      }
    }
  }
}

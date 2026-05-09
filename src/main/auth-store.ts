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
    return trimmed.length > 0 ? trimmed : null;
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
  // Fallback: пишем без шифрования. Mode 0o600 — только владельцу.
  await fs.writeFile(plainPath(), token, { encoding: 'utf8', mode: 0o600 });
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

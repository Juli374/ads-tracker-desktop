import { app, safeStorage } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

const TOKEN_FILE = 'auth-token.bin';

const tokenPath = (): string => path.join(app.getPath('userData'), TOKEN_FILE);

export async function readToken(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }
  try {
    const buf = await fs.readFile(tokenPath());
    return safeStorage.decryptString(buf);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeToken(token: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption is not available on this system');
  }
  const encrypted = safeStorage.encryptString(token);
  await fs.writeFile(tokenPath(), encrypted, { mode: 0o600 });
}

export async function clearToken(): Promise<void> {
  try {
    await fs.unlink(tokenPath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

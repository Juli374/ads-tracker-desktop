import type { CoverQAReport, CoverQAPayload } from '../../shared/ipc';

/**
 * Read a File as raw base64 (without the data-URL prefix). Lifted from
 * `upload.ts` rather than imported to avoid coupling the two modules.
 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Analyse a browser `File` via the cover-qa IPC channel. Returns the report
 * from main process (sharp + heuristics). Tier-free feature shipped to all
 * users — no auth, no HTTP, no rate-limit.
 */
export async function analyzeCoverFile(
  file: File,
  target: CoverQAPayload['target'] = 'ebook',
): Promise<CoverQAReport> {
  const base64 = await readFileAsBase64(file);
  return window.api.coverQa.check({ base64, target });
}

/**
 * Analyse an absolute filesystem path. Useful for Local-Royalty-style flows
 * where the user picks a file via Electron's dialog (not implemented yet, but
 * the surface is ready).
 */
export function analyzeCoverPath(
  filePath: string,
  target: CoverQAPayload['target'] = 'ebook',
): Promise<CoverQAReport> {
  return window.api.coverQa.check({ path: filePath, target });
}

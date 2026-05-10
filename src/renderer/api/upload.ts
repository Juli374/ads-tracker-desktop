import type { MediaUploadFile } from '../../shared/ipc';
import { ApiError } from './client';

/**
 * Read a File object as base64 (strips the data-URL prefix).
 */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:<mime>;base64,<data>  →  <data>
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a single File via the media:upload IPC channel.
 *
 * @param path       API path starting with /api/
 * @param file       Browser File object
 * @param fieldName  FormData field name (default: "file")
 * @param formFields Optional additional text fields
 * @returns          Parsed response body, typed as T
 * @throws ApiError  When the server responds with a non-2xx status
 */
export async function uploadFile<T = unknown>(
  path: string,
  file: File,
  fieldName = 'file',
  formFields?: Record<string, string>,
): Promise<T> {
  const base64 = await readFileAsBase64(file);

  const uploadFile: MediaUploadFile = {
    field: fieldName,
    name: file.name,
    base64,
    contentType: file.type || 'application/octet-stream',
  };

  const response = await window.api.mediaUpload<T>({
    path,
    files: [uploadFile],
    formFields,
  });

  if (!response.ok) {
    throw new ApiError(
      response.error ?? `Upload failed (HTTP ${response.status})`,
      response.status,
    );
  }

  return response.data as T;
}

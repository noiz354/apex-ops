
export interface PreparedEvidence {
  blob: Blob;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256Hash: string;
  wasResized: boolean;
  previewUrl: string;
  release(): void;
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return '';
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function tryResize(file: File, maxEdge: number, quality: number): Promise<Blob | null> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return null;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    if (scale >= 1) {
      bmp.close();
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close();
      return null;
    }
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  } catch {
    return null;
  }
}

export async function prepareEvidence(
  file: File,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<PreparedEvidence> {
  const { maxEdge = 1600, quality = 0.8 } = opts;
  const previewUrl = URL.createObjectURL(file);

  const resized = await tryResize(file, maxEdge, quality);
  const blob = resized ?? file;
  const wasResized = resized !== null;

  let sha256Hash = '';
  try {
    sha256Hash = await sha256Hex(await blob.arrayBuffer());
  } catch {
  }

  return {
    blob,
    fileName: file.name || (wasResized ? 'evidence.jpg' : 'evidence'),
    mimeType: wasResized ? 'image/jpeg' : file.type || 'application/octet-stream',
    fileSize: blob.size,
    sha256Hash,
    wasResized,
    previewUrl,
    release: () => URL.revokeObjectURL(previewUrl),
  };
}

export function toEvidenceFormData(prepared: PreparedEvidence, taskId?: string | null): FormData {
  const form = new FormData();
  form.append('file', prepared.blob, prepared.fileName);
  if (prepared.sha256Hash) form.append('sha256Hash', prepared.sha256Hash);
  if (taskId) form.append('taskId', taskId);
  return form;
}

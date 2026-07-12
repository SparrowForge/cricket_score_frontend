'use client';

import { useRef, useState } from 'react';
import { apiUpload } from '@/lib/api';

/**
 * Image upload button → Cloudinary via the media API.
 * onUploaded receives {id, cdn_url} (asset id for FKs, URL for direct fields).
 */
export function UploadButton({ label = 'Upload image', folder, onUploaded }: {
  label?: string;
  folder?: string;
  onUploaded: (asset: { id: string; cdn_url: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(null);
    try {
      onUploaded(await apiUpload(file, folder));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={onFile} />
      <button type="button" className="btn-ghost !py-1.5 text-xs" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? 'Uploading…' : `📷 ${label}`}
      </button>
      {error && <span className="text-xs text-cherry">{error}</span>}
    </span>
  );
}

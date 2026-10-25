import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AttachmentType } from '@/lib/database.types';
import { ImageLightbox } from './ImageLightbox';

/** Signed URL for a private chat attachment. Cached just under its expiry. */
function useSignedUrl(path: string | null) {
  return useQuery({
    queryKey: ['attachment-url', path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function ChatAttachment({
  path,
  name,
  type,
  isMe,
}: {
  path: string;
  name: string | null;
  type: AttachmentType;
  isMe: boolean;
}) {
  const url = useSignedUrl(path);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (type === 'image') {
    return (
      <>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          disabled={!url.data}
          className="block disabled:cursor-default"
        >
          {url.data ? (
            <img
              src={url.data}
              alt={name ?? 'Attachment'}
              className="max-h-60 w-full rounded-xl object-cover"
            />
          ) : (
            <div className="h-40 w-48 animate-pulse rounded-xl bg-navy-100" />
          )}
        </button>
        {previewOpen && url.data && (
          <ImageLightbox src={url.data} alt={name ?? 'Attachment'} onClose={() => setPreviewOpen(false)} />
        )}
      </>
    );
  }

  return (
    <a
      href={url.data ?? undefined}
      target="_blank"
      rel="noreferrer"
      download={name ?? undefined}
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors ${
        isMe ? 'bg-navy-700 hover:bg-navy-600' : 'bg-navy-200 hover:bg-navy-300'
      }`}
    >
      <FileText className={`h-5 w-5 shrink-0 ${isMe ? 'text-white' : 'text-ink-muted'}`} />
      <span className={`min-w-0 flex-1 truncate text-xs ${isMe ? 'text-white' : 'text-ink'}`}>
        {name ?? 'File'}
      </span>
      <Download className={`h-4 w-4 shrink-0 ${isMe ? 'text-navy-300' : 'text-ink-subtle'}`} />
    </a>
  );
}

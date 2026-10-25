import { useRef, useState } from 'react';
import { Send, Paperclip, X, FileText, Loader2 } from 'lucide-react';
import { errorMessage } from '@/lib/supabase';
import { compressImage } from '@/lib/imageCompression';
import { useUploadAttachment } from '@/hooks/useChat';
import type { AttachmentType } from '@/lib/database.types';

export interface PendingAttachment {
  path: string;
  name: string;
  type: AttachmentType;
  previewUrl: string | null;
}

export function MessageInput({
  onSend,
  disabled,
}: {
  onSend: (content: string, attachment: PendingAttachment | null) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAttachment();

  const pickFile = async (file: File) => {
    setError(null);
    try {
      const compressed = await compressImage(file);
      const { path, type } = await upload.mutateAsync(compressed);
      setAttachment({
        path,
        name: file.name,
        type,
        previewUrl: type === 'image' ? URL.createObjectURL(compressed) : null,
      });
    } catch (err) {
      setError(errorMessage(err, 'Could not upload the file.'));
    }
  };

  const clearAttachment = () => {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed && !attachment) return;
    onSend(trimmed, attachment);
    setText('');
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachment(null);
  };

  return (
    <div className="border-t border-navy-100 bg-white px-4 py-3">
      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">
          {error}
        </p>
      )}

      {/* Pending attachment chip */}
      {attachment && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-navy-50 p-2">
          {attachment.previewUrl ? (
            <img src={attachment.previewUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-navy-100">
              <FileText className="h-5 w-5 text-ink-muted" />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{attachment.name}</span>
          <button
            onClick={clearAttachment}
            aria-label="Remove attachment"
            className="rounded-lg p-1 text-ink-subtle hover:bg-navy-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickFile(f);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending || !!attachment}
          aria-label="Attach a file"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-navy-100 disabled:opacity-40"
        >
          {upload.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Paperclip className="h-5 w-5" />
          )}
        </button>

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Type a message…"
          disabled={disabled}
          className="flex-1 rounded-xl border border-navy-200 bg-navy-50/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-volt-400 focus:outline-none focus:ring-2 focus:ring-volt-400/30"
        />
        <button
          onClick={submit}
          disabled={disabled || (!text.trim() && !attachment)}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-white transition-colors hover:bg-navy-700 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

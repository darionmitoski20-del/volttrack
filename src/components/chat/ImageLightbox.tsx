import { useEffect } from 'react';
import { Download, X } from 'lucide-react';

/** Full-screen preview for a chat image — opens in-place instead of a new tab. */
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/90 p-4 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute right-4 top-4 flex gap-2">
        <a
          href={src}
          download
          onClick={(e) => e.stopPropagation()}
          aria-label="Download image"
          className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <Download className="h-5 w-5" />
        </a>
        <button
          onClick={onClose}
          aria-label="Close preview"
          className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <img src={src} alt={alt} className="max-h-[85vh] max-w-full rounded-xl object-contain" />
    </div>
  );
}

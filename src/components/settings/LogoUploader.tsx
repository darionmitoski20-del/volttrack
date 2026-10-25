import { useRef, useState } from 'react';
import { Building2, Camera } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { errorMessage } from '@/lib/supabase';
import { useUploadCompanyLogo } from '@/hooks/useCompany';

const VIEWPORT = 240; // crop preview size, px
const OUTPUT = 320; // exported logo size, px

/** Renders the cropped square from `img` at the current pan/zoom onto a canvas and returns it as a PNG blob. */
function renderCrop(img: HTMLImageElement, zoom: number, offset: { x: number; y: number }): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas not supported'));

  const scale = (OUTPUT / VIEWPORT) * zoom;
  const baseFit = Math.max(VIEWPORT / img.naturalWidth, VIEWPORT / img.naturalHeight);
  const drawWidth = img.naturalWidth * baseFit * scale;
  const drawHeight = img.naturalHeight * baseFit * scale;
  const dx = (OUTPUT - drawWidth) / 2 + offset.x * (OUTPUT / VIEWPORT);
  const dy = (OUTPUT - drawHeight) / 2 + offset.y * (OUTPUT / VIEWPORT);

  ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not export image'))), 'image/png');
  });
}

export function LogoUploader({
  logoUrl,
  companyName,
  onUploaded,
}: {
  logoUrl: string | null;
  companyName: string;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origin: { x: number; y: number } } | null>(null);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);

  const upload = useUploadCompanyLogo();

  function handleFile(file: File) {
    setError(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: offset };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const { startX, startY, origin } = dragRef.current;
    setOffset({ x: origin.x + (e.clientX - startX), y: origin.y + (e.clientY - startY) });
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  async function handleSave() {
    if (!imgRef.current) return;
    setError(null);
    try {
      const blob = await renderCrop(imgRef.current, zoom, offset);
      const url = await upload.mutateAsync(blob);
      onUploaded(url);
      setImageSrc(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not upload logo.'));
    }
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-navy-100 bg-navy-50">
          {logoUrl ? (
            <img src={logoUrl} alt={`${companyName} logo`} className="h-full w-full object-cover" />
          ) : (
            <Building2 className="h-7 w-7 text-ink-subtle" />
          )}
        </div>
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Camera className="h-4 w-4" />}
            onClick={() => inputRef.current?.click()}
          >
            {logoUrl ? 'Change logo' : 'Upload logo'}
          </Button>
          <p className="mt-1 text-xs text-ink-subtle">PNG or JPG, square works best.</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      <Modal open={!!imageSrc} onClose={() => setImageSrc(null)} title="Adjust logo" className="max-w-sm">
        <div className="space-y-4">
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {imageSrc && (
            <div
              className="mx-auto touch-none overflow-hidden rounded-2xl border border-navy-100 bg-navy-50"
              style={{ width: VIEWPORT, height: VIEWPORT }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Logo preview"
                draggable={false}
                className="h-full w-full select-none object-cover"
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
              />
            </div>
          )}
          <div>
            <label htmlFor="logo-zoom" className="block text-xs font-medium text-ink-muted">
              Zoom
            </label>
            <input
              id="logo-zoom"
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-volt-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setImageSrc(null)} disabled={upload.isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} loading={upload.isPending}>
              Save logo
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

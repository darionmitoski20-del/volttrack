const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;
const SKIP_BELOW_BYTES = 300 * 1024; // not worth compressing small images

/**
 * Downscales + re-encodes an image client-side before upload. Animated GIFs
 * and already-small files pass through untouched (canvas re-encoding would
 * flatten GIF animation to a single frame).
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  if (file.size <= SKIP_BELOW_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outputType, JPEG_QUALITY),
  );
  if (!blob || blob.size >= file.size) return file;

  const newName = outputType === 'image/jpeg' ? file.name.replace(/\.\w+$/, '.jpg') : file.name;
  return new File([blob], newName, { type: outputType });
}

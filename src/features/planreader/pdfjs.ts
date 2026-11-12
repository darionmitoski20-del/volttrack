// pdf.js is loaded from a CDN on demand (only the owner needs it, when uploading a plan),
// so it adds nothing to the app bundle.
const VERSION = '6.2.108';
const BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/build`;

let loading: Promise<unknown> | null = null;

export function loadPdfjs(): Promise<unknown> {
  if (!loading) {
    loading = import(/* @vite-ignore */ `${BASE}/pdf.min.mjs`).then((lib: { GlobalWorkerOptions: { workerSrc: string } }) => {
      lib.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`;
      return lib;
    });
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

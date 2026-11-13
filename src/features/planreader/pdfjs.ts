// pdf.js is loaded from a CDN on demand (only the owner needs it, when uploading a plan),
// so it adds nothing to the app bundle.
//
// The "legacy" build is used because the modern build relies on JavaScript features that
// Safari on iPhone does not have yet ("undefined is not a function (near '...t of e...')").
// If the legacy build cannot be loaded for some reason, fall back to the modern build.
const VERSION = '6.2.108';
const ROOT = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}`;
const BUILDS = [`${ROOT}/legacy/build`, `${ROOT}/build`];

type PdfjsLib = { GlobalWorkerOptions: { workerSrc: string } };

let loading: Promise<unknown> | null = null;

async function loadFrom(base: string): Promise<PdfjsLib> {
  const lib = (await import(/* @vite-ignore */ `${base}/pdf.min.mjs`)) as PdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.mjs`;
  return lib;
}

export function loadPdfjs(): Promise<unknown> {
  if (!loading) {
    loading = (async () => {
      let lastError: unknown;
      for (const base of BUILDS) {
        try {
          return await loadFrom(base);
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

// pdf.js is loaded from a CDN on demand (only the owner needs it, when uploading a plan),
// so it adds nothing to the app bundle.
//
// The "legacy" build is used because the modern build relies on JavaScript features that
// Safari on iPhone does not have yet. If the legacy build cannot be loaded for some reason,
// fall back to the modern build.
//
// Safari also cannot loop over a ReadableStream with `for await` (pdf.js does this when it
// reads text), which shows up as "undefined is not a function (near '...t of e...')".
// We add that missing piece both in the page and inside pdf.js's worker.
const VERSION = '6.2.108';
const ROOT = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}`;
const BUILDS = [`${ROOT}/legacy/build`, `${ROOT}/build`];

// Same code as streamIteratorPolyfill(), as text, so it can run first inside the worker.
const POLYFILL_SRC = `(() => {
  const RS = globalThis.ReadableStream;
  if (!RS || RS.prototype[Symbol.asyncIterator]) return;
  const iter = async function* () {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
  RS.prototype[Symbol.asyncIterator] = iter;
  if (!RS.prototype.values) RS.prototype.values = iter;
})();`;

function streamIteratorPolyfill() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const RS = (globalThis as any).ReadableStream;
  if (!RS || RS.prototype[Symbol.asyncIterator]) return;
  const iter = async function* (this: ReadableStream) {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
  RS.prototype[Symbol.asyncIterator] = iter;
  if (!RS.prototype.values) RS.prototype.values = iter;
}

type PdfjsLib = { GlobalWorkerOptions: { workerSrc: string } };

let loading: Promise<unknown> | null = null;

async function loadFrom(base: string, needsWorkerPolyfill: boolean): Promise<PdfjsLib> {
  const lib = (await import(/* @vite-ignore */ `${base}/pdf.min.mjs`)) as PdfjsLib;
  const workerUrl = `${base}/pdf.worker.min.mjs`;
  if (needsWorkerPolyfill) {
    // A tiny module worker that adds the polyfill, then loads the real pdf.js worker.
    const src = `${POLYFILL_SRC}\nimport ${JSON.stringify(workerUrl)};\n`;
    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  } else {
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return lib;
}

export function loadPdfjs(): Promise<unknown> {
  if (!loading) {
    loading = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RS = (globalThis as any).ReadableStream;
      const needsWorkerPolyfill = !!RS && !RS.prototype[Symbol.asyncIterator];
      streamIteratorPolyfill();
      let lastError: unknown;
      for (const base of BUILDS) {
        try {
          return await loadFrom(base, needsWorkerPolyfill);
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

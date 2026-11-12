// @ts-nocheck
// Plan Reader engine — reads electrical plan PDFs in the browser with pdf.js.
// Turns on only the AutoCAD layers that hold devices, matches each symbol against
// the trained library, reads text tags (L4, EM2, OS, WAP...) and assigns every
// device to a room using the wall layer and the room tags (220, 221A, C-10...).
//   readPlan(pdfjsLib, data, library, onProgress) -> { sheets, items }

const DPI = 150, K = DPI / 72, S = 40;
export let NORM_T = 15; export function setNormT(v) { NORM_T = v; }

export const CLASSES = {
  DUP: 'Duplex receptacle (TR)', QUAD: 'Quad receptacle', GFCI: 'GFCI receptacle',
  J: 'Junction box (J)', EQ: 'Equipment connection (VAV/mech.)', RECT: 'Disconnect / equipment',
  DATA: 'Data outlet', EXIT: 'Exit sign',
  SS: 'Speaker/strobe – ceiling', SS_W: 'Speaker/strobe – wall', BS: 'Blue-lens strobe',
  SPK: 'Speaker – ceiling', SMK: 'Smoke detector', SMK_EL: 'Smoke detector – elevator lobby',
  SMK_DUCT: 'Duct smoke detector', HEAT: 'Heat detector', CO: 'CO detector',
  P: 'Emergency push button (P)', F: 'Pull station', MM: 'Monitor module',
  TS: 'Tamper switch', WFS: 'Water-flow switch', FACP: 'Fire alarm panel (FACP)',
  COMM: 'Communicator', ANN: 'Annunciator', WPHS: 'Exterior horn/strobe (WP)',
  OS: 'Occupancy sensor (OS)', VS: 'Vacancy sensor (VS)', DS: 'Daylight sensor (DS)',
  RC: 'Room controller (RC)', D: 'Dimmer switch (D)',
  SP: 'PA speaker + clock (SP)', WAP: 'Wireless access point (WAP)', EPB: 'Panic button (EPB)', DH: 'Door holder (DH)',
};
export const UNCERTAIN = ['RECT', 'EQ', 'EXIT'];

export function className(cls) {
  const ex = cls.endsWith('_E'), base = ex ? cls.slice(0, -2) : cls;
  let n = /^L\d+$/.test(base) ? `Light fixture ${base}` : /^EM\d+$/.test(base) ? `Emergency light ${base}` : (CLASSES[base] || base);
  return n + (ex ? ' (existing)' : '');
}

const DISCIPLINES = [[/^FIRE ALARM/, 'Fire alarm'], [/^LOW[ -]VOLTAGE/, 'Low voltage'], [/^LIGHTING/, 'Lighting'], [/^POWER/, 'Power']];
const FLOORS = { BASEMENT: ['Basement', 0], GROUND: ['Ground floor', 1], FIRST: ['1st floor', 1], '1ST': ['1st floor', 1], SECOND: ['2nd floor', 2], '2ND': ['2nd floor', 2], THIRD: ['3rd floor', 3], '3RD': ['3rd floor', 3], FOURTH: ['4th floor', 4], '4TH': ['4th floor', 4] };
const TITLE_RE = /\b(BASEMENT|GROUND|FIRST|1ST|SECOND|2ND|THIRD|3RD|FOURTH|4TH)\s+FLOOR\s+(?:ELECTRICAL\s+)?(FIRE ALARM|LOW[ -]VOLTAGE|LIGHTING|POWER)\s+PLAN\b/g;
const SKIP_RE = /DEMOLITION|TEMPORARY|DEMO\b/;
const SHEETNO_RE = /^(E|FA|EL|EP|ES|T)\d{1,2}\.\d{1,2}[A-Z]?$/;
const LAYER_GROUPS = {
  'Power': [['pwr', /^E-New-Powr-Wall$/]],
  'Low voltage': [['lv', /^E-(New-Powr-Wall|Wall-Powr-Neww)$/]],
  'Lighting': [['emer', /Lite-Emer$/]],
  'Fire alarm': [['init', /FA-Initiating/], ['notif', /FA-Notification/]],
};
const ROTATE = new Set(['pwr', 'emer', 'lv']);
const TEXT_TAGS = { 'Lighting': [/^L\d$/, /^EM\d$/, /^(OS|VS|DS|RC|D)$/], 'Low voltage': [/^(SP|WAP|EPB|DH)$/] };
const WALL = n => /^(A-WALL|A-GLAZ)/i.test(n.split('|').pop());

// ------------------------------------------------------------------ симболи: битмапи 40x40
function hex2f(h) {
  const f = new Uint8Array(S * S);
  for (let i = 0; i < S * S; i++) { const byte = parseInt(h.substr((i >> 3) * 2, 2), 16); f[i] = (byte >> (7 - (i & 7))) & 1; }
  return f;
}
function f2hex(f) {
  let s = '';
  for (let i = 0; i < S * S; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | (f[i + j] ? 1 : 0); s += b.toString(16).padStart(2, '0'); }
  return s;
}
function iou(a, b) { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { i += a[k] & b[k]; u += a[k] | b[k]; } return u ? i / u : 0; }
function rot90(f) { const o = new Uint8Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) o[(S - 1 - x) * S + y] = f[y * S + x]; return o; }
function flipH(f) { const o = new Uint8Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) o[y * S + (S - 1 - x)] = f[y * S + x]; return o; }
function sim(a, b, rot) {
  if (!rot) return iou(a, b);
  let best = 0, r = b;
  for (let k = 0; k < 4; k++) { best = Math.max(best, iou(a, r), iou(a, flipH(r))); r = rot90(r); }
  return best;
}
// исечок (инвертирана сива слика) -> квадрат -> 40x40 со просекување по површина -> праг
function norm(gray, W, x0, y0, w, h) {
  const m = Math.max(w, h) + 4, ox = ((m - w) >> 1), oy = ((m - h) >> 1);
  const pad = new Float32Array(m * m);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pad[(y + oy) * m + x + ox] = 255 - gray[(y0 + y) * W + x0 + x];
  const out = new Uint8Array(S * S), sc = m / S;
  for (let ty = 0; ty < S; ty++) {
    const sy0 = ty * sc, sy1 = sy0 + sc;
    for (let tx = 0; tx < S; tx++) {
      const sx0 = tx * sc, sx1 = sx0 + sc;
      let acc = 0, wt = 0;
      for (let sy = Math.floor(sy0); sy < Math.min(m, Math.ceil(sy1)); sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        for (let sx = Math.floor(sx0); sx < Math.min(m, Math.ceil(sx1)); sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          acc += pad[sy * m + sx] * wx * wy; wt += wx * wy;
        }
      }
      out[ty * S + tx] = (wt ? acc / wt : 0) > NORM_T ? 1 : 0;
    }
  }
  return out;
}

// штекер: колку страни имаат линии што излегуваат од кругот (2 = дуплекс, 4 = quad)
function receptacleSides(f) {
  const band = (y0, y1, x0, x1) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) n += f[y * S + x]; return n; };
  const lo = 1, hi = 7, a = 13, b = 27;
  return [band(lo, hi, a, b), band(S - hi, S - lo, a, b), band(a, b, lo, hi), band(a, b, S - hi, S - lo)].filter(v => v >= 3).length;
}
export class Library {
  constructor(json) {
    this.json = json;
    this.entries = json.entries.map(e => ({ g: e.g, cls: e.cls, dims: e.dims, f: hex2f(e.f) }));
    this.pf = { P: hex2f(json.pf.P), F: hex2f(json.pf.F) };
  }
  add(g, cls, dims, fhex) { this.json.entries.push({ g, cls, dims, f: fhex }); this.entries.push({ g, cls, dims, f: hex2f(fhex) }); }
  classify(g, f, dims) {
    let best = [0, null];
    for (const e of this.entries) {
      if (e.g !== g || Math.abs(dims[0] - e.dims[0]) > 4 || Math.abs(dims[1] - e.dims[1]) > 4) continue;
      const s = sim(e.f, f, ROTATE.has(g));
      if (s > best[0]) best = [s, e];
    }
    return best;
  }
}

// ------------------------------------------------------------------ растерски помошни функции
function dilate(bin, W, H, r) { // квадрат (2r+1)
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let run = -1e9; const row = y * W;
    for (let x = 0; x < W; x++) if (bin[row + x]) { for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) tmp[row + k] = 1; }
  }
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (tmp[y * W + x]) { for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) out[k * W + x] = 1; }
  return out;
}
function erode(bin, W, H, r) { const inv = new Uint8Array(W * H); for (let i = 0; i < inv.length; i++) inv[i] = bin[i] ? 0 : 1; const d = dilate(inv, W, H, r); for (let i = 0; i < d.length; i++) d[i] = d[i] ? 0 : 1; return d; }
function components(bin, W, H, conn8 = true) { // -> {labels, stats:[{x,y,w,h,a}]}
  const lab = new Int32Array(W * H), stats = [], stack = new Int32Array(W * H);
  let n = 0;
  for (let p = 0; p < W * H; p++) {
    if (!bin[p] || lab[p]) continue;
    n++; let sp = 0; stack[sp++] = p; lab[p] = n;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, a = 0;
    while (sp) {
      const q = stack[--sp], qx = q % W, qy = (q / W) | 0; a++;
      if (qx < x0) x0 = qx; if (qx > x1) x1 = qx; if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; if (!conn8 && dx && dy) continue;
        const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nq = ny * W + nx; if (bin[nq] && !lab[nq]) { lab[nq] = n; stack[sp++] = nq; }
      }
    }
    stats.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, a });
  }
  return { labels: lab, stats };
}
function maxpool(bin, W, H, f) { const w = Math.floor(W / f), h = Math.floor(H / f), o = new Uint8Array(w * h); for (let y = 0; y < h * f; y++) for (let x = 0; x < w * f; x++) if (bin[y * W + x]) o[((y / f) | 0) * w + ((x / f) | 0)] = 1; return { o, w, h }; }
// најблизок извор (multi-source BFS, 8 соседи) -> {dist, src}
function nearest(srcMask, W, H) {
  const dist = new Int32Array(W * H).fill(-1), src = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H); let qh = 0, qt = 0;
  for (let p = 0; p < W * H; p++) if (srcMask[p]) { dist[p] = 0; src[p] = p; q[qt++] = p; }
  while (qh < qt) {
    const p = q[qh++], px = p % W, py = (p / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const nx = px + dx, ny = py + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx; if (dist[n] >= 0) continue; dist[n] = dist[p] + 1; src[n] = src[p]; q[qt++] = n;
    }
  }
  return { dist, src };
}

// ------------------------------------------------------------------ FFT за порамнување на листови
function fft1(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) {
      const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
      re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
      const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
function fft2(re, im, N, inv) {
  const r = new Float64Array(N), i = new Float64Array(N);
  for (let y = 0; y < N; y++) { for (let x = 0; x < N; x++) { r[x] = re[y * N + x]; i[x] = im[y * N + x]; } fft1(r, i, inv); for (let x = 0; x < N; x++) { re[y * N + x] = r[x]; im[y * N + x] = i[x]; } }
  for (let x = 0; x < N; x++) { for (let y = 0; y < N; y++) { r[y] = re[y * N + x]; i[y] = im[y * N + x]; } fft1(r, i, inv); for (let y = 0; y < N; y++) { re[y * N + x] = r[y]; im[y * N + x] = i[y]; } }
}
// a, b: бинарни слики (ѕидови) со иста скала; враќа поместување d (pt) така што ref = sheet + d
function alignWalls(a, aw, ah, b, bw, bh, step) {
  const N = 1024, pool = (m, w, h) => { const o = new Float64Array(N * N); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { const X = (x / step) | 0, Y = (y / step) | 0; if (X < N && Y < N) o[Y * N + X] += 1; } return o; };
  const A = pool(a, aw, ah), B = pool(b, bw, bh), Ai = new Float64Array(N * N), Bi = new Float64Array(N * N);
  const W = Math.min(N, Math.ceil(Math.max(aw, bw) / step)), Hh = Math.min(N, Math.ceil(Math.max(ah, bh) / step));
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { const h = (0.5 - 0.5 * Math.cos(2 * Math.PI * x / (W - 1))) * (0.5 - 0.5 * Math.cos(2 * Math.PI * y / (Hh - 1))); A[y * N + x] *= h; B[y * N + x] *= h; }
  fft2(A, Ai, N, false); fft2(B, Bi, N, false);
  for (let k = 0; k < N * N; k++) { const r = A[k] * B[k] + Ai[k] * Bi[k], i = Ai[k] * B[k] - A[k] * Bi[k], m = Math.hypot(r, i) || 1; A[k] = r / m; Ai[k] = i / m; }
  fft2(A, Ai, N, true);
  let best = -1e18, bx = 0, by = 0, sum = 0;
  for (let k = 0; k < N * N; k++) { sum += Math.abs(A[k]); if (A[k] > best) { best = A[k]; bx = k % N; by = (k / N) | 0; } }
  if (bx > N / 2) bx -= N; if (by > N / 2) by -= N;
  return { dx: bx * step / K, dy: by * step / K, resp: best / (sum / (N * N)) };
}

// ------------------------------------------------------------------ PDF
async function pageWords(page) {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const words = []; words.raw = [];
  for (const it of tc.items) {
    if (it.str && it.str.trim()) words.raw.push(it.str);
    if (!it.str || !it.str.trim()) continue;
    const [a, b, c, d, e, f] = it.transform, fs = Math.hypot(c, d) || Math.hypot(a, b);
    const ux = a / (Math.hypot(a, b) || 1), uy = b / (Math.hypot(a, b) || 1), vx = c / (Math.hypot(c, d) || 1), vy = d / (Math.hypot(c, d) || 1);
    const per = it.width / it.str.length;
    let i = 0;
    for (const m of it.str.matchAll(/\S+/g)) {
      const s0 = m.index * per, s1 = (m.index + m[0].length) * per;
      const pts = [[s0, -0.2 * fs], [s1, -0.2 * fs], [s0, 0.8 * fs], [s1, 0.8 * fs]].map(([s, t]) => vp.convertToViewportPoint(e + ux * s + vx * t, f + uy * s + vy * t));
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      words.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), m[0]]);
      i++;
    }
  }
  return words;
}
function lines(words) {
  const ws = words.slice().sort((p, q) => (p[1] + p[3]) / 2 - (q[1] + q[3]) / 2 || p[0] - q[0]), out = [];
  let cur = [], cy = null;
  for (const w of ws) { const y = (w[1] + w[3]) / 2; if (cy === null || Math.abs(y - cy) < 2.5) { cur.push(w); cy = cy === null ? y : cy; } else { out.push(cur); cur = [w]; cy = y; } }
  if (cur.length) out.push(cur);
  return out.map(l => l.sort((p, q) => p[0] - q[0]).map(w => w[4]).join(' '));
}

async function renderGray(page, scale, config, pdfDoc) {
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, canvas, viewport: vp, optionalContentConfigPromise: config ? Promise.resolve(config) : undefined, background: 'rgb(255,255,255)' }).promise;
  const W = canvas.width, H = canvas.height, d = ctx.getImageData(0, 0, W, H).data, g = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
  canvas.width = canvas.height = 0;
  return { gray: g, W, H };
}
async function layerConfig(pdfDoc, pred) {
  const cfg = await pdfDoc.getOptionalContentConfig({ intent: 'display' });
  if (!cfg) return null;
  for (const [id, grp] of cfg) cfg.setVisibility(id, pred(grp.name || ''), false);
  return cfg;
}
async function layerNames(pdfDoc) {
  const cfg = await pdfDoc.getOptionalContentConfig({ intent: 'display' }); const out = [];
  if (cfg) for (const [, grp] of cfg) out.push(grp.name || '');
  return out;
}

function detectComponents(gray, W, H, widthPt) {
  const bin = new Uint8Array(W * H), cut = Math.floor((widthPt - 230) * K);
  for (let y = 0; y < H; y++) for (let x = 0; x < Math.min(W, cut); x++) bin[y * W + x] = gray[y * W + x] < 200 ? 1 : 0;
  const d = dilate(bin, W, H, 2), { stats } = components(d, W, H, true);
  return stats.filter(s => s.a > 15 && s.w < 200 && s.h < 200).map(s => ({ ...s, f: norm(gray, W, s.x, s.y, s.w, s.h), dims: [Math.min(s.w, s.h), Math.max(s.w, s.h)] }));
}
function cropPng(gray, W, H, c, pad = 10) {
  const x0 = Math.max(0, c.x - pad), y0 = Math.max(0, c.y - pad), x1 = Math.min(W, c.x + c.w + pad), y1 = Math.min(H, c.y + c.h + pad), w = x1 - x0, h = y1 - y0;
  const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2; const ctx = cv.getContext('2d'), im = ctx.createImageData(w * 2, h * 2);
  for (let y = 0; y < h * 2; y++) for (let x = 0; x < w * 2; x++) { const v = gray[(y0 + (y >> 1)) * W + x0 + (x >> 1)], j = (y * w * 2 + x) * 4; im.data[j] = im.data[j + 1] = im.data[j + 2] = v; im.data[j + 3] = 255; }
  ctx.putImageData(im, 0, 0); return cv.toDataURL('image/png');
}

async function detectSymbols(lib, pdfDoc, page, sheet, names) {
  const items = [];
  for (const [g, pat] of LAYER_GROUPS[sheet.discipline] || []) {
    const L = new Set(names.filter(n => !n.includes('|') && pat.test(n)));
    if (!L.size) continue;
    const cfg = await layerConfig(pdfDoc, n => L.has(n));
    const { gray, W, H } = await renderGray(page, K, cfg);
    for (const c of detectComponents(gray, W, H, sheet.width)) {
      const cx = (c.x + c.w / 2) / K, cy = (c.y + c.h / 2) / K;
      if (g === 'emer') { if (c.dims[1] / Math.max(1, c.dims[0]) > 2.3 && c.dims[0] < 12) items.push({ cls: 'EXIT', x: cx, y: cy, conf: 0.9, src: 'symbol' }); continue; }
      const [s, e] = lib.classify(g, c.f, c.dims);
      if (s < 0.6) { if (c.w * c.h > 150) items.push({ cls: 'UNKNOWN', x: cx, y: cy, conf: +s.toFixed(2), src: 'symbol', group: g, dims: c.dims, feat: f2hex(c.f), crop: cropPng(gray, W, H, c) }); continue; }
      const recept = e.cls.length === 1 && (e.cls[0] === 'DUP' || e.cls[0] === 'QUAD');
      for (let cls of e.cls) {
        if (recept && c.dims[1] >= 26 && c.dims[1] <= 33) cls = c.dims[0] >= 23 ? 'QUAD' : 'DUP';  // quad е поширок (24-25 px наспроти 20-21)
        if (cls === 'PF') cls = sim(lib.pf.P, c.f, false) >= sim(lib.pf.F, c.f, false) ? 'P' : 'F';
        items.push({ cls, x: cx, y: cy, conf: +s.toFixed(2), src: 'symbol' });
      }
    }
  }
  for (const t of items.filter(i => i.cls === 'GFCI_TAG')) {
    const cand = items.filter(i => i.cls === 'DUP'); if (!cand.length) continue;
    const n = cand.reduce((a, b) => ((a.x - t.x) ** 2 + (a.y - t.y) ** 2 <= (b.x - t.x) ** 2 + (b.y - t.y) ** 2 ? a : b));
    if (Math.hypot(n.x - t.x, n.y - t.y) < 25) n.cls = 'GFCI';
  }
  return items.filter(i => i.cls !== 'GFCI_TAG' && i.cls !== 'IGN');
}

function detectText(W, sheet) {
  const pats = TEXT_TAGS[sheet.discipline]; if (!pats) return [];
  const sent = /^[A-Za-z][a-z/,.\-]{2,}/, out = [];
  for (const [x0, y0, x1, y1, w] of W) {
    if (x0 > sheet.width - 230 || !pats.some(p => p.test(w))) continue;
    if (W.some(t => Math.abs(t[1] - y0) < 3 && Math.abs(t[0] - x1) < 12 && t[4] !== w && sent.test(t[4]))) continue;
    if (W.some(t => Math.abs(t[1] - y0) < 3 && Math.abs(x0 - t[2]) < 12 && sent.test(t[4]))) continue;
    out.push({ cls: w, x: (x0 + x1) / 2, y: (y0 + y1) / 2, conf: 1, src: 'text' });
  }
  return out;
}

// ------------------------------------------------------------------ простории
const ROOMRE = /^(\d{1,3}[A-Z]?|C-\d{1,2}|\d-[A-Z])$/, NAMERE = /^[A-Z][A-Z.\-&' ]+$/;
const STOP = new Set(['TR', 'HD', 'GFCI', 'DH', 'SP', 'WAP', 'EPB', 'OS', 'VS', 'DS', 'RC', 'N.I.C.', 'GWB', 'PROPOSED', 'EXISTING', 'ACT-1', 'ACT-2']);
function roomTags(W, widthPt) {
  let tags = [];
  for (const [x0, y0, x1, y1, w] of W) {
    if (!(ROOMRE.test(w) && x0 < widthPt - 230 && (x1 - x0) < 40)) continue;
    if (/^\d$/.test(w) && W.some(t => Math.abs(t[1] - y0) < 4 && t[0] - x1 < 25 && x0 - t[2] < 25 && /['"]|^-$/.test(t[4]))) continue;
    const name = W.filter(t => t[3] > y0 - 40 && t[3] <= y0 + 1 && t[0] < x1 + 50 && t[2] > x0 - 50 && NAMERE.test(t[4]) && !ROOMRE.test(t[4]) && !STOP.has(t[4]) && (t[4].length >= 3 || t[4].includes('.')))
      .sort((p, q) => Math.round(p[1]) - Math.round(q[1]) || p[0] - q[0]);
    const nm = name.map(t => t[4]).join(' ').replace('PRE- ', 'PRE-');
    if (!nm || nm.length > 40 || /^\d+[VA]$/.test(w)) continue;
    tags.push({ num: w, name: nm, x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
  }
  tags = tags.filter(t => !(/^\d$/.test(t.num) && tags.some(o => o !== t && o.num.length > 1 && Math.abs(o.x - t.x) < 40 && Math.abs(o.y - t.y) < 20)));
  return tags;
}
function roomMap(wallBin, W0, H0, tags) {
  const f = 4, b = dilate(wallBin, W0, H0, 2), { o: small, w, h } = maxpool(b, W0, H0, f);
  const closed = erode(dilate(small, w, h, 12), w, h, 12);
  const outside = new Uint8Array(w * h), q = new Int32Array(w * h); let qh = 0, qt = 0;
  if (!closed[0]) { outside[0] = 1; q[qt++] = 0; }
  while (qh < qt) { const p = q[qh++], x = p % w, y = (p / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const n = ny * w + nx; if (!closed[n] && !outside[n]) { outside[n] = 1; q[qt++] = n; } } }
  let inside = new Uint8Array(w * h); for (let p = 0; p < w * h; p++) inside[p] = !outside[p] && !small[p] ? 1 : 0;
  const { labels, stats } = components(inside, w, h, true), big = new Set();
  stats.forEach((s, i) => { if (s.a > (20 * K / f) ** 2 && Math.min(s.w, s.h) > 12 * K / f) big.add(i + 1); });
  for (let p = 0; p < w * h; p++) inside[p] = big.has(labels[p]) ? 1 : 0;
  const nIn = nearest(inside, w, h);
  const room = new Int32Array(w * h).fill(-1); qh = qt = 0;
  tags.forEach((t, i) => {
    const px = Math.floor(t.x * K / f), py = Math.floor(t.y * K / f); if (px < 0 || py < 0 || px >= w || py >= h) return;
    let sy, sx;
    if (inside[py * w + px]) { sy = py; sx = px; }
    else {
      const p = py * w + px; if (nIn.dist[p] < 0 || nIn.dist[p] > 130 * K / f) return;
      sx = nIn.src[p] % w; sy = (nIn.src[p] / w) | 0;
      let vy = sy - py, vx = sx - px; const n = Math.hypot(vx, vy);
      if (n > 0) { vx /= n; vy /= n; let ly = sy, lx = sx;
        for (let st = 1; st < 100 * K / f; st++) { const yy = Math.round(sy + vy * st), xx = Math.round(sx + vx * st);
          if (yy < 0 || xx < 0 || yy >= h || xx >= w || small[yy * w + xx]) { if (st > 8 * K / f) break; continue; }
          if (inside[yy * w + xx]) { ly = yy; lx = xx; } }
        sy = ly; sx = lx; }
    }
    const p = sy * w + sx; if (room[p] === -1) { room[p] = i; q[qt++] = p; }
  });
  while (qh < qt) { const p = q[qh++], x = p % w, y = (p / w) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const n = ny * w + nx; if (inside[n] && room[n] === -1) { room[n] = room[p]; q[qt++] = n; } } }
  const known = new Uint8Array(w * h); for (let p = 0; p < w * h; p++) known[p] = room[p] >= 0 ? 1 : 0;
  const nK = nearest(known, w, h);
  return (xpt, ypt) => {
    const x = Math.floor(xpt * K / f), y = Math.floor(ypt * K / f); if (x < 0 || y < 0 || x >= w || y >= h) return null;
    const p = y * w + x; if (room[p] >= 0) return room[p];
    if (nK.dist[p] < 0 || nK.dist[p] > 40 * K / f) return null;
    return room[nK.src[p]];
  };
}
function wallBinary(gray, W, H) { const b = new Uint8Array(W * H); for (let i = 0; i < b.length; i++) b[i] = gray[i] < 200 ? 1 : 0; return b; }

// ------------------------------------------------------------------ главно
export async function findSheets(pdfDoc, progress) {
  const sheets = [];
  for (let pg = 1; pg <= pdfDoc.numPages; pg++) {
    progress && progress(`Looking for plan sheets… ${pg}/${pdfDoc.numPages}`, 2 + 18 * pg / pdfDoc.numPages);
    const page = await pdfDoc.getPage(pg), W = await pageWords(page), titles = [];
    for (const l of [...lines(W), ...W.raw]) {
      const L = l.toUpperCase().replace(/\s+/g, ' ');
      for (const m of L.matchAll(TITLE_RE)) { const pre = L.slice(Math.max(0, m.index - 40), m.index); if (SKIP_RE.test(pre + m[0])) continue; titles.push(m); }
    }
    if (!titles.length || new Set(titles.map(t => t[0])).size > 2) { page.cleanup(); continue; }
    const m = titles[0], disc = DISCIPLINES.find(([re]) => re.test(m[2]))[1], [floor, level] = FLOORS[m[1]];
    const nums = W.filter(w => SHEETNO_RE.test(w[4]));
    const number = nums.length ? nums.reduce((a, b) => (b[3] - b[1] > a[3] - a[1] ? b : a))[4] : `p.${pg}`;
    if (number.startsWith('FA') !== (disc === 'Fire alarm')) { page.cleanup(); continue; }
    const vp = page.getViewport({ scale: 1 });
    sheets.push({ page: pg, number, title: m[0], discipline: disc, floor, level, width: vp.width, height: vp.height });
    page.cleanup();
  }
  const seen = new Set(); return sheets.filter(s => !seen.has(s.number) && seen.add(s.number));
}

export async function readPlan(pdfjsLib, data, libJson, progress = () => { }, imageScale = 1) {
  const t0 = performance.now();
  const lib = libJson instanceof Library ? libJson : new Library(libJson);
  const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
  const names = await layerNames(pdfDoc);
  const sheets = await findSheets(pdfDoc, progress);
  if (!sheets.length) throw new Error('No plan sheets found (POWER / LIGHTING / LOW VOLTAGE / FIRE ALARM PLAN).');
  let items = []; const ref = {}, words = {};
  for (const [k, sh] of sheets.entries()) {
    progress(`Reading ${sh.number} (${sh.discipline}, ${sh.floor})…`, 20 + 65 * k / sheets.length);
    const page = await pdfDoc.getPage(sh.page), W = await pageWords(page); words[sh.number] = W;
    const found = [...await detectSymbols(lib, pdfDoc, page, sh, names), ...detectText(W, sh)];
    found.forEach(i => i.sheet = sh.number); items.push(...found);
    sh.image = await renderJpeg(page, imageScale);
    const cur = ref[sh.floor]; if (!cur || (sh.discipline === 'Fire alarm' && cur.discipline !== 'Fire alarm')) ref[sh.floor] = sh;
    page.cleanup();
  }
  progress('Assigning devices to rooms…', 88);
  const refs = {}, walls = {};
  const wallsOf = async sh => {
    if (walls[sh.number]) return walls[sh.number];
    const page = await pdfDoc.getPage(sh.page), cfg = await layerConfig(pdfDoc, WALL), r = await renderGray(page, K, cfg);
    page.cleanup(); return (walls[sh.number] = { bin: wallBinary(r.gray, r.W, r.H), W: r.W, H: r.H });
  };
  for (const [fl, sh] of Object.entries(ref)) {
    const w = await wallsOf(sh), tags = roomTags(words[sh.number], sh.width);
    refs[fl] = { sh, w, tags, lookup: tags.length ? roomMap(w.bin, w.W, w.H, tags) : () => null };
  }
  for (const sh of sheets) {
    const R = refs[sh.floor];
    if (sh.number === R.sh.number) sh.offset = [0, 0];
    else { const w = await wallsOf(sh), a = alignWalls(R.w.bin, R.w.W, R.w.H, w.bin, w.W, w.H, 8); sh.offset = a.resp > 5 ? [a.dx, a.dy] : [0, 0]; sh.alignResp = +a.resp.toFixed(1); }
  }
  const by = Object.fromEntries(sheets.map(s => [s.number, s]));
  for (const it of items) {
    const sh = by[it.sheet], R = refs[sh.floor], r = R.lookup(it.x + sh.offset[0], it.y + sh.offset[1]);
    it.room = r != null && r >= 0 ? `${R.tags[r].num} ${R.tags[r].name}` : '';
    it.existing = it.cls.endsWith('_E');
    it.name = it.cls === 'UNKNOWN' ? 'Unknown symbol' : className(it.cls);
  }
  progress('Done', 100);
  await pdfDoc.loadingTask.destroy();
  return { sheets, items, ms: Math.round(performance.now() - t0) };
}

async function renderJpeg(page, scale) {
  const vp = page.getViewport({ scale }), c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7)); c.width = c.height = 0; return blob;
}

// поглед на лист како слика (за позадина во прегледот)
export async function renderSheetImage(pdfjsLib, data, pageNo, scale = 1) {
  const pdfDoc = await pdfjsLib.getDocument({ data }).promise, page = await pdfDoc.getPage(pageNo), vp = page.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, canvas: c, viewport: vp }).promise;
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.6)); await pdfDoc.loadingTask.destroy(); return blob;
}

// алатки за обука / тестирање
export { renderGray, layerConfig, detectComponents, layerNames, f2hex, LAYER_GROUPS, K };

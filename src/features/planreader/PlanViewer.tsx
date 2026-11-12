import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Hand, MousePointer2, Plus, Maximize2, ZoomIn, ZoomOut, Check, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/supabase';
import { formatDate, formatTime } from '@/lib/datetime';
import type { PlanItem, PlanSheet } from '@/lib/database.types';
import { useAddPlanItem, useDeletePlanItem, useMarkWork, type WorkState } from '@/hooks/usePlans';
import { CLASSES } from './engine';
import { roomLabel, isCountable } from './labels';

type Tool = 'pan' | 'select' | 'add';

const DONE = '#059669';
const OPEN = '#64748b';

const ADD_CHOICES = [
  ...Object.keys(CLASSES),
  'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'EM1', 'EM2', 'EM3',
];

export function PlanViewer({
  jobSiteId,
  versionId,
  sheets,
  items,
  work,
  images,
  isOwner,
  timezone,
}: {
  jobSiteId: string;
  versionId: string;
  sheets: PlanSheet[];
  items: PlanItem[];
  work: Map<string, WorkState>;
  images: Record<string, string>;
  isOwner: boolean;
  timezone: string;
}) {
  const { showToast } = useToast();
  const mark = useMarkWork(jobSiteId);
  const addItem = useAddPlanItem(jobSiteId);
  const delItem = useDeletePlanItem(jobSiteId);

  const storageKey = `plan-sheet-${jobSiteId}`;
  const [sheetNo, setSheetNo] = useState<string>(() => {
    try {
      const s = localStorage.getItem(storageKey);
      if (s && sheets.some((x) => x.number === s)) return s;
    } catch { /* storage unavailable */ }
    return sheets[0]?.number ?? '';
  });
  const sheet = sheets.find((s) => s.number === sheetNo) ?? sheets[0];
  const [tool, setTool] = useState<Tool>('pan');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [tip, setTip] = useState<{ item: PlanItem; x: number; y: number } | null>(null);
  const [addAt, setAddAt] = useState<{ x: number; y: number } | null>(null);
  const [addCls, setAddCls] = useState('DUP');

  const vpRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ s: 0.3, x: 0, y: 0 });

  const sheetItems = useMemo(() => items.filter((i) => i.sheet === sheet?.number), [items, sheet]);
  const visible = useMemo(
    () => sheetItems.filter((i) => !hidden.has(i.name) && (!onlyOpen || !work.get(i.uid)?.done)),
    [sheetItems, hidden, onlyOpen, work],
  );

  const fit = useCallback(() => {
    const vp = vpRef.current;
    if (!vp || !sheet) return;
    const L = sheetItems.length ? sheetItems : [{ x: 0, y: 0 }, { x: sheet.width, y: sheet.height }];
    const x0 = Math.min(...L.map((i) => i.x)) - 60, x1 = Math.max(...L.map((i) => i.x)) + 60;
    const y0 = Math.min(...L.map((i) => i.y)) - 60, y1 = Math.max(...L.map((i) => i.y)) + 60;
    const s = Math.min(vp.clientWidth / (x1 - x0), vp.clientHeight / (y1 - y0));
    setView({ s, x: -x0 * s + (vp.clientWidth - (x1 - x0) * s) / 2, y: -y0 * s + (vp.clientHeight - (y1 - y0) * s) / 2 });
  }, [sheet, sheetItems]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, sheet?.number ?? ''); } catch { /* ignore */ }
    setSel(new Set());
    setTip(null);
    requestAnimationFrame(fit);
  }, [sheet?.number]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = (factor: number, cx: number, cy: number) =>
    setView((v) => {
      const s = Math.min(5, Math.max(0.08, v.s * factor));
      return { s, x: cx - ((cx - v.x) * s) / v.s, y: cy - ((cy - v.y) * s) / v.s };
    });

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, []);

  // pointer handling: pan, rectangle select, pinch zoom, tap
  const ptrs = useRef(new Map<number, [number, number]>());
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean; target: EventTarget | null } | null>(null);
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const [rect, setRect] = useState<[number, number, number, number] | null>(null);

  const toPlan = (cx: number, cy: number) => {
    const r = vpRef.current!.getBoundingClientRect();
    return [(cx - r.left - view.x) / view.s, (cy - r.top - view.y) / view.s] as const;
  };

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui]')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()] as [[number, number], [number, number]];
      pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: view.s };
      drag.current = null;
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, target: e.target };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current && ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()] as [[number, number], [number, number]];
      const r = vpRef.current!.getBoundingClientRect();
      const target = (pinch.current.s * Math.hypot(a[0] - b[0], a[1] - b[1])) / pinch.current.d;
      zoomAt(target / view.s, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 6) d.moved = true;
    if (!d.moved) return;
    if (tool === 'select') {
      const [x0, y0] = toPlan(d.x, d.y), [x1, y1] = toPlan(e.clientX, e.clientY);
      setRect([Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)]);
    } else {
      setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) return tap(d.target, e.clientX, e.clientY);
    if (tool === 'select' && rect) {
      const [rx, ry, rw, rh] = rect;
      setSel((prev) => {
        const n = new Set(prev);
        for (const i of visible) if (isCountable(i) && i.x >= rx && i.x <= rx + rw && i.y >= ry && i.y <= ry + rh) n.add(i.uid);
        return n;
      });
      setRect(null);
    }
  };

  const tap = (target: EventTarget | null, cx: number, cy: number) => {
    const id = (target as SVGElement | null)?.dataset?.id;
    const item = id ? sheetItems.find((i) => i.id === id) : undefined;
    if (tool === 'add' && !item) {
      const [x, y] = toPlan(cx, cy);
      setAddAt({ x, y });
      return;
    }
    if (!item) return setTip(null);
    if (tool === 'select' && isCountable(item)) {
      setSel((prev) => {
        const n = new Set(prev);
        if (n.has(item.uid)) n.delete(item.uid);
        else n.add(item.uid);
        return n;
      });
      return;
    }
    setTip({ item, x: cx, y: cy });
  };

  const act = async (done: boolean) => {
    try {
      const n = await mark.mutateAsync({ uids: [...sel], done });
      showToast(done ? 'Marked done' : 'Marked not done', `${n} device${n === 1 ? '' : 's'}`);
      setSel(new Set());
    } catch (err) {
      showToast('Could not save', errorMessage(err, 'Try again.'));
    }
  };

  const confirmAdd = async () => {
    if (!addAt || !sheet) return;
    const near = sheetItems.reduce<PlanItem | null>((b, i) => (!b || Math.hypot(i.x - addAt.x, i.y - addAt.y) < Math.hypot(b.x - addAt.x, b.y - addAt.y) ? i : b), null);
    try {
      await addItem.mutateAsync({ versionId, sheet: sheet.number, cls: addCls, x: Math.round(addAt.x), y: Math.round(addAt.y), room: near && Math.hypot(near.x - addAt.x, near.y - addAt.y) < 120 ? near.room : '' });
      showToast('Device added', CLASSES[addCls] ?? addCls);
      setAddAt(null);
    } catch (err) {
      showToast('Could not add', errorMessage(err, 'Try again.'));
    }
  };

  // legend + rooms for this sheet
  const names = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    for (const i of sheetItems) {
      if (i.cls === 'UNKNOWN') continue;
      const r = m.get(i.name) ?? { total: 0, done: 0 };
      r.total++;
      if (work.get(i.uid)?.done) r.done++;
      m.set(i.name, r);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [sheetItems, work]);
  const rooms = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    for (const i of sheetItems) {
      if (!isCountable(i)) continue;
      const r = m.get(i.room) ?? { total: 0, done: 0 };
      r.total++;
      if (work.get(i.uid)?.done) r.done++;
      m.set(i.room, r);
    }
    return [...m.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [sheetItems, work]);

  if (!sheet) return null;
  const img = sheet.image_path ? images[sheet.image_path] : undefined;
  const r = 9 / Math.max(0.6, Math.min(1.6, view.s * 2.2));

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_300px]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Select aria-label="Sheet" value={sheet.number} onChange={(e) => setSheetNo(e.target.value)} className="max-w-xs">
            {sheets.map((s) => (
              <option key={s.number} value={s.number}>
                {s.number} · {s.discipline} · {s.floor}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-ink-muted">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Only not done
          </label>
          <span className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: OPEN }} />Not done</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full" style={{ background: DONE }} />Done</span>
          </span>
        </div>

        <div
          ref={vpRef}
          className="relative h-[62vh] touch-none select-none overflow-hidden rounded-xl border border-navy-100 bg-white lg:h-[calc(100vh-230px)]"
          style={{ cursor: tool === 'pan' ? 'grab' : 'crosshair' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
            {img ? (
              <img src={img} alt={sheet.number} draggable={false} style={{ width: sheet.width, height: sheet.height, maxWidth: 'none', opacity: 0.55 }} />
            ) : (
              <div style={{ width: sheet.width, height: sheet.height }} className="bg-navy-50" />
            )}
            <svg className="absolute left-0 top-0 overflow-visible" width={sheet.width} height={sheet.height} viewBox={`0 0 ${sheet.width} ${sheet.height}`}>
              {visible.map((i) => {
                if (i.cls === 'UNKNOWN') {
                  return <rect key={i.id} data-id={i.id} x={i.x - r} y={i.y - r} width={2 * r} height={2 * r} fill="transparent" stroke="#dc2626" strokeWidth={2} strokeDasharray="4 3" />;
                }
                const st = work.get(i.uid);
                const on = sel.has(i.uid);
                return (
                  <circle
                    key={i.id}
                    data-id={i.id}
                    cx={i.x}
                    cy={i.y}
                    r={on ? r * 1.35 : r}
                    fill={st?.done ? DONE : '#fff'}
                    fillOpacity={st?.done ? 0.85 : 0.6}
                    stroke={on ? '#f59e0b' : st?.done ? DONE : OPEN}
                    strokeWidth={on ? 4 : 2.2}
                    strokeDasharray={i.existing ? '3 2' : undefined}
                  />
                );
              })}
              {rect && <rect x={rect[0]} y={rect[1]} width={rect[2]} height={rect[3]} fill="rgba(245,158,11,0.12)" stroke="#f59e0b" strokeWidth={2 / view.s} />}
              {addAt && <circle cx={addAt.x} cy={addAt.y} r={r * 1.3} fill="none" stroke="#2563eb" strokeWidth={3} strokeDasharray="4 3" />}
            </svg>
          </div>

          <div data-ui className="absolute left-2 top-2 flex gap-1">
            <ToolButton on={tool === 'pan'} onClick={() => setTool('pan')} icon={<Hand className="h-4 w-4" />} label="Move" />
            <ToolButton on={tool === 'select'} onClick={() => setTool('select')} icon={<MousePointer2 className="h-4 w-4" />} label="Select" />
            {isOwner && <ToolButton on={tool === 'add'} onClick={() => setTool('add')} icon={<Plus className="h-4 w-4" />} label="Add device" />}
          </div>
          <div data-ui className="absolute right-2 top-2 flex flex-col gap-1">
            <IconBtn label="Zoom in" onClick={() => zoomAt(1.3, vpRef.current!.clientWidth / 2, vpRef.current!.clientHeight / 2)}><ZoomIn className="h-4 w-4" /></IconBtn>
            <IconBtn label="Zoom out" onClick={() => zoomAt(1 / 1.3, vpRef.current!.clientWidth / 2, vpRef.current!.clientHeight / 2)}><ZoomOut className="h-4 w-4" /></IconBtn>
            <IconBtn label="Fit" onClick={fit}><Maximize2 className="h-4 w-4" /></IconBtn>
          </div>

          {sel.size > 0 && (
            <div data-ui className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl bg-navy-900 p-2 text-white shadow-lg">
              <span className="px-2 text-sm font-medium">{sel.size} selected</span>
              <Button size="sm" variant="success" icon={<Check className="h-4 w-4" />} loading={mark.isPending} onClick={() => act(true)}>Done</Button>
              <Button size="sm" variant="secondary" loading={mark.isPending} onClick={() => act(false)}>Not done</Button>
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" icon={<X className="h-4 w-4" />} onClick={() => setSel(new Set())} aria-label="Clear selection" />
            </div>
          )}
          {tool === 'select' && sel.size === 0 && (
            <div data-ui className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-ink-muted shadow">
              Tap devices or drag a box around them, or pick a room on the right
            </div>
          )}
          {tool === 'add' && (
            <div data-ui className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-ink-muted shadow">
              Tap the plan where the missing device is
            </div>
          )}
        </div>
      </div>

      <aside className="max-h-[calc(100vh-200px)] overflow-auto rounded-xl border border-navy-100 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-ink">{sheet.number} · {sheet.discipline}</h3>
        {names.map(([n, c]) => (
          <label key={n} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
            <input
              type="checkbox"
              checked={!hidden.has(n)}
              onChange={(e) =>
                setHidden((h) => {
                  const x = new Set(h);
                  if (e.target.checked) x.delete(n);
                  else x.add(n);
                  return x;
                })
              }
            />
            <span className="flex-1 text-ink">{n}</span>
            <span className="tabular-nums text-ink-muted">{c.done}/{c.total}</span>
          </label>
        ))}
        <h3 className="mb-1 mt-4 text-sm font-semibold text-ink">Rooms <span className="font-normal text-ink-subtle">(tap to select all)</span></h3>
        {rooms.map(([room, c]) => (
          <button
            key={room || '-'}
            type="button"
            className="block w-full border-b border-navy-100 py-1.5 text-left text-sm hover:bg-navy-50"
            onClick={() => {
              setTool('select');
              setSel(new Set(visible.filter((i) => i.room === room && isCountable(i)).map((i) => i.uid)));
            }}
          >
            <div className="flex justify-between">
              <span className="text-ink">{roomLabel(room)}</span>
              <span className="tabular-nums text-ink-muted">{c.done}/{c.total}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-navy-100">
              <div className="h-full rounded bg-emerald-600" style={{ width: `${c.total ? (100 * c.done) / c.total : 0}%` }} />
            </div>
          </button>
        ))}
      </aside>

      {tip && (
        <div className="fixed z-50 max-w-[280px] rounded-lg bg-navy-900 px-3 py-2 text-sm text-white shadow-lg" style={{ left: Math.min(tip.x + 12, window.innerWidth - 290), top: tip.y + 12 }}>
          <p className="font-semibold">{tip.item.name}</p>
          <p className="text-white/80">{roomLabel(tip.item.room)} · {tip.item.sheet}</p>
          {tip.item.existing ? (
            <p className="mt-1 text-white/80">Existing to remain</p>
          ) : (() => {
            const st = work.get(tip.item.uid);
            if (!st) return <p className="mt-1 text-white/80">Not done</p>;
            return (
              <p className="mt-1">
                {st.done ? '✓ Done' : 'Marked not done'} by <b>{st.by}</b>
                <br />
                <span className="text-white/70">{formatDate(st.at, timezone)} · {formatTime(st.at, timezone)}</span>
              </p>
            );
          })()}
          <div className="mt-2 flex gap-2">
            <button type="button" className="text-xs underline" onClick={() => setTip(null)}>Close</button>
            {isOwner && (
              <button
                type="button"
                className="ml-auto flex items-center gap-1 text-xs text-red-300 underline"
                onClick={async () => {
                  await delItem.mutateAsync(tip.item.id);
                  setTip(null);
                  showToast('Device removed', tip.item.name);
                }}
              >
                <Trash2 className="h-3 w-3" /> Remove (wrong)
              </button>
            )}
          </div>
        </div>
      )}

      <Modal open={!!addAt} onClose={() => setAddAt(null)} title="Add a missing device">
        <div className="space-y-3">
          <Select aria-label="Device type" value={addCls} onChange={(e) => setAddCls(e.target.value)}>
            {ADD_CHOICES.map((c) => (
              <option key={c} value={c}>{CLASSES[c] ?? (c.startsWith('L') ? `Light fixture ${c}` : `Emergency light ${c}`)}</option>
            ))}
          </Select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddAt(null)}>Cancel</Button>
            <Button variant="primary" loading={addItem.isPending} onClick={confirmAdd}>Add</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ToolButton({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium shadow-sm ${on ? 'border-navy-900 bg-navy-900 text-white' : 'border-navy-100 bg-white text-ink'}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="grid h-9 w-9 place-items-center rounded-lg border border-navy-100 bg-white text-ink shadow-sm">
      {children}
    </button>
  );
}

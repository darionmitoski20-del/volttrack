/** Customizable dashboard widget order + visibility, persisted per-company in localStorage. */

export type DashboardWidgetId = 'clock' | 'attention' | 'actions';

export const DEFAULT_WIDGET_ORDER: DashboardWidgetId[] = ['clock', 'attention', 'actions'];

interface DashboardLayout {
  order: DashboardWidgetId[];
  hidden: DashboardWidgetId[];
}

function storageKey(companyId: string): string {
  return `vt-dashboard-layout-${companyId}`;
}

export function loadDashboardLayout(companyId: string): DashboardLayout {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    if (!raw) return { order: DEFAULT_WIDGET_ORDER, hidden: [] };
    const parsed = JSON.parse(raw) as DashboardLayout;
    // Guard against a stale layout missing newer widgets — append anything absent.
    // Drop widgets that no longer exist (e.g. the removed 'activity').
    const known = parsed.order.filter((w) => DEFAULT_WIDGET_ORDER.includes(w));
    const missing = DEFAULT_WIDGET_ORDER.filter((w) => !known.includes(w));
    const hidden = (parsed.hidden ?? []).filter((w) => DEFAULT_WIDGET_ORDER.includes(w));
    return { order: [...known, ...missing], hidden };
  } catch {
    return { order: DEFAULT_WIDGET_ORDER, hidden: [] };
  }
}

export function saveDashboardLayout(companyId: string, layout: DashboardLayout): void {
  try {
    localStorage.setItem(storageKey(companyId), JSON.stringify(layout));
  } catch {
    // private mode — layout just won't persist
  }
}

export function resetDashboardLayout(companyId: string): DashboardLayout {
  try {
    localStorage.removeItem(storageKey(companyId));
  } catch {
    // ignore
  }
  return { order: DEFAULT_WIDGET_ORDER, hidden: [] };
}

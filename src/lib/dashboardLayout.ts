/** Customizable dashboard widget order + visibility, persisted per-company in localStorage. */

export type DashboardWidgetId = 'clock' | 'attention' | 'actions' | 'activity';

export const DEFAULT_WIDGET_ORDER: DashboardWidgetId[] = ['clock', 'attention', 'actions', 'activity'];

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
    const missing = DEFAULT_WIDGET_ORDER.filter((w) => !parsed.order.includes(w));
    return { order: [...parsed.order, ...missing], hidden: parsed.hidden ?? [] };
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

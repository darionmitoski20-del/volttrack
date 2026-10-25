/** Saved report filter presets, persisted per-company in localStorage. */

export interface ReportPreset {
  id: string;
  name: string;
  period: 'today' | 'week' | 'month' | 'year' | 'custom';
  startKey: string;
  endKey: string;
  employeeId: string;
  jobSiteId: string;
}

function storageKey(companyId: string): string {
  return `vt-report-presets-${companyId}`;
}

export function loadPresets(companyId: string): ReportPreset[] {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    return raw ? (JSON.parse(raw) as ReportPreset[]) : [];
  } catch {
    return [];
  }
}

export function savePreset(companyId: string, preset: Omit<ReportPreset, 'id'>): ReportPreset[] {
  const presets = loadPresets(companyId);
  const next = [...presets, { ...preset, id: crypto.randomUUID() }];
  try {
    localStorage.setItem(storageKey(companyId), JSON.stringify(next));
  } catch {
    // private mode — preset just won't persist
  }
  return next;
}

export function deletePreset(companyId: string, presetId: string): ReportPreset[] {
  const next = loadPresets(companyId).filter((p) => p.id !== presetId);
  try {
    localStorage.setItem(storageKey(companyId), JSON.stringify(next));
  } catch {
    // private mode
  }
  return next;
}

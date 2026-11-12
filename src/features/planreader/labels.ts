import type { PlanItem } from '@/lib/database.types';

/** Devices that are installed by the crew (not existing-to-remain, not unknown). */
export function isCountable(i: Pick<PlanItem, 'cls' | 'existing'>) {
  return i.cls !== 'UNKNOWN' && i.cls !== 'IGN' && !i.existing;
}

/** "220 PRE-KINDERGARTEN CLASSROOM" -> "220 Pre-kindergarten classroom" */
export function roomLabel(room: string) {
  if (!room) return 'No room';
  const [num, ...rest] = room.split(' ');
  const name = rest.join(' ').toLowerCase();
  return name ? `${num} ${name.charAt(0).toUpperCase()}${name.slice(1)}` : room;
}

export const DISCIPLINE_ORDER = ['Power', 'Lighting', 'Low voltage', 'Fire alarm'];

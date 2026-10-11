/**
 * Class-slot scheduling helpers shared by centres, detection, attendance and dashboard.
 * All times are interpreted in the server's local timezone.
 */

export interface SlotLike {
  id: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  daysOfWeek: string; // CSV of 0 (Sun) - 6 (Sat)
  expectedTrainees?: number | null;
  isActive?: boolean;
}

export type SlotState = 'UPCOMING' | 'LIVE' | 'COMPLETED' | 'NOT_TODAY';

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

export function parseDays(csv: string): number[] {
  return csv
    .split(',')
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => d >= 0 && d <= 6);
}

/** Local midnight for the given date (the key used for AttendanceRecord.date). */
export function toDateKey(d: Date = new Date()): Date {
  const k = new Date(d);
  k.setHours(0, 0, 0, 0);
  return k;
}

/** Parse a YYYY-MM-DD string to local midnight (not UTC midnight). */
export function parseDateKey(s: string): Date {
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function slotWindow(slot: SlotLike, day: Date): { start: Date; end: Date } {
  const start = toDateKey(day);
  start.setMinutes(toMinutes(slot.startTime));
  const end = toDateKey(day);
  end.setMinutes(toMinutes(slot.endTime));
  return { start, end };
}

export function slotState(slot: SlotLike, now: Date = new Date()): SlotState {
  if (slot.isActive === false || !parseDays(slot.daysOfWeek).includes(now.getDay())) return 'NOT_TODAY';
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < toMinutes(slot.startTime)) return 'UPCOMING';
  if (mins >= toMinutes(slot.endTime)) return 'COMPLETED';
  return 'LIVE';
}

export function findActiveSlot<T extends SlotLike>(slots: T[], now: Date = new Date()): T | null {
  return slots.find((s) => slotState(s, now) === 'LIVE') ?? null;
}

/** The next slot that starts after `now` (looking up to 7 days ahead). */
export function findNextSlot<T extends SlotLike>(
  slots: T[],
  now: Date = new Date()
): { slot: T; startsAt: Date } | null {
  let best: { slot: T; startsAt: Date } | null = null;
  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    for (const slot of slots) {
      if (slot.isActive === false || !parseDays(slot.daysOfWeek).includes(day.getDay())) continue;
      const { start } = slotWindow(slot, day);
      if (start <= now) continue;
      if (!best || start < best.startsAt) best = { slot, startsAt: start };
    }
    if (best) break;
  }
  return best;
}

/** Validation: start < end for every slot, unique names, no overlap on a shared weekday. */
export function validateSlots(
  slots: { name: string; startTime: string; endTime: string; daysOfWeek: number[] }[]
): string | null {
  const names = new Set<string>();
  for (const s of slots) {
    if (toMinutes(s.startTime) >= toMinutes(s.endTime)) {
      return `Slot "${s.name}": start time must be before end time`;
    }
    const key = s.name.trim().toLowerCase();
    if (names.has(key)) return `Duplicate slot name "${s.name}"`;
    names.add(key);
  }
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      const sharedDay = a.daysOfWeek.some((d) => b.daysOfWeek.includes(d));
      if (
        sharedDay &&
        toMinutes(a.startTime) < toMinutes(b.endTime) &&
        toMinutes(b.startTime) < toMinutes(a.endTime)
      ) {
        return `Slots "${a.name}" and "${b.name}" overlap`;
      }
    }
  }
  return null;
}

/** Objects the detector can recognise; kept in sync with filter_classes in ai-service/detector.py. */
export const DETECTABLE_CLASSES = [
  { detectClass: 'laptop', label: 'Laptop' },
  { detectClass: 'keyboard', label: 'Keyboard' },
  { detectClass: 'mouse', label: 'Mouse' },
  { detectClass: 'tv', label: 'Monitor / TV' },
  { detectClass: 'chair', label: 'Chair' },
  { detectClass: 'dining table', label: 'Table / Workbench' },
  { detectClass: 'couch', label: 'Couch' },
  { detectClass: 'book', label: 'Book' },
  { detectClass: 'cell phone', label: 'Cell phone' },
  { detectClass: 'bottle', label: 'Bottle' },
  { detectClass: 'backpack', label: 'Backpack' },
] as const;

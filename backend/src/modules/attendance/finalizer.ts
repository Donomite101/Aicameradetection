import { prisma } from '@/shared/database/prisma';
import { createAlert } from '@/modules/alerts/service';
import { broadcastAlert, broadcastAttendanceUpdate } from '@/shared/websocket/socket';
import { slotState, slotWindow, toDateKey } from '@/modules/centres/schedule';
import { discrepancyTolerance, parseToolsSummary, ToolSummaryEntry } from '@/modules/detection/service';

/** A "no detection" record is only created for slots that ended this recently (avoids backfilling on restart). */
const MISSED_GRACE_MS = 30 * 60 * 1000;

/**
 * The final count of a class: how many people are there at the END of it.
 * It is the median of the last few readings, so one bad frame in the final seconds
 * (someone walking past, a missed detection) cannot change the result.
 * Example: 10 present the whole class -> 10. If only 9 are left at the end -> 9.
 */
export function finalHeadcount(counts: number[], window = 5): number {
  if (counts.length === 0) return 0;
  const last = counts.slice(-Math.min(window, counts.length)).sort((a, b) => a - b);
  return last[Math.floor(last.length / 2)];
}

/** Highest count that stayed up for several readings in a row (median of 5): ignores 1-2 frame misreads. */
export function steadyPeak(counts: number[], window = 5): number {
  if (counts.length === 0) return 0;
  if (counts.length < 3) return Math.max(...counts);
  const w = Math.min(window, counts.length);
  let best = 0;
  for (let i = 0; i + w <= counts.length; i++) {
    const sorted = counts.slice(i, i + w).sort((a, b) => a - b);
    best = Math.max(best, sorted[Math.floor(w / 2)]);
  }
  return best;
}

/**
 * While a class runs, a tool's "max seen" is lenient (one misread frame counts). At the end we recompute it from
 * the stored readings so a chair mistaken for a laptop in a frame or two does not count as a laptop being present.
 */
async function steadyTools(recordId: string, current: ToolSummaryEntry[]): Promise<ToolSummaryEntry[]> {
  if (current.length === 0) return current;
  const snaps = await prisma.detectionSnapshot.findMany({
    where: { attendanceRecordId: recordId },
    orderBy: { timestamp: 'asc' },
    select: { items: true },
  });
  const series = new Map<string, number[]>(current.map((t) => [t.itemId, []]));
  for (const snap of snaps) {
    let items: { name: string; count: number }[] = [];
    try { items = JSON.parse(snap.items); } catch { /* ignore a bad row */ }
    for (const t of current) {
      const seen = items.find((i) => String(i.name).toLowerCase() === t.detectClass.toLowerCase());
      series.get(t.itemId)!.push(seen?.count ?? 0);
    }
  }
  return current.map((t) => ({ ...t, maxDetected: steadyPeak(series.get(t.itemId) ?? []) }));
}

export async function computeFinalCount(recordId: string): Promise<number> {
  const snaps = await prisma.detectionSnapshot.findMany({
    where: { attendanceRecordId: recordId },
    orderBy: { timestamp: 'asc' },
    select: { peopleCount: true },
  });
  return finalHeadcount(snaps.map((s) => s.peopleCount));
}

/**
 * Closes out today's class slots that have ended:
 *  - sets the final status (VERIFIED / DISCREPANT) from expected vs detected
 *  - raises ATTENDANCE_DISCREPANCY and EQUIPMENT_MISSING alerts
 *  - records a "no detection" session when the camera never reported (only for centres
 *    that have reported before, so centres without a camera aren't flooded with alerts)
 */
export async function finalizeEndedSessions(now: Date = new Date()) {
  const date = toDateKey(now);
  const centres = await prisma.centre.findMany({
    where: { status: 'ACTIVE' },
    include: { classSlots: { where: { isActive: true } } },
  });

  for (const centre of centres) {
    for (const slot of centre.classSlots) {
      if (slotState(slot, now) !== 'COMPLETED') continue;

      const expected = slot.expectedTrainees ?? centre.totalTrainees ?? 0;
      let record = await prisma.attendanceRecord.findUnique({
        where: { centreId_date_session: { centreId: centre.id, date, session: slot.name } },
      });
      if (record?.finalizedAt) continue;

      if (!record) {
        const endedAgo = now.getTime() - slotWindow(slot, now).end.getTime();
        if (endedAgo > MISSED_GRACE_MS) continue;
        const everReported = await prisma.attendanceRecord.count({
          where: { centreId: centre.id, sampleCount: { gt: 0 } },
        });
        if (!everReported) continue;

        record = await prisma.attendanceRecord.create({
          data: {
            centreId: centre.id,
            classSlotId: slot.id,
            date,
            session: slot.name,
            recordedCount: 0,
            expectedCount: expected,
            detectedCount: 0,
            finalCount: 0,
            discrepancy: -expected,
            sampleCount: 0,
            status: 'DISCREPANT',
          },
        });
      }

      const locked = record.status === 'UNDER_REVIEW' || !!record.verifiedBy;
      const detected = record.sampleCount > 0 ? await computeFinalCount(record.id) : 0;
      const tools = record.sampleCount > 0 ? await steadyTools(record.id, parseToolsSummary(record.toolsSummary)) : parseToolsSummary(record.toolsSummary);
      const gap = detected - expected;
      const tolerance = discrepancyTolerance(expected);
      const status = locked ? record.status : Math.abs(gap) <= tolerance || expected === 0 ? 'VERIFIED' : 'DISCREPANT';

      // Guard against double finalization if two ticks overlap
      const claimed = await prisma.attendanceRecord.updateMany({
        where: { id: record.id, finalizedAt: null },
        data: { finalizedAt: now, finalCount: detected, expectedCount: expected, status, discrepancy: gap, toolsSummary: JSON.stringify(tools) },
      });
      if (claimed.count === 0) continue;

      const when = `${slot.name} (${slot.startTime}-${slot.endTime})`;

      if (expected > 0 && gap < -tolerance) {
        const percent = Math.round((detected / expected) * 100);
        const alert = await createAlert({
          centreId: centre.id,
          type: 'ATTENDANCE_DISCREPANCY',
          severity: percent < 50 ? 'HIGH' : 'MEDIUM',
          title: `Low attendance - ${when}`,
          message: `${centre.name}: final count ${detected} of ${expected} expected trainees during ${when} (${percent}%).`,
          metadata: { attendanceRecordId: record.id, classSlotId: slot.id, expected, detected, peak: record.peakCount, sampleCount: record.sampleCount },
        });
        broadcastAlert({ id: alert.id, centreId: centre.id, type: alert.type, severity: alert.severity, title: alert.title, message: alert.message });
      }

      const missing = tools.filter((t) => t.maxDetected < t.expected);
      if (missing.length > 0) {
        const list = missing.map((t) => `${t.name} ${t.maxDetected}/${t.expected}`).join(', ');
        const alert = await createAlert({
          centreId: centre.id,
          type: 'EQUIPMENT_MISSING',
          severity: 'MEDIUM',
          title: `Tools not fully detected - ${when}`,
          message: `${centre.name}: ${list} during ${when}.`,
          metadata: { attendanceRecordId: record.id, classSlotId: slot.id, missing },
        });
        broadcastAlert({ id: alert.id, centreId: centre.id, type: alert.type, severity: alert.severity, title: alert.title, message: alert.message });
      }

      broadcastAttendanceUpdate(centre.id, {
        detectedCount: detected,
        recordedCount: record.recordedCount,
        discrepancy: gap,
        timestamp: Date.now(),
      });
    }
  }
}

export function startSessionFinalizer(log: { error: (...args: any[]) => void }, intervalMs = 60_000) {
  const tick = () => finalizeEndedSessions().catch((err) => log.error(err, 'Session finalizer failed'));
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return timer;
}

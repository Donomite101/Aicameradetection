import { format } from 'date-fns';
import { prisma } from '@/shared/database/prisma';
import { toDateKey } from './schedule';
import { withDerived } from '@/modules/attendance/service';
import { getTodaySessions } from '@/modules/dashboard/service';

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (n: number | null, digits = 0): number | null => {
  if (n === null) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
const percent = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

/**
 * Everything the centre analysis page shows, aggregated over the last `days` days:
 * KPIs, daily trend, per-slot performance, tool compliance, recent sessions, alerts, cameras, trainees.
 */
export async function getCentreAnalytics(centreId: string, days = 30) {
  const since = toDateKey(new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000));

  const centre = await prisma.centre.findUnique({
    where: { id: centreId },
    include: {
      scheme: { select: { id: true, code: true, name: true, ministry: true, fundingType: true } },
      classSlots: { where: { isActive: true }, orderBy: { startTime: 'asc' } },
      cameras: { orderBy: { createdAt: 'asc' } },
      inventory: { where: { isActive: true } },
      _count: { select: { trainees: true, alerts: true, attendanceRecords: true } },
    },
  });
  if (!centre) return null;

  const [records, recentAlerts, openAlerts, traineeStatus, traineeMarks, todaySessions, lastRecord] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { centreId, date: { gte: since } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: { classSlot: { select: { id: true, name: true, startTime: true, endTime: true } } },
    }),
    prisma.alert.findMany({ where: { centreId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.alert.count({ where: { centreId, status: 'OPEN' } }),
    prisma.trainee.groupBy({ by: ['status'], where: { centreId }, _count: true }),
    prisma.traineeAttendance.groupBy({ by: ['status'], where: { centreId, date: { gte: since } }, _count: true }),
    getTodaySessions(centreId),
    prisma.attendanceRecord.findFirst({
      where: { centreId, lastSeenAt: { not: null } },
      orderBy: { lastSeenAt: 'desc' },
      select: { lastSeenAt: true },
    }),
  ]);

  const derived = records.map(withDerived);
  const held = derived.filter((r) => r.sampleCount > 0); // sessions the camera actually observed
  const missed = derived.filter((r) => r.sampleCount === 0 && r.finalizedAt).length;

  // ── Tool compliance, per registered tool ──────────────────────
  const toolStats = new Map<string, { sessions: number; full: number; maxes: number[] }>();
  for (const r of held) {
    for (const t of r.tools) {
      const s = toolStats.get(t.itemId) ?? { sessions: 0, full: 0, maxes: [] };
      s.sessions += 1;
      if (t.maxDetected >= t.expected) s.full += 1;
      s.maxes.push(t.maxDetected);
      toolStats.set(t.itemId, s);
    }
  }
  const tools = centre.inventory
    .filter((i) => i.detectClass)
    .map((i) => {
      const s = toolStats.get(i.id);
      return {
        itemId: i.id,
        name: i.name,
        detectClass: i.detectClass,
        expected: i.quantity,
        sessions: s?.sessions ?? 0,
        fullSessions: s?.full ?? 0,
        compliancePercent: s ? percent(s.full, s.sessions) : null,
        avgMaxDetected: s ? round(avg(s.maxes), 1) : null,
        lowestMaxDetected: s ? Math.min(...s.maxes) : null,
      };
    });
  const toolChecks = held.reduce((n, r) => n + r.toolsTotal, 0);
  const toolChecksOk = held.reduce((n, r) => n + r.toolsOk, 0);

  // ── Daily trend ───────────────────────────────────────────────
  const byDay = new Map<string, { expected: number; present: number; peak: number; sessions: number }>();
  for (const r of held) {
    const key = format(r.date, 'yyyy-MM-dd');
    const d = byDay.get(key) ?? { expected: 0, present: 0, peak: 0, sessions: 0 };
    d.expected += r.expectedCount;
    d.present += r.presentCount ?? 0;
    d.peak += r.peakCount ?? 0;
    d.sessions += 1;
    byDay.set(key, d);
  }
  const trend = Array.from(byDay.entries()).map(([date, d]) => ({
    date,
    expected: d.expected,
    present: d.present,
    peak: d.peak,
    sessions: d.sessions,
    attendancePercent: percent(d.present, d.expected),
  }));

  // ── Per class slot ────────────────────────────────────────────
  const bySlotMap = new Map<string, typeof held>();
  for (const r of held) bySlotMap.set(r.session, [...(bySlotMap.get(r.session) ?? []), r]);
  const bySlot = Array.from(bySlotMap.entries()).map(([name, rs]) => {
    const pcts = rs.map((r) => r.attendancePercent).filter((p): p is number => p !== null);
    const checks = rs.reduce((n, r) => n + r.toolsTotal, 0);
    const ok = rs.reduce((n, r) => n + r.toolsOk, 0);
    return {
      name,
      startTime: rs[rs.length - 1].classSlot?.startTime ?? null,
      endTime: rs[rs.length - 1].classSlot?.endTime ?? null,
      sessions: rs.length,
      avgExpected: round(avg(rs.map((r) => r.expectedCount)), 0),
      avgPresent: round(avg(rs.map((r) => r.presentCount ?? 0)), 1),
      avgAttendancePercent: round(avg(pcts), 0),
      toolsOkPercent: percent(ok, checks),
    };
  });

  const attendancePcts = held.map((r) => r.attendancePercent).filter((p): p is number => p !== null);
  const peakPcts = held.map((r) => r.peakAttendancePercent).filter((p): p is number => p !== null);

  // ── Trainees ──────────────────────────────────────────────────
  const marks = Object.fromEntries(traineeMarks.map((m) => [m.status, m._count])) as Record<string, number>;
  const markedTotal = Object.values(marks).reduce((a, b) => a + b, 0);

  return {
    days,
    centre: {
      id: centre.id,
      code: centre.code,
      name: centre.name,
      status: centre.status,
      address: centre.address,
      area: centre.area,
      city: centre.city,
      state: centre.state,
      pincode: centre.pincode,
      latitude: centre.latitude,
      longitude: centre.longitude,
      contactPerson: centre.contactPerson,
      contactPhone: centre.contactPhone,
      contactEmail: centre.contactEmail,
      sanctionedCapacity: centre.sanctionedCapacity,
      totalTrainees: centre.totalTrainees,
      scheme: centre.scheme,
      createdAt: centre.createdAt,
    },
    kpis: {
      sessionsHeld: held.length,
      sessionsMissed: missed,
      avgAttendancePercent: round(avg(attendancePcts)),
      avgPeakPercent: round(avg(peakPcts)),
      discrepantSessions: held.filter((r) => r.status === 'DISCREPANT').length,
      toolCompliancePercent: percent(toolChecksOk, toolChecks),
      openAlerts,
      totalAlerts: centre._count.alerts,
      lastDetectionAt: lastRecord?.lastSeenAt ?? null,
    },
    todaySessions,
    trend,
    bySlot,
    tools,
    classSlots: centre.classSlots,
    recentSessions: derived
      .slice(-15)
      .reverse()
      .map((r) => ({
        id: r.id,
        date: r.date,
        session: r.session,
        classSlot: r.classSlot,
        expectedCount: r.expectedCount,
        detectedCount: r.detectedCount,
        presentCount: r.presentCount,
        isFinal: r.isFinal,
        peakCount: r.peakCount,
        minCount: r.minCount,
        sampleCount: r.sampleCount,
        attendancePercent: r.attendancePercent,
        toolsOk: r.toolsOk,
        toolsTotal: r.toolsTotal,
        status: r.status,
      })),
    recentAlerts,
    cameras: centre.cameras.map((c) => ({ id: c.id, name: c.name, type: c.type, isActive: c.isActive, lastSeenAt: c.lastSeenAt })),
    trainees: {
      enrolled: centre._count.trainees,
      declaredTotal: centre.totalTrainees,
      capacity: centre.sanctionedCapacity,
      byStatus: Object.fromEntries(traineeStatus.map((s) => [s.status, s._count])),
      manualMarks: {
        present: marks.PRESENT ?? 0,
        absent: marks.ABSENT ?? 0,
        leave: marks.LEAVE ?? 0,
        presentRate: percent(marks.PRESENT ?? 0, markedTotal),
      },
    },
  };
}

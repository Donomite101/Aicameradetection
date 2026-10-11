import { format } from 'date-fns';
import { prisma } from '@/shared/database/prisma';
import { slotState, toDateKey } from '@/modules/centres/schedule';
import { withDerived } from '@/modules/attendance/service';
import { DashboardSummaryQuery, CentresMapQuery, AttendanceTrendsQuery, InfrastructureComplianceQuery } from './schemas';

/** Declared trainee total (set on the centre) or, if none declared, enrolled Trainee rows. */
async function countTrainees(centreId?: string) {
  const where = centreId ? { id: centreId } : {};
  const declared = await prisma.centre.aggregate({ where, _sum: { totalTrainees: true } });
  if (declared._sum.totalTrainees) return declared._sum.totalTrainees;
  return prisma.trainee.count({ where: centreId ? { centreId } : {} });
}

/** Every class slot scheduled for today, with its state and the attendance captured so far. */
export async function getTodaySessions(centreId?: string) {
  const now = new Date();
  const date = toDateKey(now);
  const centres = await prisma.centre.findMany({
    where: centreId ? { id: centreId } : { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      code: true,
      totalTrainees: true,
      classSlots: { where: { isActive: true }, orderBy: { startTime: 'asc' } },
      attendanceRecords: { where: { date } },
    },
  });

  // Latest headcount for sessions that are running right now
  const liveRecordIds = centres.flatMap((c) =>
    c.classSlots
      .filter((sl) => slotState(sl, now) === 'LIVE')
      .map((sl) => c.attendanceRecords.find((r) => r.session === sl.name)?.id)
      .filter((id): id is string => !!id)
  );
  const latestSnapshots = await Promise.all(
    liveRecordIds.map((attendanceRecordId) =>
      prisma.detectionSnapshot.findFirst({ where: { attendanceRecordId }, orderBy: { timestamp: 'desc' } })
    )
  );
  const liveCountByRecord = new Map(latestSnapshots.filter(Boolean).map((snap) => [snap!.attendanceRecordId, snap!]));

  const sessions: any[] = [];
  for (const centre of centres) {
    for (const slot of centre.classSlots) {
      const state = slotState(slot, now);
      if (state === 'NOT_TODAY') continue;
      const record = centre.attendanceRecords.find((r) => r.session === slot.name);
      const derived = record ? withDerived(record) : null;
      sessions.push({
        centreId: centre.id,
        centreName: centre.name,
        centreCode: centre.code,
        classSlotId: slot.id,
        name: slot.name,
        startTime: slot.startTime,
        endTime: slot.endTime,
        state: state === 'COMPLETED' && (!record || record.sampleCount === 0) ? 'MISSED' : state,
        expected: slot.expectedTrainees ?? centre.totalTrainees,
        detected: derived?.presentCount ?? null,
        isFinal: derived?.isFinal ?? false,
        peak: record?.peakCount ?? null,
        attendancePercent: derived?.attendancePercent ?? null,
        toolsOk: derived?.toolsOk ?? 0,
        toolsTotal: derived?.toolsTotal ?? 0,
        status: record?.status ?? null,
        recordId: record?.id ?? null,
        liveCount: record ? liveCountByRecord.get(record.id)?.peopleCount ?? null : null,
        lastDetectionAt: record?.lastSeenAt ?? null,
      });
    }
  }
  const order: Record<string, number> = { LIVE: 0, UPCOMING: 1, COMPLETED: 2, MISSED: 3 };
  return sessions.sort((a, b) => order[a.state] - order[b.state] || a.startTime.localeCompare(b.startTime));
}

export async function getDashboardSummary(query: DashboardSummaryQuery) {
  const { days, centreId } = query;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const cameraWhere: any = centreId ? { centreId } : {};
  const alertWhere: any = centreId ? { centreId, createdAt: { gte: since } } : { createdAt: { gte: since } };
  const attendanceWhere: any = centreId ? { centreId, date: { gte: since } } : { date: { gte: since } };

  const [
    totalCentres,
    activeCentres,
    totalCameras,
    onlineCameras,
    totalAttendanceRecords,
    totalAlerts,
    openAlerts,
    criticalAlerts,
    recentAttendance,
    recentAlerts,
    centreDetails,
    totalTrainees,
  ] = await Promise.all([
    centreId ? 1 : prisma.centre.count(),
    centreId ? 1 : prisma.centre.count({ where: { status: 'ACTIVE' } }),
    prisma.camera.count({ where: cameraWhere }),
    // "Online" = reported within the last 5 minutes (cameras only send during class)
    prisma.camera.count({ where: { ...cameraWhere, isActive: true, lastSeenAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } } }),
    prisma.attendanceRecord.count({ where: attendanceWhere }),
    prisma.alert.count({ where: alertWhere }),
    prisma.alert.count({ where: { ...alertWhere, status: 'OPEN' } }),
    prisma.alert.count({ where: { ...alertWhere, severity: 'CRITICAL', status: 'OPEN' } }),
    prisma.attendanceRecord.findMany({
      where: attendanceWhere,
      orderBy: { date: 'desc' },
      take: 10,
      include: {
        centre: { select: { id: true, name: true, code: true } },
        classSlot: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
    }),
    prisma.alert.findMany({
      where: alertWhere,
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { centre: { select: { id: true, name: true, code: true } } },
    }),
    centreId ? prisma.centre.findUnique({ where: { id: centreId } }) : Promise.resolve(null),
    countTrainees(centreId),
  ]);

  const todaySessions = await getTodaySessions(centreId);

  const discrepancyStats = await prisma.attendanceRecord.groupBy({
    by: ['status'],
    where: attendanceWhere,
    _count: true,
  });

  return {
    centre: centreDetails,
    overview: {
      totalCentres,
      activeCentres,
      totalCameras,
      onlineCameras,
      cameraUptime: totalCameras > 0 ? Math.round((onlineCameras / totalCameras) * 100) : 0,
      totalTrainees,
    },
    attendance: {
      totalRecords: totalAttendanceRecords,
      discrepancyBreakdown: discrepancyStats.reduce((acc, item) => ({ ...acc, [item.status]: item._count }), {}),
    },
    alerts: {
      total: totalAlerts,
      open: openAlerts,
      critical: criticalAlerts,
    },
    recentAttendance: recentAttendance.map(withDerived),
    todaySessions,
    recentAlerts,
  };
}

export async function getCentresForMap(query: CentresMapQuery) {
  const { status, bounds, centreId } = query as any;

  const where: any = {};
  if (centreId) where.id = centreId;
  if (status) where.status = status;
  if (bounds) {
    const [minLng, minLat, maxLng, maxLat] = bounds.split(',').map(Number);
    where.latitude = { gte: minLat, lte: maxLat };
    where.longitude = { gte: minLng, lte: maxLng };
  }

  const centres = await prisma.centre.findMany({
    where,
    select: {
      id: true,
      code: true,
      name: true,
      latitude: true,
      longitude: true,
      status: true,
      sanctionedCapacity: true,
      _count: { select: { cameras: true, alerts: { where: { status: 'OPEN' } } } },
    },
  });

  return centres.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    position: [c.latitude, c.longitude] as [number, number],
    status: c.status,
    capacity: c.sanctionedCapacity,
    cameraCount: c._count.cameras,
    openAlerts: c._count.alerts,
  }));
}

export async function getAttendanceTrends(query: AttendanceTrendsQuery) {
  const { centreId, days, session } = query;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: any = { date: { gte: since } };
  if (centreId) where.centreId = centreId;
  if (session) where.session = session;

  const records = await prisma.attendanceRecord.findMany({
    where,
    orderBy: { date: 'asc' },
    select: {
      date: true,
      session: true,
      recordedCount: true,
      expectedCount: true,
      detectedCount: true,
      finalCount: true,
      discrepancy: true,
      status: true,
    },
  });

  const byDate = new Map<string, { expected: number; detected: number; discrepancy: number; count: number }>();
  for (const r of records) {
    const key = format(r.date, 'yyyy-MM-dd'); // records are keyed on local midnight
    const existing = byDate.get(key) || { expected: 0, detected: 0, discrepancy: 0, count: 0 };
    existing.expected += r.expectedCount || r.recordedCount;
    existing.detected += r.finalCount ?? r.detectedCount ?? 0;
    existing.discrepancy += Math.abs(r.discrepancy || 0);
    existing.count += 1;
    byDate.set(key, existing);
  }

  const trendData = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      expected: data.expected,
      recorded: data.expected, // kept for older clients
      detected: data.detected,
      discrepancy: data.discrepancy,
      records: data.count,
    }));

  return { trends: trendData };
}

export async function getInfrastructureCompliance(query: InfrastructureComplianceQuery) {
  const { centreId, days } = query;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: any = { timestamp: { gte: since } };
  if (centreId) where.centreId = centreId;

  const checks = await prisma.infrastructureCheck.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    include: { item: { select: { name: true, category: true } } },
  });

  const latestByItem = new Map<string, typeof checks[0]>();
  for (const check of checks) {
    if (!latestByItem.has(check.itemId)) {
      latestByItem.set(check.itemId, check);
    }
  }

  const total = latestByItem.size;
  const functional = Array.from(latestByItem.values()).filter((c) => c.detected && c.operability === 'FUNCTIONAL').length;
  const nonFunctional = Array.from(latestByItem.values()).filter((c) => c.detected && c.operability === 'NON_FUNCTIONAL').length;
  const missing = Array.from(latestByItem.values()).filter((c) => !c.detected).length;

  const byCategory = Array.from(latestByItem.values()).reduce((acc, check) => {
    const cat = check.item.category;
    if (!acc[cat]) acc[cat] = { total: 0, functional: 0, nonFunctional: 0, missing: 0 };
    acc[cat].total++;
    if (check.detected && check.operability === 'FUNCTIONAL') acc[cat].functional++;
    else if (check.detected && check.operability === 'NON_FUNCTIONAL') acc[cat].nonFunctional++;
    else if (!check.detected) acc[cat].missing++;
    return acc;
  }, {} as Record<string, { total: number; functional: number; nonFunctional: number; missing: number }>);

  return {
    summary: {
      totalItemsChecked: total,
      functional,
      nonFunctional,
      missing,
      complianceRate: total > 0 ? Math.round((functional / total) * 100) : 0,
    },
    byCategory,
    recentChecks: checks.slice(0, 20),
  };
}
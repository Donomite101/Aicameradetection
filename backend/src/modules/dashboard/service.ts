import { prisma } from '@/shared/database/prisma';
import { DashboardSummaryQuery, CentresMapQuery, AttendanceTrendsQuery, InfrastructureComplianceQuery } from './schemas';

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
    prisma.camera.count({ where: { ...cameraWhere, isActive: true, lastSeenAt: { gte: since } } }),
    prisma.attendanceRecord.count({ where: attendanceWhere }),
    prisma.alert.count({ where: alertWhere }),
    prisma.alert.count({ where: { ...alertWhere, status: 'OPEN' } }),
    prisma.alert.count({ where: { ...alertWhere, severity: 'CRITICAL', status: 'OPEN' } }),
    prisma.attendanceRecord.findMany({
      where: attendanceWhere,
      orderBy: { date: 'desc' },
      take: 10,
      include: { centre: { select: { id: true, name: true, code: true } } },
    }),
    prisma.alert.findMany({
      where: alertWhere,
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { centre: { select: { id: true, name: true, code: true } } },
    }),
    centreId ? prisma.centre.findUnique({ where: { id: centreId } }) : Promise.resolve(null),
    centreId ? prisma.trainee.count({ where: { centreId } }) : prisma.trainee.count(),
  ]);

  // Attendance discrepancy stats
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
    recentAttendance,
    recentAlerts,
  };
}

export async function getCentresForMap(query: CentresMapQuery) {
  const { status, bounds } = query;

  const where: any = {};
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
      detectedCount: true,
      discrepancy: true,
      status: true,
    },
  });

  // Group by date
  const byDate = new Map<string, { recorded: number; detected: number; discrepancy: number; count: number }>();
  for (const r of records) {
    const key = r.date.toISOString().split('T')[0];
    const existing = byDate.get(key) || { recorded: 0, detected: 0, discrepancy: 0, count: 0 };
    existing.recorded += r.recordedCount;
    existing.detected += r.detectedCount || 0;
    existing.discrepancy += Math.abs(r.discrepancy || 0);
    existing.count += 1;
    byDate.set(key, existing);
  }

  const trendData = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      recorded: data.recorded,
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

  // Latest check per item
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
import { prisma } from '@/shared/database/prisma';
import { ListAlertsQuery, UpdateAlertInput } from './schemas';

export async function listAlerts(query: ListAlertsQuery) {
  const { page, limit, centreId, type, severity, status, startDate, endDate, sortBy, sortOrder } = query;
  const search = (query as any).search;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (centreId) where.centreId = centreId;
  if (type) where.type = type;
  if (severity) where.severity = severity;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { message: { contains: search } },
      { centre: { name: { contains: search } } },
    ];
  }
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: { centre: { select: { id: true, name: true, code: true } } },
    }),
    prisma.alert.count({ where }),
  ]);

  return {
    data: alerts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getAlertById(id: string) {
  return prisma.alert.findUnique({
    where: { id },
    include: { centre: true },
  });
}

export async function acknowledgeAlert(id: string, userId: string) {
  return prisma.alert.update({
    where: { id },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedBy: userId,
      acknowledgedAt: new Date(),
    },
  });
}

export async function resolveAlert(id: string, userId: string) {
  return prisma.alert.update({
    where: { id },
    data: {
      status: 'RESOLVED',
      resolvedBy: userId,
      resolvedAt: new Date(),
    },
  });
}

export async function updateAlertStatus(id: string, data: UpdateAlertInput, userId: string) {
  const updateData: any = { ...data };
  if (data.status === 'ACKNOWLEDGED') {
    updateData.acknowledgedBy = userId;
    updateData.acknowledgedAt = new Date();
  } else if (data.status === 'RESOLVED') {
    updateData.resolvedBy = userId;
    updateData.resolvedAt = new Date();
  }

  return prisma.alert.update({
    where: { id },
    data: updateData,
  });
}

export async function createAlert(data: {
  centreId: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
}) {
  return prisma.alert.create({
    data: {
      ...data,
      status: 'OPEN',
    },
    include: { centre: true },
  });
}

export async function getAlertStats(centreId?: string) {
  const where = centreId ? { centreId } : {};

  const [byStatus, bySeverity, byType, total] = await Promise.all([
    prisma.alert.groupBy({ by: ['status'], where, _count: true }),
    prisma.alert.groupBy({ by: ['severity'], where, _count: true }),
    prisma.alert.groupBy({ by: ['type'], where, _count: true }),
    prisma.alert.count({ where }),
  ]);

  return {
    total,
    byStatus: byStatus.reduce((acc, item) => ({ ...acc, [item.status]: item._count }), {}),
    bySeverity: bySeverity.reduce((acc, item) => ({ ...acc, [item.severity]: item._count }), {}),
    byType: byType.reduce((acc, item) => ({ ...acc, [item.type]: item._count }), {}),
  };
}
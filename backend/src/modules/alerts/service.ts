import { prisma } from '@/shared/database/prisma';
import { ListAlertsQuery, UpdateAlertInput } from './schemas';

export async function listAlerts(query: ListAlertsQuery) {
  const { centreId, type, severity, status, startDate, endDate } = query;
  const search = (query as any).search;
  const pageNum = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const take = Math.min(100, Math.max(1, parseInt(String(query.limit || 20), 10) || 20));
  const skip = (pageNum - 1) * take;
  const sortBy = query.sortBy || 'createdAt';
  const sortOrder = (query.sortOrder || 'desc') as 'asc' | 'desc';

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
    const createdFilter: any = {};
    if (startDate && !isNaN(new Date(startDate).getTime())) {
      createdFilter.gte = new Date(startDate);
    }
    if (endDate && !isNaN(new Date(endDate).getTime())) {
      createdFilter.lte = new Date(endDate);
    }
    if (Object.keys(createdFilter).length > 0) {
      where.createdAt = createdFilter;
    }
  }

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
      include: { centre: { select: { id: true, name: true, code: true } } },
    }),
    prisma.alert.count({ where }),
  ]);

  return {
    data: alerts,
    pagination: { page: pageNum, limit: take, total, totalPages: Math.ceil(total / take) },
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
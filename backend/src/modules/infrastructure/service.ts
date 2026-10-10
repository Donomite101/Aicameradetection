import { prisma } from '@/shared/database/prisma';
import { ListInfrastructureChecksQuery } from './schemas';

export async function listInfrastructureChecks(query: ListInfrastructureChecksQuery) {
  const { page, limit, centreId, itemId, detected, operability, startDate, endDate, sortBy, sortOrder } = query;
  const search = (query as any).search;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (centreId) where.centreId = centreId;
  if (itemId) where.itemId = itemId;
  if (detected !== undefined) where.detected = detected;
  if (operability) where.operability = operability;
  if (search) {
    where.OR = [
      { item: { name: { contains: search } } },
      { centre: { name: { contains: search } } },
    ];
  }
  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) where.timestamp.gte = new Date(startDate);
    if (endDate) where.timestamp.lte = new Date(endDate);
  }

  const [checks, total] = await Promise.all([
    prisma.infrastructureCheck.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        centre: { select: { id: true, name: true, code: true } },
        item: { select: { id: true, name: true, category: true } },
      },
    }),
    prisma.infrastructureCheck.count({ where }),
  ]);

  return {
    data: checks,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getInfrastructureCheckById(id: string) {
  return prisma.infrastructureCheck.findUnique({
    where: { id },
    include: {
      centre: true,
      item: true,
    },
  });
}

export async function createInfrastructureCheck(data: {
  centreId: string;
  itemId: string;
  detected: boolean;
  operability: 'FUNCTIONAL' | 'NON_FUNCTIONAL' | 'UNKNOWN' | 'MAINTENANCE';
  confidence: number;
  personNearby: boolean;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.infrastructureCheck.create({
    data,
    include: { centre: true, item: true },
  });
}

export async function getCentreInfrastructureStatus(centreId: string) {
  const items = await prisma.inventoryItem.findMany({
    where: { centreId, isActive: true },
    include: {
      checks: {
        orderBy: { timestamp: 'desc' },
        take: 1,
      },
    },
  });

  return items.map((item) => ({
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    quantity: item.quantity,
    latestCheck: item.checks[0] || null,
    status: item.checks[0]
      ? item.checks[0].detected
        ? item.checks[0].operability
        : 'MISSING'
      : 'UNCHECKED',
  }));
}

export async function getInfrastructureComplianceRate(centreId: string, days: number = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const checks = await prisma.infrastructureCheck.findMany({
    where: {
      centreId,
      timestamp: { gte: since },
    },
    orderBy: { timestamp: 'desc' },
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
  const unknown = total - functional - nonFunctional - missing;

  return {
    totalItemsChecked: total,
    functional,
    nonFunctional,
    missing,
    unknown,
    complianceRate: total > 0 ? Math.round((functional / total) * 100) : 0,
  };
}
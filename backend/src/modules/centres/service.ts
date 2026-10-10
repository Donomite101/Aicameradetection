import { prisma } from '@/shared/database/prisma';
import { CreateCentreInput, UpdateCentreInput, ListCentresQuery, AddCameraInput, UpdateCameraInput, AddInventoryItemInput, UpdateInventoryItemInput } from './schemas';

export async function createCentre(data: CreateCentreInput) {
  return prisma.centre.create({
    data,
    include: { cameras: true, inventory: true },
  });
}

export async function getCentreById(id: string) {
  return prisma.centre.findUnique({
    where: { id },
    include: {
      cameras: true,
      inventory: { where: { isActive: true } },
      _count: { select: { attendanceRecords: true, alerts: true } },
    },
  });
}

export async function getCentreByCode(code: string) {
  return prisma.centre.findUnique({
    where: { code },
    include: { cameras: true, inventory: true },
  });
}

export async function listCentres(query: ListCentresQuery) {
  const { status, search, state, schemeId } = query;
  const pageNum = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const take = Math.min(100, Math.max(1, parseInt(String(query.limit || 20), 10) || 20));
  const skip = (pageNum - 1) * take;
  const sortBy = query.sortBy || 'createdAt';
  const sortOrder = (query.sortOrder || 'desc') as 'asc' | 'desc';

  const where: any = {};
  if (status) where.status = status;
  if (state) where.state = state;
  if (schemeId) where.schemeId = schemeId;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { code: { contains: search } },
      { address: { contains: search } },
    ];
  }

  const [centres, total] = await Promise.all([
    prisma.centre.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
      include: {
        _count: { select: { cameras: true, attendanceRecords: true, alerts: true } },
      },
    }),
    prisma.centre.count({ where }),
  ]);

  return {
    data: centres,
    pagination: {
      page: pageNum,
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  };
}

export async function updateCentre(id: string, data: UpdateCentreInput) {
  return prisma.centre.update({
    where: { id },
    data,
    include: { cameras: true, inventory: true },
  });
}

export async function deleteCentre(id: string) {
  return prisma.centre.delete({ where: { id } });
}

export async function addCamera(centreId: string, data: AddCameraInput) {
  return prisma.camera.create({
    data: { centreId, ...data },
  });
}

export async function updateCamera(centreId: string, cameraId: string, data: UpdateCameraInput) {
  return prisma.camera.update({
    where: { id: cameraId, centreId },
    data,
  });
}

export async function deleteCamera(centreId: string, cameraId: string) {
  return prisma.camera.delete({ where: { id: cameraId, centreId } });
}

export async function getCameras(centreId: string) {
  return prisma.camera.findMany({
    where: { centreId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function addInventoryItem(centreId: string, data: AddInventoryItemInput) {
  return prisma.inventoryItem.create({
    data: { centreId, ...data },
  });
}

export async function updateInventoryItem(centreId: string, itemId: string, data: UpdateInventoryItemInput) {
  return prisma.inventoryItem.update({
    where: { id: itemId, centreId },
    data,
  });
}

export async function deleteInventoryItem(centreId: string, itemId: string) {
  return prisma.inventoryItem.delete({ where: { id: itemId, centreId } });
}

export async function getInventory(centreId: string) {
  return prisma.inventoryItem.findMany({
    where: { centreId, isActive: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}

export async function getCentreStats(centreId: string) {
  const [
    totalAttendance,
    recentAttendance,
    totalAlerts,
    openAlerts,
    inventoryCount,
    cameraCount,
  ] = await Promise.all([
    prisma.attendanceRecord.count({ where: { centreId } }),
    prisma.attendanceRecord.findMany({
      where: { centreId },
      orderBy: { date: 'desc' },
      take: 30,
      select: { date: true, recordedCount: true, detectedCount: true, status: true },
    }),
    prisma.alert.count({ where: { centreId } }),
    prisma.alert.count({ where: { centreId, status: 'OPEN' } }),
    prisma.inventoryItem.count({ where: { centreId, isActive: true } }),
    prisma.camera.count({ where: { centreId, isActive: true } }),
  ]);

  return {
    totalAttendance,
    recentAttendance,
    totalAlerts,
    openAlerts,
    inventoryCount,
    cameraCount,
  };
}
import { prisma } from '@/shared/database/prisma';
import { CreateCentreInput, UpdateCentreInput, ListCentresQuery, AddCameraInput, UpdateCameraInput, AddInventoryItemInput, UpdateInventoryItemInput } from './schemas';
import { DETECTABLE_CLASSES, findActiveSlot, findNextSlot, toDateKey, validateSlots } from './schedule';
import { discrepancyTolerance } from '@/modules/detection/service';

const centreInclude = {
  cameras: true,
  inventory: { where: { isActive: true } },
  classSlots: { where: { isActive: true }, orderBy: { startTime: 'asc' as const } },
  scheme: { select: { id: true, code: true, name: true } },
};

class ValidationError extends Error {
  statusCode = 400;
}

function toolLabel(t: { detectClass: string; name?: string }) {
  return t.name?.trim() || DETECTABLE_CLASSES.find((c) => c.detectClass === t.detectClass)?.label || t.detectClass;
}

async function resolveScheme(schemeId: string) {
  const scheme = await prisma.scheme.findUnique({ where: { id: schemeId } });
  if (!scheme) throw new ValidationError('Selected scheme does not exist');
  return scheme;
}

function assertSlotsValid(slots: { name: string; startTime: string; endTime: string; daysOfWeek: number[] }[]) {
  const error = validateSlots(slots);
  if (error) throw new ValidationError(error);
}

export async function createCentre(input: CreateCentreInput) {
  const { tools, slots, schemeId, ...rest } = input;
  const scheme = await resolveScheme(schemeId);
  assertSlotsValid(slots);

  return prisma.centre.create({
    data: {
      ...rest,
      schemeId: scheme.id,
      schemeName: scheme.name,
      inventory: {
        create: tools.map((t) => ({
          name: toolLabel(t),
          category: 'TOOLS',
          quantity: t.quantity,
          detectClass: t.detectClass,
        })),
      },
      classSlots: {
        create: slots.map((sl) => ({
          name: sl.name,
          startTime: sl.startTime,
          endTime: sl.endTime,
          daysOfWeek: sl.daysOfWeek.join(','),
          expectedTrainees: sl.expectedTrainees,
        })),
      },
    },
    include: centreInclude,
  });
}

export async function getCentreById(id: string) {
  return prisma.centre.findUnique({
    where: { id },
    include: {
      ...centreInclude,
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

export async function listCentres(query: ListCentresQuery, userCentreId?: string) {
  const { status, search, state, schemeId } = query;
  const pageNum = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const take = Math.min(100, Math.max(1, parseInt(String(query.limit || 20), 10) || 20));
  const skip = (pageNum - 1) * take;
  const sortBy = query.sortBy || 'createdAt';
  const sortOrder = (query.sortOrder || 'desc') as 'asc' | 'desc';

  const where: any = {};
  if (userCentreId) {
    where.id = userCentreId;
  }
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
        classSlots: { where: { isActive: true }, orderBy: { startTime: 'asc' } },
        inventory: { where: { isActive: true, detectClass: { not: null } } },
        scheme: { select: { id: true, code: true, name: true } },
        _count: { select: { cameras: true, attendanceRecords: true, alerts: true, inventory: true, trainees: true } },
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

/**
 * Changing the trainee total or a slot's expected number applies to today's sessions too,
 * so the screens never keep showing an old number. Earlier days keep what was expected then.
 */
export async function refreshTodayExpectations(centreId: string) {
  const centre = await prisma.centre.findUnique({ where: { id: centreId }, include: { classSlots: true } });
  if (!centre) return;
  const records = await prisma.attendanceRecord.findMany({ where: { centreId, date: toDateKey() } });
  for (const r of records) {
    const slot = centre.classSlots.find((s) => s.id === r.classSlotId) ?? centre.classSlots.find((s) => s.name === r.session);
    if (!slot) continue;
    const expected = slot.expectedTrainees ?? centre.totalTrainees ?? 0;
    if (expected === r.expectedCount) continue;

    const closed = !!r.finalizedAt && r.finalCount != null;
    const present = closed ? (r.finalCount as number) : r.detectedCount ?? 0;
    const gap = present - (expected > 0 ? expected : r.recordedCount);
    const locked = r.status === 'UNDER_REVIEW' || !!r.verifiedBy;
    const status = closed && !locked ? (expected === 0 || Math.abs(gap) <= discrepancyTolerance(expected) ? 'VERIFIED' : 'DISCREPANT') : r.status;
    await prisma.attendanceRecord.update({ where: { id: r.id }, data: { expectedCount: expected, discrepancy: gap, status } });
  }
}

export async function updateCentre(id: string, input: UpdateCentreInput) {
  const { tools, slots, schemeId, ...rest } = input;
  const data: any = { ...rest };

  if (schemeId) {
    const scheme = await resolveScheme(schemeId);
    data.schemeId = scheme.id;
    data.schemeName = scheme.name;
  }
  if (slots) assertSlotsValid(slots);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.centre.update({ where: { id }, data });

    if (tools) {
      // Tools managed from the centre form are the inventory rows that carry a detectClass.
      const keepIds = tools.map((t) => t.id).filter(Boolean) as string[];
      await tx.inventoryItem.updateMany({
        where: { centreId: id, detectClass: { not: null }, id: { notIn: keepIds } },
        data: { isActive: false },
      });
      for (const t of tools) {
        const payload = { name: toolLabel(t), category: 'TOOLS', quantity: t.quantity, detectClass: t.detectClass, isActive: true };
        if (t.id) {
          await tx.inventoryItem.update({ where: { id: t.id }, data: payload });
        } else {
          await tx.inventoryItem.create({ data: { centreId: id, ...payload } });
        }
      }
    }

    if (slots) {
      const keepIds = slots.map((sl) => sl.id).filter(Boolean) as string[];
      await tx.classSlot.deleteMany({ where: { centreId: id, id: { notIn: keepIds } } });
      for (const sl of slots) {
        const payload = {
          name: sl.name,
          startTime: sl.startTime,
          endTime: sl.endTime,
          daysOfWeek: sl.daysOfWeek.join(','),
          expectedTrainees: sl.expectedTrainees ?? null,
          isActive: true,
        };
        if (sl.id) {
          await tx.classSlot.update({ where: { id: sl.id }, data: payload });
        } else {
          await tx.classSlot.create({ data: { centreId: id, ...payload } });
        }
      }
    }

    return tx.centre.findUnique({ where: { id }, include: centreInclude });
  });

  await refreshTodayExpectations(id);
  return updated;
}

export async function getSchedule(centreId: string, now: Date = new Date()) {
  const slots = await prisma.classSlot.findMany({
    where: { centreId, isActive: true },
    orderBy: { startTime: 'asc' },
  });
  const next = findNextSlot(slots, now);
  return {
    slots,
    activeSlot: findActiveSlot(slots, now),
    nextSlot: next ? { ...next.slot, startsAt: next.startsAt.toISOString() } : null,
    serverTime: now.toISOString(),
  };
}

export async function deleteCentre(id: string) {
  return prisma.centre.delete({ where: { id } });
}

export async function addCamera(centreId: string, data: AddCameraInput) {
  const { roi, ...rest } = data;
  return prisma.camera.create({
    data: {
      centreId,
      ...rest,
      roi: roi ? JSON.stringify(roi) : undefined,
    },
  });
}

export async function updateCamera(centreId: string, cameraId: string, data: UpdateCameraInput) {
  const { roi, ...rest } = data;
  return prisma.camera.update({
    where: { id: cameraId, centreId },
    data: {
      ...rest,
      ...(roi !== undefined ? { roi: roi ? JSON.stringify(roi) : null } : {}),
    },
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
  const { specs, ...rest } = data;
  return prisma.inventoryItem.create({
    data: {
      centreId,
      ...rest,
      specs: specs ? JSON.stringify(specs) : undefined,
    },
  });
}

export async function updateInventoryItem(centreId: string, itemId: string, data: UpdateInventoryItemInput) {
  const { specs, ...rest } = data;
  return prisma.inventoryItem.update({
    where: { id: itemId, centreId },
    data: {
      ...rest,
      ...(specs !== undefined ? { specs: specs ? JSON.stringify(specs) : null } : {}),
    },
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
import { prisma } from '@/shared/database/prisma';
import { parseDateKey } from '@/modules/centres/schedule';
import { parseToolsSummary } from '@/modules/detection/service';

/** Adds attendance % and tool compliance to a stored record for API responses. */
export function withDerived<T extends { expectedCount: number; recordedCount: number; detectedCount: number | null; finalCount: number | null; finalizedAt: Date | null; peakCount: number | null; toolsSummary: string | null }>(record: T) {
  const tools = parseToolsSummary(record.toolsSummary);
  const target = record.expectedCount > 0 ? record.expectedCount : record.recordedCount;
  // After the class: the final count. During the class: the running average.
  const isFinal = !!record.finalizedAt && record.finalCount != null;
  const presentCount = isFinal ? record.finalCount : record.detectedCount;
  return {
    ...record,
    isFinal,
    presentCount,
    tools,
    toolsOk: tools.filter((t) => t.maxDetected >= t.expected).length,
    toolsTotal: tools.length,
    attendancePercent: target > 0 && presentCount != null ? Math.min(100, Math.round((presentCount / target) * 100)) : null,
    peakAttendancePercent: target > 0 && record.peakCount != null ? Math.min(100, Math.round((record.peakCount / target) * 100)) : null,
  };
}
import { SubmitAttendanceInput, ListAttendanceQuery, UpdateAttendanceInput, AttendanceSummaryQuery } from './schemas';

export async function submitAttendance(data: SubmitAttendanceInput, userId: string) {
  const date = parseDateKey(data.date);

  const existing = await prisma.attendanceRecord.findUnique({
    where: {
      centreId_date_session: {
        centreId: data.centreId,
        date,
        session: data.session,
      },
    },
  });

  if (existing) {
    return prisma.attendanceRecord.update({
      where: { id: existing.id },
      data: {
        recordedCount: data.recordedCount,
        submittedBy: userId,
        status: 'PENDING',
      },
    });
  }

  return prisma.attendanceRecord.create({
    data: {
      centreId: data.centreId,
      date,
      session: data.session,
      recordedCount: data.recordedCount,
      submittedBy: userId,
      status: 'PENDING',
    },
  });
}

export async function getAttendanceById(id: string) {
  const record = await prisma.attendanceRecord.findUnique({
    where: { id },
    include: {
      centre: { select: { id: true, name: true, code: true, totalTrainees: true } },
      classSlot: true,
      snapshots: { orderBy: { timestamp: 'asc' } },
    },
  });
  return record ? withDerived(record) : null;
}

export async function listAttendance(query: ListAttendanceQuery) {
  const { centreId, startDate, endDate, session, status } = query;
  const classSlotId = (query as any).classSlotId;
  const search = (query as any).search;
  const pageNum = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const take = Math.min(100, Math.max(1, parseInt(String(query.limit || 20), 10) || 20));
  const skip = (pageNum - 1) * take;
  const sortBy = query.sortBy || 'date';
  const sortOrder = (query.sortOrder || 'desc') as 'asc' | 'desc';

  const where: any = {};
  if (centreId) where.centreId = centreId;
  if (session) where.session = session;
  if (classSlotId) where.classSlotId = classSlotId;
  if (status) where.status = status;
  if (search) {
    where.centre = {
      OR: [
        { name: { contains: search } },
        { code: { contains: search } },
      ],
    };
  }
  if (startDate || endDate) {
    const dateFilter: any = {};
    if (startDate && !isNaN(parseDateKey(startDate).getTime())) {
      dateFilter.gte = parseDateKey(startDate);
    }
    if (endDate && !isNaN(parseDateKey(endDate).getTime())) {
      dateFilter.lte = parseDateKey(endDate);
    }
    if (Object.keys(dateFilter).length > 0) {
      where.date = dateFilter;
    }
  }

  const [records, total] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where,
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
      include: {
        centre: { select: { id: true, name: true, code: true } },
        classSlot: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
    }),
    prisma.attendanceRecord.count({ where }),
  ]);

  return {
    data: records.map(withDerived),
    pagination: { page: pageNum, limit: take, total, totalPages: Math.ceil(total / take) },
  };
}

export async function updateAttendance(id: string, data: UpdateAttendanceInput, userId: string) {
  const updateData: any = { ...data };
  if (data.status === 'VERIFIED') {
    updateData.verifiedBy = userId;
    updateData.verifiedAt = new Date();
  }

  return prisma.attendanceRecord.update({
    where: { id },
    data: updateData,
  });
}

export async function getAttendanceSummary(centreId: string, query: AttendanceSummaryQuery) {
  const { startDate, endDate } = query;
  const where: any = { centreId };
  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = parseDateKey(startDate);
    if (endDate) where.date.lte = parseDateKey(endDate);
  }

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
      confidence: true,
    },
  });

  const totalRecorded = records.reduce((sum, r) => sum + r.recordedCount, 0);
  const totalDetected = records.reduce((sum, r) => sum + (r.detectedCount || 0), 0);
  const totalDiscrepancy = records.reduce((sum, r) => sum + Math.abs(r.discrepancy || 0), 0);
  const avgConfidence = records.filter(r => r.confidence).reduce((sum, r) => sum + (r.confidence || 0), 0) /
    (records.filter(r => r.confidence).length || 1);

  const byStatus = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const bySession = records.reduce((acc, r) => {
    acc[r.session] = (acc[r.session] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    totalRecords: records.length,
    totalRecorded,
    totalDetected,
    totalDiscrepancy,
    avgConfidence: Math.round(avgConfidence * 100) / 100,
    byStatus,
    bySession,
    records,
  };
}

export async function getRecentDiscrepancies(centreId: string, limit: number = 10) {
  return prisma.attendanceRecord.findMany({
    where: {
      centreId,
      discrepancy: { not: 0 },
      status: { in: ['DISCREPANT', 'PENDING'] },
    },
    orderBy: { date: 'desc' },
    take: limit,
    include: { centre: { select: { name: true, code: true } } },
  });
}
import { prisma } from '@/shared/database/prisma';
import { config } from '@/config';
import { SubmitAttendanceInput, ListAttendanceQuery, UpdateAttendanceInput, AttendanceSummaryQuery } from './schemas';

export async function submitAttendance(data: SubmitAttendanceInput, userId: string) {
  const date = new Date(data.date);

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
  return prisma.attendanceRecord.findUnique({
    where: { id },
    include: { centre: true },
  });
}

export async function listAttendance(query: ListAttendanceQuery) {
  const { centreId, startDate, endDate, session, status } = query;
  const search = (query as any).search;
  const pageNum = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const take = Math.min(100, Math.max(1, parseInt(String(query.limit || 20), 10) || 20));
  const skip = (pageNum - 1) * take;
  const sortBy = query.sortBy || 'date';
  const sortOrder = (query.sortOrder || 'desc') as 'asc' | 'desc';

  const where: any = {};
  if (centreId) where.centreId = centreId;
  if (session) where.session = session;
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
    if (startDate && !isNaN(new Date(startDate).getTime())) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate && !isNaN(new Date(endDate).getTime())) {
      dateFilter.lte = new Date(endDate);
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
      include: { centre: { select: { id: true, name: true, code: true } } },
    }),
    prisma.attendanceRecord.count({ where }),
  ]);

  return {
    data: records,
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

export async function processDetectionResult(
  centreId: string,
  date: Date,
  session: string,
  detectedCount: number,
  confidence: number,
  metadata?: Record<string, unknown>
) {
  const record = await prisma.attendanceRecord.findUnique({
    where: {
      centreId_date_session: { centreId, date, session },
    },
  });

  if (!record) {
    // Create record with detected count if no manual record exists
    return prisma.attendanceRecord.create({
      data: {
        centreId,
        date,
        session,
        recordedCount: 0,
        detectedCount,
        discrepancy: detectedCount,
        confidence,
        status: 'DISCREPANT',
        metadata,
      },
    });
  }

  const discrepancy = detectedCount - record.recordedCount;
  const absDiscrepancy = Math.abs(discrepancy);

  let status: 'PENDING' | 'VERIFIED' | 'DISCREPANT' | 'UNDER_REVIEW' = record.status;
  if (absDiscrepancy > config.ATTENDANCE_DISCREPANCY_THRESHOLD) {
    status = 'DISCREPANT';
  } else if (record.status === 'PENDING') {
    status = 'VERIFIED';
  }

  return prisma.attendanceRecord.update({
    where: { id: record.id },
    data: {
      detectedCount,
      discrepancy,
      confidence,
      status,
      metadata: { ...(record.metadata as object), ...metadata },
    },
  });
}

export async function getAttendanceSummary(centreId: string, query: AttendanceSummaryQuery) {
  const { startDate, endDate } = query;
  const where: any = { centreId };
  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = new Date(startDate);
    if (endDate) where.date.lte = new Date(endDate);
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
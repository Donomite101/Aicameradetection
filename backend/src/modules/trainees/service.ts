import { prisma } from '@/shared/database/prisma';
import { CreateTraineeInput, UpdateTraineeInput, ListTraineesQuery, MarkAttendanceInput, ListTraineeAttendanceQuery } from './schemas';

export async function createTrainee(data: CreateTraineeInput, centreId: string) {
  const regNo = data.registrationNo?.trim() || `TRN-${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;

  let dob: Date | null = null;
  if (data.dateOfBirth) {
    const d = new Date(data.dateOfBirth);
    if (!isNaN(d.getTime())) {
      dob = d;
    }
  }

  return prisma.trainee.create({
    data: {
      centreId,
      registrationNo: regNo,
      fullName: data.fullName,
      email: data.email || null,
      phone: data.phone || null,
      gender: data.gender || null,
      dateOfBirth: dob,
      aadhaarLast4: data.aadhaarLast4 || null,
      courseName: data.courseName || null,
      batchName: data.batchName || null,
      schemeCode: data.schemeCode || null,
      status: data.status || 'ACTIVE',
      photoUrl: data.photoUrl || null,
    },
    include: {
      centre: {
        select: { id: true, name: true, code: true, city: true, state: true },
      },
    },
  });
}

export async function listTrainees(query: ListTraineesQuery, userCentreId?: string | null, isAdmin = false) {
  const { search, batchName, courseName, status } = query;
  const pageNum = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const take = Math.min(100, Math.max(1, parseInt(String(query.limit || 50), 10) || 50));
  const skip = (pageNum - 1) * take;

  const where: any = {};

  // If officer (not admin), enforce their assigned centre
  if (!isAdmin && userCentreId) {
    where.centreId = userCentreId;
  } else if (query.centreId) {
    where.centreId = query.centreId;
  }

  if (batchName) where.batchName = batchName;
  if (courseName) where.courseName = courseName;
  if (status) where.status = status;

  if (search) {
    where.OR = [
      { fullName: { contains: search } },
      { registrationNo: { contains: search } },
      { phone: { contains: search } },
      { email: { contains: search } },
    ];
  }

  const [trainees, total] = await Promise.all([
    prisma.trainee.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        centre: {
          select: { id: true, name: true, code: true, city: true, state: true },
        },
      },
    }),
    prisma.trainee.count({ where }),
  ]);

  return {
    data: trainees,
    pagination: {
      page: pageNum,
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  };
}

export async function getTraineeById(id: string) {
  return prisma.trainee.findUnique({
    where: { id },
    include: {
      centre: true,
      attendance: {
        take: 30,
        orderBy: { date: 'desc' },
      },
    },
  });
}

export async function updateTrainee(id: string, data: UpdateTraineeInput) {
  const updateData: any = {};
  if (data.fullName !== undefined) updateData.fullName = data.fullName;
  if (data.email !== undefined) updateData.email = data.email || null;
  if (data.phone !== undefined) updateData.phone = data.phone || null;
  if (data.gender !== undefined) updateData.gender = data.gender || null;
  if (data.courseName !== undefined) updateData.courseName = data.courseName || null;
  if (data.batchName !== undefined) updateData.batchName = data.batchName || null;
  if (data.schemeCode !== undefined) updateData.schemeCode = data.schemeCode || null;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl || null;
  if (data.aadhaarLast4 !== undefined) updateData.aadhaarLast4 = data.aadhaarLast4 || null;

  if (data.dateOfBirth !== undefined) {
    if (data.dateOfBirth) {
      const d = new Date(data.dateOfBirth);
      updateData.dateOfBirth = !isNaN(d.getTime()) ? d : null;
    } else {
      updateData.dateOfBirth = null;
    }
  }

  return prisma.trainee.update({
    where: { id },
    data: updateData,
    include: {
      centre: {
        select: { id: true, name: true, code: true, city: true, state: true },
      },
    },
  });
}

export async function deleteTrainee(id: string) {
  return prisma.trainee.delete({ where: { id } });
}

export async function markBatchAttendance(
  data: MarkAttendanceInput,
  centreId: string,
  markedByUserId?: string
) {
  const targetDate = data.date ? new Date(data.date) : new Date();
  // Normalize date to start of day in UTC
  targetDate.setUTCHours(0, 0, 0, 0);

  const session = data.session || 'FULL_DAY';
  const results = [];

  for (const record of data.records) {
    const upserted = await prisma.traineeAttendance.upsert({
      where: {
        traineeId_date_session: {
          traineeId: record.traineeId,
          date: targetDate,
          session,
        },
      },
      update: {
        status: record.status,
        remarks: record.remarks || null,
        markedBy: markedByUserId || null,
      },
      create: {
        traineeId: record.traineeId,
        centreId,
        date: targetDate,
        session,
        status: record.status,
        remarks: record.remarks || null,
        markedBy: markedByUserId || null,
      },
    });
    results.push(upserted);
  }

  return { count: results.length, date: targetDate, session, records: results };
}

export async function listTraineeAttendance(
  query: ListTraineeAttendanceQuery,
  userCentreId?: string | null,
  isAdmin = false
) {
  const where: any = {};

  if (!isAdmin && userCentreId) {
    where.centreId = userCentreId;
  } else if (query.centreId) {
    where.centreId = query.centreId;
  }

  if (query.traineeId) where.traineeId = query.traineeId;
  if (query.session) where.session = query.session;

  if (query.date) {
    const d = new Date(query.date);
    if (!isNaN(d.getTime())) {
      const startOfDay = new Date(d);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(d);
      endOfDay.setUTCHours(23, 59, 59, 999);
      where.date = { gte: startOfDay, lte: endOfDay };
    }
  }

  return prisma.traineeAttendance.findMany({
    where,
    orderBy: { date: 'desc' },
    include: {
      trainee: {
        select: {
          id: true,
          fullName: true,
          registrationNo: true,
          batchName: true,
          courseName: true,
          photoUrl: true,
        },
      },
    },
  });
}

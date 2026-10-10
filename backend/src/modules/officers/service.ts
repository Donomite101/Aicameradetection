import { prisma } from '@/shared/database/prisma';
import bcrypt from 'bcryptjs';
import { CreateOfficerInput, UpdateOfficerInput, ListOfficersQuery } from './schemas';

export async function createOfficer(data: CreateOfficerInput) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new Error('User with this email already exists');
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  return prisma.user.create({
    data: {
      fullName: data.fullName,
      email: data.email,
      passwordHash,
      role: data.role,
      centreId: data.centreId,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      centreId: true,
      centre: { select: { id: true, name: true, code: true, city: true, state: true } },
      isActive: true,
      createdAt: true,
    },
  });
}

export async function listOfficers(query: ListOfficersQuery) {
  const { centreId, search, role } = query;
  const pageNum = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const take = Math.min(100, Math.max(1, parseInt(String(query.limit || 50), 10) || 50));
  const skip = (pageNum - 1) * take;

  const where: any = {};
  if (centreId) where.centreId = centreId;
  if (role) where.role = role;
  if (search) {
    where.OR = [
      { fullName: { contains: search } },
      { email: { contains: search } },
      { centre: { name: { contains: search } } },
    ];
  }

  const [officers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        centreId: true,
        centre: { select: { id: true, name: true, code: true, city: true, state: true } },
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    data: officers,
    pagination: { page: pageNum, limit: take, total, totalPages: Math.ceil(total / take) },
  };
}

export async function getOfficerById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      centreId: true,
      centre: { select: { id: true, name: true, code: true, city: true, state: true } },
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}

export async function updateOfficer(id: string, data: UpdateOfficerInput) {
  const updateData: any = {};
  if (data.fullName) updateData.fullName = data.fullName;
  if (data.email) updateData.email = data.email;
  if (data.role) updateData.role = data.role;
  if (data.centreId !== undefined) updateData.centreId = data.centreId || null;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, 12);
  }

  return prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      centreId: true,
      centre: { select: { id: true, name: true, code: true } },
      isActive: true,
      updatedAt: true,
    },
  });
}

export async function deleteOfficer(id: string) {
  return prisma.user.delete({ where: { id } });
}

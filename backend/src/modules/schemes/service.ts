import { prisma } from '@/shared/database/prisma';
import { CreateSchemeInput, UpdateSchemeInput, ListSchemesQuery } from './schemas';

export async function createScheme(data: CreateSchemeInput) {
  return prisma.scheme.create({ data });
}

export async function listSchemes(query: ListSchemesQuery) {
  const { search, isActive } = query;
  const pageNum = Math.max(1, parseInt(String(query.page || 1), 10) || 1);
  const take = Math.min(100, Math.max(1, parseInt(String(query.limit || 50), 10) || 50));
  const skip = (pageNum - 1) * take;

  const where: any = {};
  if (isActive !== undefined) where.isActive = isActive;
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { name: { contains: search } },
      { ministry: { contains: search } },
    ];
  }

  const [schemes, total] = await Promise.all([
    prisma.scheme.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.scheme.count({ where }),
  ]);

  return {
    data: schemes,
    pagination: { page: pageNum, limit: take, total, totalPages: Math.ceil(total / take) },
  };
}

export async function getSchemeById(id: string) {
  return prisma.scheme.findUnique({ where: { id } });
}

export async function updateScheme(id: string, data: UpdateSchemeInput) {
  return prisma.scheme.update({
    where: { id },
    data,
  });
}

export async function deleteScheme(id: string) {
  return prisma.scheme.delete({ where: { id } });
}

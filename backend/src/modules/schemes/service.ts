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
  // Query-string values arrive as strings, so "false" must not be treated as truthy
  if (isActive !== undefined) where.isActive = String(isActive) === 'true';
  if (search) {
    where.OR = [
      { code: { contains: search } },
      { name: { contains: search } },
      { ministry: { contains: search } },
    ];
  }

  const [schemes, total, usage] = await Promise.all([
    prisma.scheme.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { centres: true } } },
    }),
    prisma.scheme.count({ where }),
    // trainees declared on the centres that run each scheme
    prisma.centre.groupBy({ by: ['schemeId'], _sum: { totalTrainees: true } }),
  ]);

  const traineesByScheme = new Map(usage.map((u) => [u.schemeId, u._sum.totalTrainees ?? 0]));

  return {
    data: schemes.map(({ _count, ...scheme }) => ({
      ...scheme,
      centreCount: _count.centres,
      totalTrainees: traineesByScheme.get(scheme.id) ?? 0,
    })),
    pagination: { page: pageNum, limit: take, total, totalPages: Math.ceil(total / take) },
  };
}

export async function getSchemeById(id: string) {
  return prisma.scheme.findUnique({ where: { id } });
}

export async function updateScheme(id: string, data: UpdateSchemeInput) {
  const scheme = await prisma.scheme.update({
    where: { id },
    data,
  });
  if (data.name) {
    await prisma.centre.updateMany({ where: { schemeId: id }, data: { schemeName: scheme.name } });
  }
  return scheme;
}

export async function deleteScheme(id: string) {
  const centres = await prisma.centre.count({ where: { schemeId: id } });
  if (centres > 0) {
    const error: any = new Error(`This scheme is used by ${centres} centre${centres === 1 ? '' : 's'}. Reassign them or mark the scheme inactive instead.`);
    error.statusCode = 409;
    throw error;
  }
  return prisma.scheme.delete({ where: { id } });
}

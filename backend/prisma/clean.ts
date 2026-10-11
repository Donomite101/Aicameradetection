import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function cleanDatabase() {
  console.log('🧹 Cleaning all sample/mock data from database...');

  // Delete records in order of foreign key dependency
  await prisma.traineeAttendance.deleteMany({});
  await prisma.trainee.deleteMany({});
  await prisma.infrastructureCheck.deleteMany({});
  await prisma.alert.deleteMany({});
  await prisma.detectionSnapshot.deleteMany({});
  await prisma.attendanceRecord.deleteMany({});
  await prisma.classSlot.deleteMany({});
  await prisma.inventoryItem.deleteMany({});
  await prisma.camera.deleteMany({});
  
  // Reset centre assignments on users
  await prisma.user.updateMany({
    data: { centreId: null },
  });

  // Delete sample centres
  await prisma.centre.deleteMany({});

  console.log('✨ Cleaned all attendance, alerts, centres, cameras, inventory, and trainees.');

  // Ensure standard Admin user exists
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@sih.gov.in' },
    update: { passwordHash: adminPassword, centreId: null },
    create: {
      email: 'admin@sih.gov.in',
      passwordHash: adminPassword,
      fullName: 'System Administrator',
      role: 'ADMIN',
    },
  });

  // Ensure standard Officer user exists (unassigned to any centre)
  const officerPassword = await bcrypt.hash('officer123', 12);
  await prisma.user.upsert({
    where: { email: 'officer@sih.gov.in' },
    update: { passwordHash: officerPassword, centreId: null, role: 'MONITORING_OFFICER' },
    create: {
      email: 'officer@sih.gov.in',
      passwordHash: officerPassword,
      fullName: 'Monitoring Officer',
      role: 'MONITORING_OFFICER',
    },
  });

  console.log('✅ Admin (admin@sih.gov.in / admin123) and Officer (officer@sih.gov.in / officer123) users retained.');
  console.log('🎉 Database is 100% clean and ready for real data insertion!');
}

cleanDatabase()
  .catch((err) => {
    console.error('❌ Cleaning failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

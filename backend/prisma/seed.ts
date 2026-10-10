import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@sih.gov.in' },
    update: { passwordHash: adminPassword },
    create: {
      email: 'admin@sih.gov.in',
      passwordHash: adminPassword,
      fullName: 'System Administrator',
      role: 'ADMIN',
    },
  });
  console.log('✅ Created admin user:', admin.email);

  // Create monitoring officer
  const officerPassword = await bcrypt.hash('officer123', 12);
  const officer = await prisma.user.upsert({
    where: { email: 'officer@sih.gov.in' },
    update: { passwordHash: officerPassword },
    create: {
      email: 'officer@sih.gov.in',
      passwordHash: officerPassword,
      fullName: 'Monitoring Officer',
      role: 'MONITORING_OFFICER',
    },
  });
  console.log('✅ Created monitoring officer:', officer.email);

  // Create sample centres
  const centres = [
    {
      code: 'TC-DEL-001',
      name: 'Delhi Technical Training Centre',
      address: 'Sector 16, Rohini',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110089',
      latitude: 28.7041,
      longitude: 77.1025,
      sanctionedCapacity: 120,
      status: 'ACTIVE',
      contactPerson: 'Rajesh Kumar',
      contactPhone: '+91-11-2755XXXX',
      contactEmail: 'delhi.tc@skill.gov.in',
      schemeId: 'PMKVY-2024',
      schemeName: 'Pradhan Mantri Kaushal Vikas Yojana',
    },
    {
      code: 'TC-MUM-002',
      name: 'Mumbai Skill Development Institute',
      address: 'Andheri East, MIDC',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400093',
      latitude: 19.1136,
      longitude: 72.8697,
      sanctionedCapacity: 200,
      status: 'ACTIVE',
      contactPerson: 'Priya Sharma',
      contactPhone: '+91-22-2834XXXX',
      contactEmail: 'mumbai.sdi@skill.gov.in',
      schemeId: 'PMKVY-2024',
      schemeName: 'Pradhan Mantri Kaushal Vikas Yojana',
    },
    {
      code: 'TC-BLR-003',
      name: 'Bangalore Advanced Training Centre',
      address: 'Electronic City, Phase 1',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560100',
      latitude: 12.8456,
      longitude: 77.6603,
      sanctionedCapacity: 150,
      status: 'ACTIVE',
      contactPerson: 'Arjun Reddy',
      contactPhone: '+91-80-2852XXXX',
      contactEmail: 'blr.atc@skill.gov.in',
      schemeId: 'PMKVY-2024',
      schemeName: 'Pradhan Mantri Kaushal Vikas Yojana',
    },
  ];

  for (const centreData of centres) {
    const centre = await prisma.centre.upsert({
      where: { code: centreData.code },
      update: {},
      create: centreData,
    });
    console.log('✅ Created centre:', centre.code);

    // Add cameras
    const cameras = [
      { centreId: centre.id, name: 'Main Hall Camera 1', rtspUrl: 'rtsp://demo:demo@ipvmdemo.ivideon.com:554/cam1', isActive: true },
      { centreId: centre.id, name: 'Workshop Camera 1', rtspUrl: 'rtsp://demo:demo@ipvmdemo.ivideon.com:554/cam2', isActive: true },
      { centreId: centre.id, name: 'Entry/Exit Camera', rtspUrl: 'rtsp://demo:demo@ipvmdemo.ivideon.com:554/cam3', isActive: true },
    ];
    for (const cam of cameras) {
      await prisma.camera.upsert({
        where: { id: 'temp-' + centre.id + cam.name }, // Will fail but we'll catch
        update: {},
        create: cam,
      }).catch(() => {});
    }

    // Add inventory
    const inventory = [
      { centreId: centre.id, name: 'Workbench', category: 'FURNITURE', quantity: 20, unit: 'PCS', location: 'Workshop Area' },
      { centreId: centre.id, name: 'Lathe Machine', category: 'MACHINERY', quantity: 5, unit: 'PCS', location: 'Workshop Area' },
      { centreId: centre.id, name: 'Milling Machine', category: 'MACHINERY', quantity: 3, unit: 'PCS', location: 'Workshop Area' },
      { centreId: centre.id, name: 'Welding Machine', category: 'MACHINERY', quantity: 8, unit: 'PCS', location: 'Welding Bay' },
      { centreId: centre.id, name: 'Safety Helmet', category: 'SAFETY', quantity: 50, unit: 'PCS', location: 'Storage Room' },
      { centreId: centre.id, name: 'Safety Goggles', category: 'SAFETY', quantity: 50, unit: 'PCS', location: 'Storage Room' },
      { centreId: centre.id, name: 'Fire Extinguisher', category: 'SAFETY', quantity: 10, unit: 'PCS', location: 'Corridors' },
      { centreId: centre.id, name: 'Desktop Computer', category: 'COMPUTERS', quantity: 30, unit: 'PCS', location: 'Computer Lab' },
      { centreId: centre.id, name: 'Projector', category: 'COMPUTERS', quantity: 3, unit: 'PCS', location: 'Classrooms' },
      { centreId: centre.id, name: 'Hand Tools Set', category: 'TOOLS', quantity: 25, unit: 'SET', location: 'Tool Room' },
    ];
    for (const item of inventory) {
      await prisma.inventoryItem.upsert({
        where: { id: 'temp-' + centre.id + item.name },
        update: {},
        create: item,
      }).catch(() => {});
    }
  }

  // Create attendance records & alerts for each centre
  const allCentres = await prisma.centre.findMany();
  const sessions = ['MORNING', 'AFTERNOON'];
  const today = new Date();

  for (const centre of allCentres) {
    // Past 14 days of attendance
    for (let i = 0; i < 14; i++) {
      const recordDate = new Date(today);
      recordDate.setDate(recordDate.getDate() - i);
      recordDate.setHours(0, 0, 0, 0);

      for (const session of sessions) {
        const baseCount = Math.floor(centre.sanctionedCapacity * 0.7) + (i % 5) * 4;
        const detectedCount = i % 4 === 0 ? baseCount - 7 : baseCount - (i % 3);
        const discrepancy = Math.abs(baseCount - detectedCount);
        const status = discrepancy > 5 ? 'DISCREPANT' : discrepancy === 0 ? 'VERIFIED' : 'PENDING';

        await prisma.attendanceRecord.upsert({
          where: {
            centreId_date_session: {
              centreId: centre.id,
              date: recordDate,
              session,
            },
          },
          update: {
            recordedCount: baseCount,
            detectedCount,
            discrepancy,
            status,
            confidence: 0.91 + (i % 8) * 0.01,
          },
          create: {
            centreId: centre.id,
            date: recordDate,
            session,
            recordedCount: baseCount,
            detectedCount,
            discrepancy,
            status,
            confidence: 0.91 + (i % 8) * 0.01,
            submittedBy: admin.id,
          },
        }).catch(() => {});
      }
    }

    // Alerts
    const sampleAlerts = [
      {
        type: 'ATTENDANCE_DISCREPANCY',
        severity: 'CRITICAL',
        title: `Significant attendance mismatch at ${centre.name}`,
        message: 'Physical head count detected by AI was 12% lower than registered attendance for Morning batch.',
        status: 'OPEN',
        metadata: JSON.stringify({ recorded: 85, detected: 74, discrepancy: 11 }),
      },
      {
        type: 'CAMERA_OFFLINE',
        severity: 'HIGH',
        title: `Workshop Camera 1 offline at ${centre.code}`,
        message: 'No RTSP video frames received for over 15 minutes. Stream reconnection failed.',
        status: 'OPEN',
        metadata: JSON.stringify({ camera: 'Workshop Camera 1', streamStatus: 'DISCONNECTED' }),
      },
      {
        type: 'EQUIPMENT_MISSING',
        severity: 'MEDIUM',
        title: `Missing equipment detected at ${centre.code}`,
        message: '3 units of Safety Helmet not detected in designated storage zone.',
        status: 'ACKNOWLEDGED',
        metadata: JSON.stringify({ expected: 50, detected: 47, category: 'SAFETY' }),
      },
      {
        type: 'EQUIPMENT_NON_FUNCTIONAL',
        severity: 'LOW',
        title: `Maintenance inspection due for Lathe Machine`,
        message: 'Lathe Machine vibration threshold anomaly detected during operation cycle.',
        status: 'RESOLVED',
        resolvedBy: admin.id,
        resolvedAt: new Date(),
        metadata: JSON.stringify({ item: 'Lathe Machine', status: 'INSPECTED' }),
      },
    ];

    for (const alertData of sampleAlerts) {
      await prisma.alert.create({
        data: {
          centreId: centre.id,
          ...alertData,
        },
      }).catch(() => {});
    }

    // Infrastructure checks
    const centreItems = await prisma.inventoryItem.findMany({ where: { centreId: centre.id } });
    for (const item of centreItems.slice(0, 5)) {
      await prisma.infrastructureCheck.create({
        data: {
          centreId: centre.id,
          itemId: item.id,
          detected: true,
          operability: 'FUNCTIONAL',
          confidence: 0.94,
          personNearby: true,
          metadata: JSON.stringify({ boundingBox: [100, 150, 400, 450] }),
        },
      }).catch(() => {});
    }
  }

  // Create system config
  await prisma.systemConfig.upsert({
    where: { key: 'detection_thresholds' },
    update: {},
    create: {
      key: 'detection_thresholds',
      category: 'detection',
      value: JSON.stringify({
        personConfThreshold: 0.5,
        personIouThreshold: 0.45,
        equipmentConfThreshold: 0.4,
        attendanceDiscrepancyThreshold: 2,
        infrastructureCheckInterval: 300000,
      }),
      description: 'AI detection confidence thresholds',
    },
  });

  console.log('🌱 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
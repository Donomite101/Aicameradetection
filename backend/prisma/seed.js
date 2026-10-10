"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding database...');
    // Create admin user
    const adminPassword = await bcryptjs_1.default.hash('admin123', 12);
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
    const officerPassword = await bcryptjs_1.default.hash('officer123', 12);
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
        await prisma.camera.createMany({
            data: [
                { centreId: centre.id, name: 'Main Hall Camera 1', rtspUrl: 'rtsp://demo:demo@ipvmdemo.ivideon.com:554/cam1', isActive: true },
                { centreId: centre.id, name: 'Workshop Camera 1', rtspUrl: 'rtsp://demo:demo@ipvmdemo.ivideon.com:554/cam2', isActive: true },
                { centreId: centre.id, name: 'Entry/Exit Camera', rtspUrl: 'rtsp://demo:demo@ipvmdemo.ivideon.com:554/cam3', isActive: true },
            ],
            skipDuplicates: true,
        });
        // Add inventory
        await prisma.inventoryItem.createMany({
            data: [
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
            ],
            skipDuplicates: true,
        });
    }
    // Create system config
    await prisma.systemConfig.upsert({
        where: { key: 'detection_thresholds' },
        update: {},
        create: {
            key: 'detection_thresholds',
            category: 'detection',
            value: {
                personConfThreshold: 0.5,
                personIouThreshold: 0.45,
                equipmentConfThreshold: 0.4,
                attendanceDiscrepancyThreshold: 2,
                infrastructureCheckInterval: 300000,
            },
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
//# sourceMappingURL=seed.js.map
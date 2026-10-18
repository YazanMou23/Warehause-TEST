const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

async function main() {
  console.log('Connecting to PostgreSQL database...');
  // Initialize Prisma Client using adapter
  const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_bOWn6teXwE4d@ep-winter-lab-atjrsovz-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // 1. Check recent assignments
    console.log('\n--- 1. Testing PlanEmployee Query ---');
    const assignments = await prisma.planEmployee.findMany({
      take: 5,
      include: {
        employee: { select: { id: true, name: true, phone: true } },
        plan: { select: { id: true, date: true } },
      },
    });

    console.log(`Found ${assignments.length} assignments.`);
    if (assignments.length > 0) {
      const first = assignments[0];
      console.log('Sample assignment:', {
        planId: first.planId,
        employeeId: first.employeeId,
        employeeName: first.employee?.name,
        confirmationStatus: first.confirmationStatus,
        responseNote: first.responseNote,
      });

      // 2. Test status update simulation
      console.log('\n--- 2. Simulating Status Update (Confirmation) ---');
      const updated = await prisma.planEmployee.update({
        where: {
          planId_employeeId: {
            planId: first.planId,
            employeeId: first.employeeId,
          },
        },
        data: {
          confirmationStatus: 'CONFIRMED',
          responseNote: 'Zugesagt („Ich bin da“)',
          respondedAt: new Date(),
          responseChannel: 'WHATSAPP_BUTTON',
        },
      });

      console.log('Successfully updated assignment:', {
        status: updated.confirmationStatus,
        note: updated.responseNote,
        respondedAt: updated.respondedAt,
      });

      // Reset to PENDING for cleanliness
      await prisma.planEmployee.update({
        where: {
          planId_employeeId: {
            planId: first.planId,
            employeeId: first.employeeId,
          },
        },
        data: {
          confirmationStatus: 'PENDING',
          responseNote: null,
          respondedAt: null,
          responseChannel: null,
        },
      });
      console.log('Reset assignment back to PENDING.');
    }

    console.log('\n✅ All backend model and database operations succeeded!');
  } catch (err) {
    console.error('❌ Error during test:', err);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();

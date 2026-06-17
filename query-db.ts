import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function run() {
  console.log("=== Querying Database Plans ===");
  const plans = await prisma.plan.findMany({
    include: {
      warehouse: { select: { name: true } },
      hall: { select: { name: true } },
      assignedEmployees: { include: { employee: { select: { name: true } } } },
      assignedContainers: { include: { container: { select: { containerNumber: true } } } },
    }
  });
  console.log("Total Plans:", plans.length);
  console.log(JSON.stringify(plans, null, 2));

  console.log("\n=== Querying Action Logs ===");
  const logs = await prisma.actionLog.findMany({
    take: 10,
    orderBy: { timestamp: 'desc' }
  });
  console.log(JSON.stringify(logs, null, 2));

  await prisma.$disconnect();
  await pool.end();
}

run().catch(console.error);

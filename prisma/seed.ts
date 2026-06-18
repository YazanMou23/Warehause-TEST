import { PrismaClient, Role, ContainerStatus } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting seeding database...');

  // 1. Clean up existing data (optional, but good for idempotent seeds)
  // Disable foreign keys check or delete in reverse order of dependencies
  await prisma.actionLog.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.planEmployee.deleteMany({});
  await prisma.planContainer.deleteMany({});
  await prisma.plan.deleteMany({});
  await prisma.container.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.hall.deleteMany({});
  await prisma.warehouse.deleteMany({});

  console.log('Cleared existing data.');

  // 2. Create Warehouses (6 warehouses)
  const warehouseNames = [
    'Duisburg',
    'Wesel',
    'Gelsenkirchen',
    'Hückelhoven',
    'Essen',
    'Düsseldorf',
  ];

  const warehouses = [];
  for (const name of warehouseNames) {
    const wh = await prisma.warehouse.create({
      data: { name },
    });
    warehouses.push(wh);
    console.log(`Created warehouse: ${wh.name}`);
  }

  // 3. Create Halls (2 halls per warehouse = 12 halls)
  const halls = [];
  for (const wh of warehouses) {
    for (const hallLetter of ['A', 'B']) {
      const hall = await prisma.hall.create({
        data: {
          name: `Hall ${hallLetter}`,
          warehouseId: wh.id,
          capacity: 100, // capacity of 100 containers
        },
      });
      halls.push(hall);
      console.log(`Created hall ${hall.name} in warehouse ${wh.name}`);
    }
  }

  // 4. Create Users (Manager, Admin, Employees)
  const managerPasswordHash = await bcrypt.hash('managerpassword', 10);
  const adminPasswordHash = await bcrypt.hash('adminpassword', 10);
  const employeePasswordHash = await bcrypt.hash('employeepassword', 10);

  // Manager Lars Leader
  const manager1 = await prisma.user.create({
    data: {
      username: 'manager',
      name: 'Lars Leader',
      phone: '+491702222222',
      passwordHash: managerPasswordHash,
      role: Role.MANAGER,
      warehouseId: warehouses[0].id, // Duisburg
      isActive: true,
    },
  });

  // Manager Lena Leader
  const manager2 = await prisma.user.create({
    data: {
      username: 'manager2',
      name: 'Lena Leader',
      phone: '+491703333333',
      passwordHash: managerPasswordHash,
      role: Role.MANAGER,
      warehouseId: warehouses[1].id, // Wesel
      isActive: true,
    },
  });
  console.log(`Created Managers: ${manager1.name}, ${manager2.name}`);

  // Admin
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      name: 'Admin User',
      phone: '+491701111111',
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });
  console.log(`Created Admin: ${admin.name}`);

  // Employees (5 employees)
  const employees = [];
  const employeeData = [
    { username: 'employee1', name: 'Emil Employee', phone: '+491704444444', whIndex: 0, hallIndex: 0, telegramId: '123456789' },
    { username: 'employee2', name: 'Elsa Employee', phone: '+491705555555', whIndex: 0, hallIndex: 1, telegramId: '987654321' },
    { username: 'employee3', name: 'Erik Employee', phone: '+491706666666', whIndex: 1, hallIndex: 2, telegramId: '555666777' },
    { username: 'employee4', name: 'Eva Employee',  phone: '+491707777777', whIndex: 1, hallIndex: 3, telegramId: '111222333' },
    { username: 'employee5', name: 'Egon Employee', phone: '+491708888888', whIndex: 2, hallIndex: 4, telegramId: null },
  ];

  for (const emp of employeeData) {
    const createdEmp = await prisma.user.create({
      data: {
        username: emp.username,
        name: emp.name,
        phone: emp.phone,
        passwordHash: employeePasswordHash,
        role: Role.EMPLOYEE,
        warehouseId: warehouses[emp.whIndex].id,
        hallId: halls[emp.hallIndex].id,
        telegramId: emp.telegramId,
        isActive: true,
      },
    });
    employees.push(createdEmp);
    console.log(`Created Employee: ${createdEmp.name}`);
  }

  // 5. Create Sample Containers (6 containers)
  const containerNumbers = [
    'MSCU4829104',
    'HLXU9283748',
    'CMAU1029482',
    'OOCU8372649',
    'HLCU7384920',
    'COSU9284710',
  ];

  for (let i = 0; i < containerNumbers.length; i++) {
    const container = await prisma.container.create({
      data: {
        containerNumber: containerNumbers[i],
        status: i % 2 === 0 ? ContainerStatus.FULL : ContainerStatus.EMPTY,
        warehouseId: warehouses[i % 3].id, // assigned across first 3 warehouses
        hallId: halls[i % 6].id,            // assigned across first 6 halls
        arrivalDate: new Date(Date.now() - i * 24 * 60 * 60 * 1000), // arravial dates spaced out
      },
    });
    console.log(`Created container ${container.containerNumber} in warehouse ${container.warehouseId}`);
  }

  console.log('Seeding database completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

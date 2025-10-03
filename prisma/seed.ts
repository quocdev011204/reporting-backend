/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.createMany({
    data: [
      { username: 'manager', password: 'hashed_password', role: 'manager' },
      { username: 'employee1', password: 'hashed_password', role: 'employee' },
    ],
  });
  await prisma.task.create({
    data: {
      title: 'Test Task',
      description: 'Demo assignment',
      assignedToId: 2,
      status: 'pending',
      estimatedTime: 4.0,
    },
  });
  await prisma.timeLog.create({
    data: {
      taskId: 1,
      userId: 2,
      startTime: new Date('2025-10-03T10:00:00'),
      endTime: new Date('2025-10-03T12:00:00'),
      duration: 2.0,
    },
  });
  await prisma.report.create({
    data: {
      title: 'Productivity Report',
      userId: 2,
      taskId: 1,
      value: 85.0,
      insights: 'Placeholder from n8n AI',
      totalHours: 2.0,
    },
  });
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());

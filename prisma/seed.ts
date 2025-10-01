import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.report.createMany({
    data: [
      { title: 'Sales Q1', value: 1500.5 },
      { title: 'Sales Q2', value: 2300.0 },
    ],
  });
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());

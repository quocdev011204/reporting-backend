/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-misused-promises */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seeding...');

  // 1. Xóa dữ liệu cũ (Clean up) theo thứ tự để tránh lỗi khóa ngoại
  // Xóa bảng con trước, bảng cha sau
  await prisma.alert.deleteMany();
  await prisma.timeLog.deleteMany();
  await prisma.report.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  console.log('🗑️  Cleaned up old data.');

  // 2. Tạo Users
  const hashedPassword = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@company.com',
      password: hashedPassword,
      name: 'Nguyen Van Admin',
      role: 'ADMIN',
      skills: ['Management', 'Scrum Master'],
      availability: { monday: '9-17', friday: '9-17' },
    },
  });

  const dev1 = await prisma.user.create({
    data: {
      username: 'dev_frontend',
      email: 'dev1@company.com',
      password: hashedPassword,
      name: 'Tran Frontend',
      role: 'DEVELOPER',
      skills: ['React', 'Vue', 'TypeScript'],
      jiraUserId: 'jira_dev_01',
      slackUserId: 'slack_dev_01',
    },
  });

  const dev2 = await prisma.user.create({
    data: {
      username: 'dev_backend',
      email: 'dev2@company.com',
      password: hashedPassword,
      name: 'Le Backend',
      role: 'DEVELOPER',
      skills: ['NestJS', 'PostgreSQL', 'Docker'],
      jiraUserId: 'jira_dev_02',
      slackUserId: 'slack_dev_02',
    },
  });

  console.log('👤 Created Users');

  // 3. Tạo Projects
  const projectWeb = await prisma.project.create({
    data: {
      name: 'E-commerce Website Redesign',
      description: 'Làm lại giao diện trang bán hàng sử dụng Next.js',
      status: 'In Progress',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-06-30'),
      predictedDelay: 0,
    },
  });

  const projectMobile = await prisma.project.create({
    data: {
      name: 'Customer Loyalty App',
      description: 'App tích điểm cho khách hàng trên iOS và Android',
      status: 'Planning',
      startDate: new Date('2025-02-15'),
      predictedDelay: 5, // Dự đoán trễ 5 ngày
    },
  });

  console.log('xx Created Projects');

  // 4. Tạo Tasks
  // Task 1: Web - Backend Setup (Done)
  const task1 = await prisma.task.create({
    data: {
      title: 'Setup NestJS Architecture',
      description: 'Cài đặt base project, config Prisma, Docker',
      projectId: projectWeb.id,
      assignedToId: dev2.id,
      status: 'Done',
      priority: 'High',
      estimatedTime: 8,
      actualTime: 7,
      jiraIssueId: 'WEB-101',
    },
  });

  // Task 2: Web - Frontend Home (In Progress)
  const task2 = await prisma.task.create({
    data: {
      title: 'Design Homepage UI',
      projectId: projectWeb.id,
      assignedToId: dev1.id,
      status: 'In Progress',
      priority: 'Medium',
      estimatedTime: 16,
      jiraIssueId: 'WEB-102',
    },
  });

  // Task 3: Mobile - Requirement (Pending)
  const task3 = await prisma.task.create({
    data: {
      title: 'Gather Requirements',
      projectId: projectMobile.id,
      assignedToId: admin.id,
      status: 'Pending',
      priority: 'Critical',
      estimatedTime: 40,
    },
  });

  console.log('✅ Created Tasks');

  // 5. Tạo TimeLogs (Log thời gian làm việc)
  await prisma.timeLog.create({
    data: {
      taskId: task1.id,
      userId: dev2.id,
      startTime: new Date('2025-01-02T08:00:00Z'),
      endTime: new Date('2025-01-02T12:00:00Z'),
      duration: 4,
      notes: 'Initial setup for repository',
    },
  });

  await prisma.timeLog.create({
    data: {
      taskId: task1.id,
      userId: dev2.id,
      startTime: new Date('2025-01-03T13:00:00Z'),
      endTime: new Date('2025-01-03T16:00:00Z'),
      duration: 3,
      notes: 'Docker configuration',
    },
  });

  console.log('⏱️  Created TimeLogs');

  // 6. Tạo Reports
  const report1 = await prisma.report.create({
    data: {
      title: 'Weekly Progress - Jan Week 1',
      projectId: projectWeb.id,
      userId: admin.id,
      type: 'Weekly',
      value: 85, // 85% tiến độ
      data: {
        completedTasks: 5,
        pendingTasks: 2,
        blockers: ['Waiting for API specs'],
      },
    },
  });

  console.log('📊 Created Reports');

  // 7. Tạo Alerts
  await prisma.alert.create({
    data: {
      taskId: task2.id,
      message: 'Task is overdue based on estimated time',
      status: 'Active',
      sentTo: ['admin@company.com', 'dev1@company.com'],
    },
  });

  await prisma.alert.create({
    data: {
      reportId: report1.id,
      message: 'Report generated successfully',
      status: 'Resolved',
    },
  });

  console.log('🔔 Created Alerts');
  console.log('🚀 Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
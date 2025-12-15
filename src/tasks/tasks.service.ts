import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';
import { Task } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  
  async createTasks(tasks: any[]) {
    const emails = tasks
      .map(t => t.member_mail)
      .filter(Boolean);

    // 2️⃣ Query users 1 lần
    const users = await this.prisma.user.findMany({
      where: {
        email: { in: emails },
      },
    });

    // 3️⃣ Map email -> userId
    const userMap = new Map(
      users.map(u => [u.email, u.id]),
    );

    // 4️⃣ Chuẩn bị data tasks
    const taskData = tasks.map(task => ({
      projectId: task.project_id,
      title: task.task_name,
      description: task.task_description,
      estimatedTime: task.estimated_time,
      priority: task.priority,
      status: 'To Do',
      jiraIssueId: null,
      assignedToId: userMap.get(task.member_mail) ?? null,
    }));

    // 5️⃣ Insert trong transaction
    const createdTasks = await this.prisma.$transaction(
      taskData.map(data =>
        this.prisma.task.create({ data }),
      ),
    );

    return {
      count: createdTasks.length,
      tasks: createdTasks,
    };
  }

  async updateStatus(taskId: number, status: string): Promise<Task> {
    return await this.prisma.task.update({
      where: { id: taskId },
      data: { status },
    });
  }

  async getAssignedTasks(userId: number): Promise<Task[]> {
    return await this.prisma.task.findMany({
      where: { assignedToId: userId },
    });
  }

  async getTaskById(id: number): Promise<Task | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }

  // Auto-assign sẽ được gọi từ n8n (backend chỉ cung cấp dữ liệu)
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';
import { Task } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async createTask(
    title: string,
    description: string,
    estimatedTime: number,
  ): Promise<Task> {
    return await this.prisma.task.create({
      data: { title, description, estimatedTime, status: 'pending' },
    });
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

  // Auto-assign sẽ được gọi từ n8n (backend chỉ cung cấp dữ liệu)
}

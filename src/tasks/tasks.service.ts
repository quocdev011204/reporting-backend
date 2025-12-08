import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';
import { Prisma, Task } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async createTask(data: Prisma.TaskUncheckedCreateInput): Promise<Task> {
    return await this.prisma.task.create({
      data: {
        ...data,
        status: data.status || 'pending',
      },
    });
  }

  async updateTask(id: number, data: Prisma.TaskUpdateInput): Promise<Task> {
    return await this.prisma.task.update({
      where: { id },
      data,
    });
  }

  async getAssignedTasks(userId: number): Promise<Task[]> {
    return await this.prisma.task.findMany({
      where: { assignedToId: userId },
      include: {
        project: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getTaskById(id: number): Promise<Task | null> {
    return this.prisma.task.findUnique({
      where: { id },
      include: {
        project: true,
        assignedTo: true,
      },
    });
  }

  async getTasksByProject(projectId: number): Promise<Task[]> {
    return await this.prisma.task.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteTask(id: number): Promise<Task> {
    return await this.prisma.task.delete({
      where: { id },
    });
  }
}

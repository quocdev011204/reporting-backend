import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';
import { Task } from '@prisma/client';
import { WorkflowService } from '../workflow/workflow.service';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WorkflowService))
    private workflowService: WorkflowService,
  ) {}

  async createTasks(tasks: any[]) {
    const emails = tasks.map((t) => t.member_mail).filter(Boolean);

    // 2️⃣ Query users 1 lần
    const users = await this.prisma.user.findMany({
      where: {
        email: { in: emails },
      },
    });

    // 3️⃣ Map email -> userId
    const userMap = new Map(users.map((u) => [u.email, u.id]));

    // 4️⃣ Chuẩn bị data tasks
    const taskData = tasks.map((task) => ({
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
      taskData.map((data) => this.prisma.task.create({ data })),
    );

    return {
      count: createdTasks.length,
      tasks: createdTasks,
    };
  }

  async updateStatus(taskId: number, status: string): Promise<Task> {
    // Update task status in database
    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: { status },
      include: {
        project: true,
      },
    });

    // If task has Jira issue ID, sync status to Jira
    if (updatedTask.jiraIssueId) {
      try {
        await this.workflowService.updateJiraIssueStatus(
          updatedTask.jiraIssueId,
          status,
        );
        console.log(`✅ Updated Jira issue ${updatedTask.jiraIssueId} status to ${status}`);
      } catch (error: any) {
        console.error(`❌ Failed to update Jira issue ${updatedTask.jiraIssueId}:`, error.message);
        // Don't throw error - continue even if Jira update fails
      }
    }

    return updatedTask;
  }

  async getAssignedTasks(userId: number): Promise<Task[]> {
    return await this.prisma.task.findMany({
      where: { assignedToId: userId },
    });
  }

  async getTaskById(id: number): Promise<Task | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }

  async getAllTasks() {
    return this.prisma.task.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  // Auto-assign sẽ được gọi từ n8n (backend chỉ cung cấp dữ liệu)
}

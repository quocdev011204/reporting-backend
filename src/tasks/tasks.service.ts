import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';
import { Task } from '@prisma/client';
// import { WorkflowService } from '../workflow/workflow.service'; // Removed Jira integration

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    // @Inject(forwardRef(() => WorkflowService)) // Removed Jira integration
    // private workflowService: WorkflowService, // Removed Jira integration
  ) { }

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
      status: 'TO DO',
      predictedDelay: task.task_deadline ? new Date(task.task_deadline) : null,
      jiraIssueId: null,
      assignedToId: userMap.get(task.member_mail) ?? null,
    }));

    // 5️⃣ Insert trong transaction
    const createdTasks = await this.prisma.$transaction(
      taskData.map((data) => this.prisma.task.create({ data })),
    );

    return createdTasks;
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

    // Jira integration removed
    //     // If task has Jira issue ID, sync status to Jira
    //     if (updatedTask.jiraIssueId) {
    //       try {
    //         await this.workflowService.updateJiraIssueStatus(
    //           updatedTask.jiraIssueId,
    //           status,
    //         );
    //         console.log(`✅ Updated Jira issue ${updatedTask.jiraIssueId} status to ${status}`);
    //       } catch (error: any) {
    //         console.error(`❌ Failed to update Jira issue ${updatedTask.jiraIssueId}:`, error.message);
    //         // Don't throw error - continue even if Jira update fails
    //       }
    //     }

    return updatedTask;
  }

  // updateJiraIssue method removed (Jira integration)
  // async updateJiraIssue(taskId: number, jiraIssueId: string): Promise<Task> {
  //   return this.prisma.task.update({
  //     where: { id: taskId },
  //     data: {
  //       jiraIssueId,
  //     },
  //   });
  // }

  async getAssignedTasks(userId: number): Promise<Task[]> {
    return await this.prisma.task.findMany({
      where: { assignedToId: userId },
    });
  }

  async getTaskById(id: number): Promise<Task | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }

  // updateJiraIssueIdAndSync method removed (Jira integration)
  // 
  //   async updateJiraIssueIdAndSync(taskId: number, jiraIssueId: string): Promise<Task> {
  //     try {
  //       // 1. Lấy thông tin từ Jira
  //       const jiraIssue = await this.workflowService.getJiraStatus({
  //         issueKey: jiraIssueId,
  //       });
  // 
  //       if (!jiraIssue || !jiraIssue.issueKey) {
  //         throw new Error(`Jira issue ${jiraIssueId} not found`);
  //       }
  // 
  //       // 2. Lấy task hiện tại
  //       const currentTask = await this.prisma.task.findUnique({
  //         where: { id: taskId },
  //         include: {
  //           project: true,
  //         },
  //       });
  // 
  //       if (!currentTask) {
  //         throw new Error(`Task ${taskId} not found`);
  //       }
  // 
  //       // 3. Map assignee từ Jira sang userId trong DB
  //       let assignedToId: number | null = currentTask.assignedToId;
  // 
  //       if (jiraIssue.assignee) {
  //         // Tìm user theo email từ Jira
  //         if (jiraIssue.assignee.email) {
  //           const user = await this.prisma.user.findFirst({
  //             where: { email: jiraIssue.assignee.email },
  //           });
  //           if (user) {
  //             assignedToId = user.id;
  //           }
  //         }
  //         // Nếu không tìm thấy theo email, thử tìm theo accountId (jiraUserId)
  //         if (!assignedToId && jiraIssue.assignee.accountId) {
  //           const user = await this.prisma.user.findFirst({
  //             where: { jiraUserId: jiraIssue.assignee.accountId },
  //           });
  //           if (user) {
  //             assignedToId = user.id;
  //           }
  //         }
  //       }
  // 
  //       // 4. Map status từ Jira
  //       const jiraStatus = jiraIssue.status || currentTask.status;
  // 
  //       // Map Jira status to DB status
  //       const statusMap: Record<string, string> = {
  //         'To Do': 'To Do',
  //         'In Progress': 'In Progress',
  //         'In Review': 'Review',
  //         'Review': 'Review',
  //         'Done': 'Done',
  //         'Resolved': 'Done',
  //         'Closed': 'Done',
  //       };
  //       const mappedStatus = statusMap[jiraStatus] || jiraStatus;
  // 
  //       // 5. Map priority từ Jira
  //       const jiraPriority = jiraIssue.priority || currentTask.priority;
  // 
  //       // 6. Update jiraIssueId trước bằng method updateJiraIssue
  //       await this.updateJiraIssue(taskId, jiraIssueId);
  // 
  //       // 7. Update các thông tin khác từ Jira
  //       const updatedTask = await this.prisma.task.update({
  //         where: { id: taskId },
  //         data: {
  //           title: jiraIssue.summary || currentTask.title,
  //           description: jiraIssue.description || currentTask.description,
  //           status: mappedStatus,
  //           priority: jiraPriority,
  //           assignedToId: assignedToId,
  //         },
  //         include: {
  //           project: true,
  //           assignedTo: {
  //             select: {
  //               id: true,
  //               username: true,
  //               name: true,
  //               email: true,
  //             },
  //           },
  //         },
  //       });
  // 
  //       console.log(`✅ Updated task ${taskId} with Jira issue ${jiraIssueId}`);
  //       console.log(`   Status: ${mappedStatus}, Priority: ${jiraPriority}, AssignedTo: ${assignedToId}`);
  // 
  //       return updatedTask;
  //     } catch (error: any) {
  //       console.error(`❌ Failed to update task ${taskId} with Jira issue:`, error.message);
  //     }
  //   }
  // }

  async createTask(data: {
    projectId: number;
    title: string;
    description?: string;
    priority?: string;
    status?: string;
    estimatedTime?: number;
    assignedToId?: number;
    predictedDelay?: string | Date | null;
  }): Promise<Task> {
    return this.prisma.task.create({
      data: {
        projectId: data.projectId,
        title: data.title,
        description: data.description || '',
        priority: data.priority || 'medium',
        status: data.status || 'To Do',
        estimatedTime: data.estimatedTime || 0,
        assignedToId: data.assignedToId || null,
        predictedDelay: data.predictedDelay ? new Date(data.predictedDelay) : null,
      },
      include: {
        project: true,
        assignedTo: true,
      },
    });
  }

  async updateTask(
    taskId: number,
    data: {
      title?: string;
      description?: string;
      priority?: string;
      status?: string;
      estimatedTime?: number;
      assignedToId?: number;
      predictedDelay?: string | Date | null;
    },
  ): Promise<Task> {
    const updateData: any = { ...data };
    if (data.predictedDelay !== undefined) {
      updateData.predictedDelay = data.predictedDelay ? new Date(data.predictedDelay) : null;
    }
    return this.prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        project: true,
        assignedTo: true,
      },
    });
  }

  async deleteTask(taskId: number): Promise<Task> {
    return this.prisma.task.delete({
      where: { id: taskId },
    });
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

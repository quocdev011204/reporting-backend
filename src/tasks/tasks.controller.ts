import {
  Controller,
  Post,
  Put,
  Patch,
  Get,
  Body,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Task } from '@prisma/client';
import { Public } from '../auth/public.decorator';

@Controller('tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Public()
  @Post('create')
  async createTasksFromN8n(@Body() body: any) {
    const tasks = Array.isArray(body) ? body : body[0];
    return this.tasksService.createTasks(tasks);
  }

  @Public()
  @Get()
  async getAllTasks() {
    return this.tasksService.getAllTasks();
  }

  @Public()
  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
  ): Promise<Task> {
    const status = body.status
    if (!status) {
      throw new Error('Status is required')
    }
    return this.tasksService.updateStatus(Number(id), status);
  }

  @Public()
  @Put('jira-issue-id')
  async updateJiraIssueId(
    @Body() body: { 
      id?: number; 
      task_id?: number;
      jira_issue_id?: string;
      jiraIssueKey?: string;
    },
  ): Promise<Task> {
    // Hỗ trợ cả task_id và id trong body
    const taskId = body.task_id || body.id
    
    // Hỗ trợ cả jiraIssueKey và jira_issue_id trong body
    const jiraIssueId = body.jiraIssueKey || body.jira_issue_id
    
    if (!taskId) {
      throw new Error('task_id hoặc id is required')
    }
    
    if (!jiraIssueId) {
      throw new Error('jiraIssueKey hoặc jira_issue_id is required')
    }
    
    return this.tasksService.updateJiraIssueIdAndSync(Number(taskId), jiraIssueId);
  }

  @Public()
  @Patch('jira')
  async updateJiraIssue(
    @Body()
    body: {
      task_id?: number | string;
      jira_issue_id?: string;
    },
  ): Promise<Task> {
    // Hỗ trợ cả string và number cho task_id
    const taskId = body.task_id ? Number(body.task_id) : null;
    const jiraIssueId = body.jira_issue_id;

    if (!taskId || isNaN(taskId)) {
      throw new HttpException(
        'task_id is required and must be a valid number',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!jiraIssueId) {
      throw new HttpException(
        'jira_issue_id is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.tasksService.updateJiraIssue(taskId, jiraIssueId);
    } catch (error: any) {
      // Nếu task không tồn tại, Prisma sẽ throw error
      if (error.code === 'P2025') {
        throw new HttpException(
          `Task with id ${taskId} not found`,
          HttpStatus.NOT_FOUND,
        );
      }
      // Log error để debug
      console.error('Error updating Jira issue:', error);
      throw new HttpException(
        error.message || 'Failed to update Jira issue',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('assigned-to/:userId')
  @UseGuards(JwtAuthGuard)
  async getAssigned(@Param('userId') userId: string): Promise<Task[]> {
    return this.tasksService.getAssignedTasks(Number(userId));
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  // async create(
  //   @Body() body: { title: string; description: string; estimatedTime: number },
  // ): Promise<Task> {
  //   return this.tasksService.createTask(
  //     body.title,
  //     body.description,
  //     body.estimatedTime,
  //   );
  // }

  // Route này phải đặt cuối cùng để tránh conflict với các route cụ thể
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getTaskById(@Param('id') id: string): Promise<Task | null> {
    return this.tasksService.getTaskById(Number(id));
  }
}

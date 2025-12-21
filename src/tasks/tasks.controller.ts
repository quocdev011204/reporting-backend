import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  Param,
  UseGuards,
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

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getTaskById(@Param('id') id: string): Promise<Task | null> {
    return this.tasksService.getTaskById(Number(id));
  }
}

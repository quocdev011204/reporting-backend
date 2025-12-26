import {
  Controller,
  Post,
  Put,
  Patch,
  Get,
  Delete,
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
  constructor(private tasksService: TasksService) { }

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

  @Get('assigned-to/:userId')
  @UseGuards(JwtAuthGuard)
  async getAssigned(@Param('userId') userId: string): Promise<Task[]> {
    return this.tasksService.getAssignedTasks(Number(userId));
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() body: {
      projectId: number;
      title: string;
      description?: string;
      priority?: string;
      status?: string;
      estimatedTime?: number;
      assignedToId?: number;
    },
  ): Promise<Task> {
    return this.tasksService.createTask(body);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateTask(
    @Param('id') id: string,
    @Body() body: {
      title?: string;
      description?: string;
      priority?: string;
      status?: string;
      estimatedTime?: number;
      assignedToId?: number;
    },
  ): Promise<Task> {
    return this.tasksService.updateTask(Number(id), body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteTask(@Param('id') id: string): Promise<Task> {
    return this.tasksService.deleteTask(Number(id));
  }

  @Public()
  @Get(':id')
  async getTaskById(@Param('id') id: string): Promise<Task | null> {
    return this.tasksService.getTaskById(Number(id));
  }
}

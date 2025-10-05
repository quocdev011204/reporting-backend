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

@Controller('tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() body: { title: string; description: string; estimatedTime: number },
  ): Promise<Task> {
    return this.tasksService.createTask(
      body.title,
      body.description,
      body.estimatedTime,
    );
  }

  @Put(':id/status')
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ): Promise<Task> {
    return this.tasksService.updateStatus(Number(id), status);
  }

  @Get('assigned-to/:userId')
  @UseGuards(JwtAuthGuard)
  async getAssigned(@Param('userId') userId: string): Promise<Task[]> {
    return this.tasksService.getAssignedTasks(Number(userId));
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getTaskById(@Param('id') id: string): Promise<Task | null> {
    return this.tasksService.getTaskById(Number(id));
  }
}

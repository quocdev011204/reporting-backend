import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Delete,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Prisma, Task } from '@prisma/client';

@Controller('tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createTaskDto: Prisma.TaskUncheckedCreateInput,
  ): Promise<Task> {
    return this.tasksService.createTask(createTaskDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTaskDto: Prisma.TaskUpdateInput,
  ): Promise<Task> {
    return this.tasksService.updateTask(id, updateTaskDto);
  }

  @Get('assigned-to/:userId')
  @UseGuards(JwtAuthGuard)
  async getAssigned(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<Task[]> {
    return this.tasksService.getAssignedTasks(userId);
  }

  @Get('project/:projectId')
  @UseGuards(JwtAuthGuard)
  async getByProject(
    @Param('projectId', ParseIntPipe) projectId: number,
  ): Promise<Task[]> {
    return this.tasksService.getTasksByProject(projectId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getTaskById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Task | null> {
    return this.tasksService.getTaskById(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteTask(@Param('id', ParseIntPipe) id: number): Promise<Task> {
    return this.tasksService.deleteTask(id);
  }
}

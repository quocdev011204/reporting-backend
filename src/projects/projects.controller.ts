import { Body, Controller, Post, Get, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Public()
  @Post()
  async createProject(@Body() body: any) {
    const data = Array.isArray(body) ? body[0] : body;
    return this.projectsService.createFromN8n(data);
  }

  @Public()
  @Get()
  async getAllProjects() {
    return this.projectsService.getAllProjects();
  }
}

import { Body, Controller, Post, Get, Put, Delete, Param, UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) { }

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

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async updateProject(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; status?: string; predictedDelay?: string | Date | null }
  ) {
    return this.projectsService.updateProject(Number(id), body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteProject(@Param('id') id: string) {
    return this.projectsService.deleteProject(Number(id));
  }
}

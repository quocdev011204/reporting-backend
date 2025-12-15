import { Body, Controller, Post } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Public()
  @Post()
  async createProject(@Body() body: any) {
    const data = Array.isArray(body) ? body[0] : body;
    return this.projectsService.createFromN8n(data);
  }


  
}


import { Module } from '@nestjs/common';
import { ProjectsService } from './project.service';
import { ProjectsController } from './project.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}

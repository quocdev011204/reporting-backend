import { Module, forwardRef } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PrismaService } from 'src/services/prisma.service';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [PrismaModule, forwardRef(() => WorkflowModule)],
  controllers: [TasksController],
  providers: [TasksService, PrismaService],
  exports: [TasksService],
})
export class TasksModule {}

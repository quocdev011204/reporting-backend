import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { KpiModule } from '../kpi/kpi.module';
import { ChartsModule } from '../charts/charts.module';

@Module({
  imports: [PrismaModule, KpiModule, ChartsModule],
  providers: [WorkflowService],
  controllers: [WorkflowController],
  exports: [WorkflowService],
})
export class WorkflowModule {}

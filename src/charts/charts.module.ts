import { Module } from '@nestjs/common';
import { ChartsService } from './charts.service';
import { ChartsController } from './charts.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ChartsService],
  controllers: [ChartsController],
  exports: [ChartsService],
})
export class ChartsModule {}

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './services/prisma.service';
import { ReportsModule } from './reports/reports.module';
import { AuthModule } from './auth/auth.module';
import { AthService } from './ath/ath.service';

@Module({
  imports: [ReportsModule, AuthModule],
  controllers: [AppController],
  providers: [AppService, PrismaService, AthService],
})
export class AppModule {}

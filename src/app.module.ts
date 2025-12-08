import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { PrismaService } from './services/prisma.service';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { TasksModule } from './tasks/tasks.module';
import { TimeLogsModule } from './time-logs/time-logs.module';
import { ProductivityModule } from './productivity/productivity.module';
import { ProjectsModule } from './project/project.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ReportsModule,
    UsersModule,
    AuthModule,
    TasksModule,
    TimeLogsModule,
    ProductivityModule,
    ProjectsModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}

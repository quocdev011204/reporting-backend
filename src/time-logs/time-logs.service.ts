import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';
@Injectable()
export class TimeLogsService {
  constructor(private prisma: PrismaService) {}

  async logTime(
    taskId: number,
    userId: number,
    startTime: string,
    endTime: string,
  ) {
    const sTime = new Date(startTime);
    const eTime = new Date(endTime);
    const duration = (eTime.getTime() - sTime.getTime()) / 3600000;
    return this.prisma.timeLog.create({
      data: { taskId, userId, startTime: sTime, endTime: eTime, duration },
    });
  }

  async getTotalTime(taskId: number) {
    const logs = await this.prisma.timeLog.findMany({ where: { taskId } });
    return logs.reduce((total, log) => total + (log.duration || 0), 0);
  }

  async getUserTimeLogs(
    userId: number,
    dateRange: { start: string; end: string },
  ) {
    return this.prisma.timeLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: new Date(dateRange.start),
          lte: new Date(dateRange.end),
        },
      },
    });
  }
}

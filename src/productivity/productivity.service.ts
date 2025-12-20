import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';

@Injectable()
export class ProductivityService {
  constructor(private prisma: PrismaService) {}

  async generateBasicReport(
    userId: number,
    dateRange: { start: string; end: string },
  ) {
    const logs = await this.prisma.timeLog.findMany({
      where: {
        userId,
        createdAt: {
          gte: new Date(dateRange.start),
          lte: new Date(dateRange.end),
        },
      },
    });
    const totalHours = logs.reduce(
      (t: number, l: { duration: number | null }) => t + (l.duration || 0),
      0,
    );
    const completedTasks = await this.prisma.task.count({
      where: { assignedToId: userId, status: 'completed' },
    });
    const efficiency = totalHours > 0 ? (completedTasks / totalHours) * 100 : 0; // Simple metric
    return { totalHours, completedTasks, efficiency };
  }

  // n8n sẽ gọi endpoint này, analyze AI, rồi callback to update report with insights
}

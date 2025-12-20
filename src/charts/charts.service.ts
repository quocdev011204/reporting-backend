import { Injectable } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';

@Injectable()
export class ChartsService {
  constructor(private prisma: PrismaService) {}

  async prepareChartData() {
    // Chuẩn bị dữ liệu cho biểu đồ KPI
    const [tasksByStatus, tasksByPriority, projectsByStatus, tasksOverTime] =
      await Promise.all([
        this.prisma.task.groupBy({
          by: ['status'],
          _count: { status: true },
        }),
        this.prisma.task.groupBy({
          by: ['priority'],
          _count: { priority: true },
        }),
        this.prisma.project.groupBy({
          by: ['status'],
          _count: { status: true },
        }),
        this.prisma.task.findMany({
          select: {
            createdAt: true,
            status: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        }),
      ]);

    // Format dữ liệu cho biểu đồ
    const statusChartData = {
      labels: tasksByStatus.map((t) => t.status || 'Unknown'),
      datasets: [
        {
          label: 'Tasks by Status',
          data: tasksByStatus.map((t) => t._count.status),
          backgroundColor: [
            '#FF6384',
            '#36A2EB',
            '#FFCE56',
            '#4BC0C0',
            '#9966FF',
            '#FF9F40',
          ],
        },
      ],
    };

    const priorityChartData = {
      labels: tasksByPriority.map((p) => p.priority || 'Unknown'),
      datasets: [
        {
          label: 'Tasks by Priority',
          data: tasksByPriority.map((p) => p._count.priority),
          backgroundColor: ['#FF6384', '#FFCE56', '#36A2EB'],
        },
      ],
    };

    const projectsChartData = {
      labels: projectsByStatus.map((p) => p.status || 'Unknown'),
      datasets: [
        {
          label: 'Projects by Status',
          data: projectsByStatus.map((p) => p._count.status),
          backgroundColor: ['#4BC0C0', '#9966FF', '#FF9F40'],
        },
      ],
    };

    // Tính toán tasks over time (theo tuần)
    const tasksByWeek = this.groupTasksByWeek(tasksOverTime);

    return {
      tasksByStatus: statusChartData,
      tasksByPriority: priorityChartData,
      projectsByStatus: projectsChartData,
      tasksOverTime: tasksByWeek,
    };
  }

  private groupTasksByWeek(tasks: { createdAt: Date; status: string | null }[]) {
    const weekMap = new Map<string, { completed: number; total: number }>();

    tasks.forEach((task) => {
      const week = this.getWeekKey(task.createdAt);
      const current = weekMap.get(week) || { completed: 0, total: 0 };
      current.total++;
      if (task.status === 'completed') {
        current.completed++;
      }
      weekMap.set(week, current);
    });

    return Array.from(weekMap.entries()).map(([week, data]) => ({
      week,
      completed: data.completed,
      total: data.total,
    }));
  }

  private getWeekKey(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const week = this.getWeekNumber(d);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}

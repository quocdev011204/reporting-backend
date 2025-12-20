import { Injectable } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';

@Injectable()
export class KpiService {
  constructor(private prisma: PrismaService) {}

  async calculateKPI() {
    // Tính toán các chỉ số KPI từ projects, tasks, team members
    const [
      totalProjects,
      activeProjects,
      totalTasks,
      completedTasks,
      inProgressTasks,
      totalTeamMembers,
      tasksByStatus,
      projectsByStatus,
    ] = await Promise.all([
      this.prisma.project.count(),
      this.prisma.project.count({ where: { status: { not: 'COMPLETED' } } }),
      this.prisma.task.count(),
      this.prisma.task.count({ where: { status: 'completed' } }),
      this.prisma.task.count({ where: { status: 'In Progress' } }),
      this.prisma.user.count(),
      this.prisma.task.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      this.prisma.project.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
    ]);

    // Tính completion rate
    const completionRate =
      totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Tính average tasks per project
    const avgTasksPerProject =
      totalProjects > 0 ? totalTasks / totalProjects : 0;

    // Tính average tasks per member
    const avgTasksPerMember =
      totalTeamMembers > 0 ? totalTasks / totalTeamMembers : 0;

    return {
      projects: {
        total: totalProjects,
        active: activeProjects,
        byStatus: projectsByStatus.map((p) => ({
          status: p.status || 'Unknown',
          count: p._count.status,
        })),
      },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: inProgressTasks,
        completionRate: Math.round(completionRate * 100) / 100,
        byStatus: tasksByStatus.map((t) => ({
          status: t.status || 'Unknown',
          count: t._count.status,
        })),
      },
      team: {
        totalMembers: totalTeamMembers,
      },
      metrics: {
        avgTasksPerProject: Math.round(avgTasksPerProject * 100) / 100,
        avgTasksPerMember: Math.round(avgTasksPerMember * 100) / 100,
      },
    };
  }

  async calculateKPIByDateRange(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const [projectsInRange, tasksInRange, completedTasksInRange] =
      await Promise.all([
        this.prisma.project.count({
          where: {
            createdAt: {
              gte: start,
              lte: end,
            },
          },
        }),
        this.prisma.task.count({
          where: {
            createdAt: {
              gte: start,
              lte: end,
            },
          },
        }),
        this.prisma.task.count({
          where: {
            status: 'completed',
            updatedAt: {
              gte: start,
              lte: end,
            },
          },
        }),
      ]);

    const completionRate =
      tasksInRange > 0 ? (completedTasksInRange / tasksInRange) * 100 : 0;

    return {
      dateRange: {
        start: startDate,
        end: endDate,
      },
      projects: projectsInRange,
      tasks: {
        total: tasksInRange,
        completed: completedTasksInRange,
        completionRate: Math.round(completionRate * 100) / 100,
      },
    };
  }
}

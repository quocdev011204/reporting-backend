import { Injectable } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  async createAlert(data: {
    reportId?: number;
    taskId?: number;
    message: string;
    sentTo?: any;
    status?: string;
  }) {
    return this.prisma.alert.create({
      data: {
        reportId: data.reportId,
        taskId: data.taskId,
        message: data.message,
        sentTo: data.sentTo,
        status: data.status || 'pending',
      },
    });
  }

  async getAllAlerts() {
    return this.prisma.alert.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        report: {
          select: {
            id: true,
            title: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });
  }

  async getAlertById(id: number) {
    return this.prisma.alert.findUnique({
      where: { id },
      include: {
        report: true,
        task: true,
      },
    });
  }

  async updateAlertStatus(id: number, status: string, sentAt?: Date) {
    return this.prisma.alert.update({
      where: { id },
      data: {
        status,
        sentAt: sentAt || new Date(),
      },
    });
  }

  async getAlertsByReportId(reportId: number) {
    return this.prisma.alert.findMany({
      where: { reportId },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getAlertsByTaskId(taskId: number) {
    return this.prisma.alert.findMany({
      where: { taskId },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async deleteAlert(id: number) {
    return this.prisma.alert.delete({
      where: { id },
    });
  }
}

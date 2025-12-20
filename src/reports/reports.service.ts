import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/services/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getReports(query: {
    page?: number;
    limit?: number;
    sort?: string;
    filter?: string;
  }) {
    const take = query.limit ? +query.limit : 10;
    const skip = query.page ? (+query.page - 1) * take : 0;
    const orderBy = query.sort
      ? { [query.sort.split(':')[0]]: query.sort.split(':')[1] }
      : { createdAt: 'asc' as const };
    const where = query.filter
      ? { value: { gt: parseFloat(query.filter.split('>')[1]) } }
      : {};

    return this.prisma.report.findMany({ where, orderBy, skip, take });
  }

  async getReportById(id: number) {
    return this.prisma.report.findUnique({ where: { id } });
  }

  async createReport(title: string, value: number, userId: number) {
    return this.prisma.report.create({ data: { title, value, userId } });
  }

  async updateReport(
    id: number,
    body: { title?: string; value?: number; status?: string },
  ) {
    return this.prisma.report.update({ where: { id }, data: body });
  }

  async deleteReport(id: number) {
    return this.prisma.report.delete({ where: { id } });
  }

  async getSummary() {
    const [count, avgValue] = await Promise.all([
      this.prisma.report.count(),
      this.prisma.report.aggregate({ _avg: { value: true } }),
    ]);
    return { totalReports: count, averageValue: avgValue._avg.value };
  }

  async searchReports(query: string) {
    return this.prisma.report.findMany({
      where: { title: { contains: query } },
    });
  }

  async createReportFromAI(data: {
    projectId?: number;
    userId?: number;
    title?: string;
    type?: string;
    data?: any;
    generatedAt?: Date;
  }) {
    return this.prisma.report.create({
      data: {
        projectId: data.projectId,
        userId: data.userId,
        title: data.title || 'AI Generated Report',
        type: data.type || 'ai_report',
        data: data.data,
        generatedAt: data.generatedAt || new Date(),
      },
    });
  }

  async updateReportWithAIData(
    id: number,
    data: { title?: string; data?: any; type?: string },
  ) {
    return this.prisma.report.update({
      where: { id },
      data: {
        title: data.title,
        data: data.data,
        type: data.type,
        updatedAt: new Date(),
      },
    });
  }
}

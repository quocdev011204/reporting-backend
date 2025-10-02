/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
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
      : { createdAt: Prisma.SortOrder.asc };
    const where = query.filter
      ? { value: { gt: parseFloat(query.filter.split('>')[1]) } }
      : {};

    return this.prisma.report.findMany({ where, orderBy, skip, take });
  }

  async getReportById(id: number) {
    return this.prisma.report.findUnique({ where: { id } });
  }

  async createReport(title: string, value: number, status?: string) {
    return this.prisma.report.create({ data: { title, value, status } });
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
}

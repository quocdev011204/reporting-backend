/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getReports() {
    return this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' }, // Sắp xếp mới nhất trước
    });
  }

  async getReportById(id: number) {
    return this.prisma.report.findUnique({
      where: { id },
    });
  }

  async createReport(title: string, value: number) {
    return this.prisma.report.create({
      data: { title, value },
    });
  }
}

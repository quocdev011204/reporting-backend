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
    try {
      const take = query.limit ? +query.limit : 10;
      const skip = query.page ? (+query.page - 1) * take : 0;
      
      // Parse orderBy safely - chỉ cho phép các field hợp lệ
      const allowedFields = ['id', 'title', 'value', 'type', 'createdAt', 'updatedAt', 'generatedAt'];
      let orderBy: any = { createdAt: 'desc' as const };
      if (query.sort) {
        const [field, direction] = query.sort.split(':');
        if (field && allowedFields.includes(field) && (direction === 'asc' || direction === 'desc')) {
          orderBy = { [field]: direction };
        }
      }
      
      // Parse filter safely
      const where: any = {};
      if (query.filter) {
        try {
          const filterParts = query.filter.split('>');
          if (filterParts.length === 2) {
            const value = parseFloat(filterParts[1]);
            if (!isNaN(value)) {
              where.value = { gt: value };
            }
          }
        } catch (e) {
          // Ignore filter parsing errors
        }
      }

      const reports = await this.prisma.report.findMany({ 
        where, 
        orderBy, 
        skip, 
        take,
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
      
      return reports || [];
    } catch (error: any) {
      console.error('Error in getReports:', error);
      console.error('Error details:', error.message, error.stack);
      throw error;
    }
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
    // chấp nhận nhiều alias cho url
    googleDocUrl?: string;
    docUrl?: string;
    docxUrl?: string;
    fileUrl?: string;
  }) {
    const docUrl =
      data.googleDocUrl ||
      data.docxUrl ||
      data.docUrl ||
      data.fileUrl;

    return this.prisma.report.create({
      data: {
        projectId: data.projectId,
        userId: data.userId,
        title: data.title || 'AI Generated Report',
        type: data.type || 'ai_report',
        data: data.data,
        generatedAt: data.generatedAt || new Date(),
        googleDocUrl: docUrl,
      },
    });
  }

  async updateReportWithAIData(
    id: number,
    data: { 
      title?: string; 
      data?: any; 
      type?: string;
      googleDocUrl?: string;
      docUrl?: string;
      docxUrl?: string;
      fileUrl?: string;
    },
  ) {
    const docUrl =
      data.googleDocUrl ||
      data.docxUrl ||
      data.docUrl ||
      data.fileUrl;

    return this.prisma.report.update({
      where: { id },
      data: {
        title: data.title,
        data: data.data,
        type: data.type,
        googleDocUrl: docUrl,
        updatedAt: new Date(),
      },
    });
  }
}

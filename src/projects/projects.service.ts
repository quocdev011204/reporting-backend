import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async createFromN8n(data: any) {
    return this.prisma.project.create({
      data: {
        name: data.project_name,
        description: data.requirements,
        startDate: new Date(), // FE không gửi -> đặt mặc định NOW
        endDate: data.deadline ? new Date(data.deadline) : null,
        status: 'NEW',
      },
    });
  }

  async getAllProjects() {
    return this.prisma.project.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}

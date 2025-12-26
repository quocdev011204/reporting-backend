import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) { }

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

  async updateProject(
    id: number,
    data: { name?: string; description?: string; status?: string; predictedDelay?: string | Date | null }
  ) {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.predictedDelay !== undefined) {
      if (data.predictedDelay) {
        const date = new Date(data.predictedDelay);
        if (!isNaN(date.getTime())) {
          updateData.predictedDelay = date;
        } else {
          updateData.predictedDelay = null;
        }
      } else {
        updateData.predictedDelay = null;
      }
    }

    return this.prisma.project.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteProject(id: number) {
    return this.prisma.project.delete({
      where: { id },
    });
  }
}

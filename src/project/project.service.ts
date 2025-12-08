import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';
import { Project, Prisma } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}
  async create(data: Prisma.ProjectCreateInput): Promise<Project> {
    return await this.prisma.project.create({
      data,
    });
  }

  async findAll(): Promise<Project[]> {
    return await this.prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { tasks: true, reports: true },
        },
      },
    });
  }
  async findOne(id: number): Promise<Project | null> {
    return await this.prisma.project.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { createdAt: 'desc' },
        },
        reports: {
          orderBy: { generatedAt: 'desc' },
        },
      },
    });
  }

  async update(id: number, data: Prisma.ProjectUpdateInput): Promise<Project> {
    return await this.prisma.project.update({
      where: { id },
      data,
    });
  }

  async remove(id: number): Promise<Project> {
    return await this.prisma.project.delete({
      where: { id },
    });
  }
}

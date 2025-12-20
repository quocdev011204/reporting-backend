import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

interface JwtPayload {
  id: number;
  username: string;
  role: string;
}

interface RequestWithUser extends Request {
  user: JwtPayload;
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() body: { title: string; value: number },
    @Req() req: RequestWithUser,
  ) {
    const userId = req.user.id;
    return this.reportsService.createReport(body.title, body.value, userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query()
    query: {
      page?: number;
      limit?: number;
      sort?: string;
      filter?: string;
    },
  ) {
    return this.reportsService.getReports(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.reportsService.getReportById(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { title?: string; value?: number; status?: string },
  ) {
    return this.reportsService.updateReport(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.reportsService.deleteReport(id);
  }

  @Get('summary')
  async summary() {
    return this.reportsService.getSummary();
  }

  @Get('search')
  async search(@Query('query') query: string) {
    return this.reportsService.searchReports(query);
  }

  @Post('ai')
  async createReportFromAI(
    @Body()
    body: {
      projectId?: number;
      userId?: number;
      title?: string;
      type?: string;
      data?: any;
      generatedAt?: string;
    },
  ) {
    return this.reportsService.createReportFromAI({
      ...body,
      generatedAt: body.generatedAt ? new Date(body.generatedAt) : undefined,
    });
  }

  @Put(':id/ai')
  async updateReportWithAIData(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { title?: string; data?: any; type?: string },
  ) {
    return this.reportsService.updateReportWithAIData(id, body);
  }
}

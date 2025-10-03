/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
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
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() body: { title: string; value: number; status?: string },
  ) {
    return this.reportsService.createReport(
      body.title,
      body.value,
      body.status,
    );
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
}

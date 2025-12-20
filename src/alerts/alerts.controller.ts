import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Public()
  @Post()
  async createAlert(
    @Body()
    body: {
      reportId?: number;
      taskId?: number;
      message: string;
      sentTo?: any;
      status?: string;
    },
  ) {
    return this.alertsService.createAlert(body);
  }

  @Public()
  @Get()
  async getAllAlerts() {
    return this.alertsService.getAllAlerts();
  }

  @Public()
  @Get(':id')
  async getAlertById(@Param('id', ParseIntPipe) id: number) {
    return this.alertsService.getAlertById(id);
  }

  @Public()
  @Put(':id/status')
  async updateAlertStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string; sentAt?: string },
  ) {
    return this.alertsService.updateAlertStatus(
      id,
      body.status,
      body.sentAt ? new Date(body.sentAt) : undefined,
    );
  }

  @Public()
  @Get('report/:reportId')
  async getAlertsByReportId(@Param('reportId', ParseIntPipe) reportId: number) {
    return this.alertsService.getAlertsByReportId(reportId);
  }

  @Public()
  @Get('task/:taskId')
  async getAlertsByTaskId(@Param('taskId', ParseIntPipe) taskId: number) {
    return this.alertsService.getAlertsByTaskId(taskId);
  }

  @Public()
  @Delete(':id')
  async deleteAlert(@Param('id', ParseIntPipe) id: number) {
    return this.alertsService.deleteAlert(id);
  }
}

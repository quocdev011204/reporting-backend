import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { KpiService } from './kpi.service';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('kpi')
export class KpiController {
  constructor(private readonly kpiService: KpiService) {}

  @Public()
  @Get()
  async getKPI() {
    return this.kpiService.calculateKPI();
  }

  @Public()
  @Get('range')
  async getKPIByDateRange(
    @Query('start') startDate: string,
    @Query('end') endDate: string,
  ) {
    return this.kpiService.calculateKPIByDateRange(startDate, endDate);
  }
}

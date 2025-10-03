import { Body, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ProductivityService } from './productivity.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('productivity')
export class ProductivityController {
  constructor(private productivityService: ProductivityService) {}

  @Get('reports')
  @UseGuards(JwtAuthGuard)
  async report(
    @Query('userId') userId: number,
    @Query() dateRange: { start: string; end: string },
  ) {
    return this.productivityService.generateBasicReport(userId, dateRange);
  }
}

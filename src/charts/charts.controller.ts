import { Controller, Get } from '@nestjs/common';
import { ChartsService } from './charts.service';
import { Public } from '../auth/public.decorator';

@Controller('charts')
export class ChartsController {
  constructor(private readonly chartsService: ChartsService) {}

  @Public()
  @Get('data')
  async getChartData() {
    return this.chartsService.prepareChartData();
  }
}

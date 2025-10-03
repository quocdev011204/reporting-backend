import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TimeLogsService } from './time-logs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('time-logs')
export class TimeLogsController {
  constructor(private timeLogsService: TimeLogsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async log(
    @Body()
    body: {
      taskId: number;
      userId: number;
      startTime: string;
      endTime: string;
    },
  ) {
    return this.timeLogsService.logTime(
      body.taskId,
      body.userId,
      body.startTime,
      body.endTime,
    );
  }

  @Get(':taskId/total')
  @UseGuards(JwtAuthGuard)
  async totalTime(@Param('taskId') taskId: number) {
    return this.timeLogsService.getTotalTime(taskId);
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  async getUserLogs(
    @Param('userId') userId: number,
    @Query() dateRange: { start: string; end: string },
  ) {
    return this.timeLogsService.getUserTimeLogs(userId, dateRange);
  }
}

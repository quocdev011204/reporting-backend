import { Test, TestingModule } from '@nestjs/testing';
import { TimeLogsService } from './time-logs.service';

describe('TimeLogsService', () => {
  let service: TimeLogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TimeLogsService],
    }).compile();

    service = module.get<TimeLogsService>(TimeLogsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

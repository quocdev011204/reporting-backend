import { Test, TestingModule } from '@nestjs/testing';
import { TimeLogsController } from './time-logs.controller';

describe('TimeLogsController', () => {
  let controller: TimeLogsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TimeLogsController],
    }).compile();

    controller = module.get<TimeLogsController>(TimeLogsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

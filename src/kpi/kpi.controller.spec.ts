import { Test, TestingModule } from '@nestjs/testing';
import { KpiController } from './kpi.controller';

describe('KpiController', () => {
  let controller: KpiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KpiController],
    }).compile();

    controller = module.get<KpiController>(KpiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

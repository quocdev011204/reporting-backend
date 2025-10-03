import { Test, TestingModule } from '@nestjs/testing';
import { ProductivityController } from './productivity.controller';

describe('ProductivityController', () => {
  let controller: ProductivityController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductivityController],
    }).compile();

    controller = module.get<ProductivityController>(ProductivityController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

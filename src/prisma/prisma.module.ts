// src/prisma/prisma.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';

@Module({
  providers: [PrismaService],
  exports: [PrismaService], // Export PrismaService để các module khác sử dụng
})
export class PrismaModule {}

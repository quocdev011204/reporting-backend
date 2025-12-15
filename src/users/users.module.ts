import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from 'src/services/prisma.service';
import { UsersController } from './users.controller';
import { AuthModule } from 'src/auth/auth.module';


@Module({
  imports: [],
  providers: [UsersService, PrismaService],
  exports: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}

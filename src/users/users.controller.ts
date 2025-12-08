import {
  Controller,
  Get,
  Param,
  UseGuards,
  ParseIntPipe,
  Post,
  Body,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateUserDto } from 'src/dto';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    const user = await this.usersService.register(
      createUserDto.email,
      createUserDto.password,
    );
    const { password, ...result } = user;
    return result;
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getUser(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findById(id);
    if (user) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAllUsers() {
    return this.usersService.getAllUsers();
  }
}

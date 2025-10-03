import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Post('register')
  async register(@Body() body: { username: string; password: string }) {
    return this.usersService.register(body.username, body.password);
  }

  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    return this.authService.login(body.username, body.password);
  }
}

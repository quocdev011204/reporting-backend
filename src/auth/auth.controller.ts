import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    // Fake auth - thay bằng real check
    const user = { userId: 1, username: body.username };
    return this.authService.login(user);
  }
}

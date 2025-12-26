import { Controller, Post, Body, Get, Request, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { Public } from './public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth') // Route prefix: /auth
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) { }

  @Post('register')
  @Public()
  async register(@Body() body: { username: string; password: string; name?: string }) {
    return this.usersService.register(body.username, body.password, body.name);
  }

  @Post('login')
  @Public()
  async login(@Body() body: { username: string; password: string }) {
    return this.authService.login(body.username, body.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Request() req: any) {
    // JWT payload is available in req.user
    return {
      id: req.user.sub,
      username: req.user.username,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
    };
  }
}

import { Controller, Get, Put, Param, Body, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) { }

  @Public()
  @Get('team')
  async getUsers() {
    const data = await this.usersService.getAllUsers();

    return {
      data,
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getUser(@Param('id') id: string) {
    return this.usersService.findById(Number(id));
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Request() req: any,
    @Body() body: { name?: string; email?: string }
  ) {
    const userId = req.user.sub; // Get user ID from JWT
    return this.usersService.updateProfile(userId, body);
  }

  @Put('password')
  @UseGuards(JwtAuthGuard)
  async updatePassword(
    @Request() req: any,
    @Body() body: { currentPassword: string; newPassword: string }
  ) {
    const userId = req.user.sub;
    return this.usersService.updatePassword(userId, body.currentPassword, body.newPassword);
  }

  @Put(':id/skills')
  @UseGuards(JwtAuthGuard)
  async updateSkills(
    @Param('id') id: string,
    @Body() body: { skills: string[] }
  ) {
    return this.usersService.updateSkills(Number(id), body.skills);
  }

  @Put(':id/role')
  @UseGuards(JwtAuthGuard)
  async updateRole(
    @Param('id') id: string,
    @Body() body: { role: string }
  ) {
    return this.usersService.updateRole(Number(id), body.role);
  }
}

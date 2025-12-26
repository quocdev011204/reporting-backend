import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) { }

  async login(emailOrUsername: string, password: string) {
    const user = await this.usersService.validateUserByEmail(emailOrUsername, password);
    const payload = {
      username: user.username,
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
      userId: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}

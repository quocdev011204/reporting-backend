import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async register(email: string, password: string): Promise<User> {
    if (!email || !password) {
      throw new ConflictException('Email and password are required');
    }
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }
    const defaultUsername = email.split('@')[0];
    const hashedPassword = await bcrypt.hash(password, 10);

    return this.prisma.user.create({
      data: {
        email: email,
        password: hashedPassword,
        username: defaultUsername,
      },
    });
  }

  async validateUser(
    email: string,
    password: string,
  ): Promise<{ id: number; username: string | null; email: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { id: user.id, email: user.email, username: user.username };
  }

  async findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
  async getAllUsers() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, role: true },
    });
  }
}

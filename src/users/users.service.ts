import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async register(username: string, password: string) {
    const existingUser = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existingUser) {
      throw new ConflictException('Username already exists');
    }
    const hashedPassword = await bcrypt.hash(password, 10); // Hash with salt 10
    return this.prisma.user.create({
      data: { username, password: hashedPassword },
    });
  }

  async validateUser(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { id: user.id, username: user.username }; // Return user without password
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async getAllUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        skills: true,
        slackUserId: true,
        jiraUserId: true,
        availability: true,
      },
    });

    const mapped = users.map((u, index) => ({
      id: u.id,
      name: u.name,
      mail: u.email,
      skills: Array.isArray(u.skills) ? u.skills : [],
      id_slack: u.slackUserId,
      id_jira: u.jiraUserId,
      role: u.role,
    }));

    return mapped;
  }
}

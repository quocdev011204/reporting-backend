import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'src/services/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) { }

  async register(emailOrUsername: string, password: string, name?: string) {
    // Check if input is email or username
    const isEmail = emailOrUsername.includes('@');

    if (isEmail) {
      // Email-based registration
      const existingUser = await this.prisma.user.findUnique({
        where: { email: emailOrUsername },
      });
      if (existingUser) {
        throw new ConflictException('Email already exists');
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      return this.prisma.user.create({
        data: {
          email: emailOrUsername,
          username: emailOrUsername, // Use email as username
          password: hashedPassword,
          name: name || emailOrUsername.split('@')[0],
          role: 'member',
        },
      });
    } else {
      // Username-based registration (legacy)
      const existingUser = await this.prisma.user.findUnique({
        where: { username: emailOrUsername },
      });
      if (existingUser) {
        throw new ConflictException('Username already exists');
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      return this.prisma.user.create({
        data: {
          username: emailOrUsername,
          email: `${emailOrUsername}@placeholder.com`,  // Placeholder email for legacy username-based registration
          password: hashedPassword,
          name: name || emailOrUsername,
          role: 'member',
        },
      });
    }
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
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async validateUserByEmail(emailOrUsername: string, password: string) {
    // Try to find by email first, then by username
    let user = await this.prisma.user.findUnique({
      where: { email: emailOrUsername }
    });

    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { username: emailOrUsername }
      });
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
    };
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

  async updateProfile(userId: number, data: { name?: string; email?: string }) {
    if (data.email) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          email: data.email,
          id: { not: userId },
        },
      });
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email,
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
      },
    });

    return updatedUser;
  }

  async updatePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: 'Password updated successfully' };
  }

  async updateSkills(userId: number, skills: string[]) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { skills },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        skills: true,
      },
    });
  }

  async updateRole(userId: number, role: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        skills: true,
      },
    });
  }
}

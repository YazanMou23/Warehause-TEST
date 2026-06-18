import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { JwtPayload } from '../common/types/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        username: loginDto.username,
        isActive: true,
        deletedAt: null,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    };

    // Log login action
    await this.prisma.actionLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        details: `User ${user.name} (${user.username}) logged in`,
      },
    });

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        warehouseId: user.warehouseId,
        hallId: user.hallId,
      },
    };
  }

  async refreshToken(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive || user.deletedAt !== null) {
      throw new UnauthorizedException('User no longer active');
    }

    const payload: JwtPayload = {
      sub: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
    };
  }

  async logout(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (user) {
      await this.prisma.actionLog.create({
        data: {
          userId: user.id,
          action: 'LOGOUT',
          details: `User ${user.name} (${user.username}) logged out`,
        },
      });
    }
    return { message: 'Logged out successfully' };
  }
}

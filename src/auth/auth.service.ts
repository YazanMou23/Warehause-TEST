import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JwtPayload } from '../common/types/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
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

  /**
   * Initiate password reset — finds user by email (Admin/Manager only),
   * creates a secure token, and sends an email with the reset link.
   * Always returns a generic success message to prevent email enumeration.
   */
  async forgotPassword(email: string) {
    const genericResponse = {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    };

    if (!email) {
      return genericResponse;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        email,
        isActive: true,
        deletedAt: null,
        role: { in: ['ADMIN', 'MANAGER'] },
      },
    });

    // Always return generic to prevent email enumeration
    if (!user) {
      return genericResponse;
    }

    // Invalidate any existing unused tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Generate a cryptographically secure token
    const rawToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: {
        token: rawToken,
        userId: user.id,
        expiresAt,
      },
    });

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    // Send reset email (fire-and-forget — don't fail the request if email fails)
    this.emailService
      .sendPasswordResetEmail(user.email!, user.name, resetUrl)
      .catch((err) => console.error('Password reset email failed:', err));

    await this.prisma.actionLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        details: `Password reset requested for ${user.name} (${user.email})`,
      },
    });

    return genericResponse;
  }

  /**
   * Validate a reset token without consuming it.
   * Used by the frontend to check if the link is still valid before showing the form.
   */
  async validateResetToken(token: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: { select: { name: true, email: true } } },
    });

    if (!record || record.used || record.expiresAt < new Date()) {
      return { valid: false };
    }

    return { valid: true, name: record.user.name };
  }

  /**
   * Consume the reset token and apply the new password.
   */
  async resetPassword(token: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!record) {
      throw new BadRequestException('Invalid or expired reset link.');
    }

    if (record.used) {
      throw new BadRequestException('This reset link has already been used.');
    }

    if (record.expiresAt < new Date()) {
      throw new BadRequestException('This reset link has expired. Please request a new one.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { token },
        data: { used: true },
      }),
    ]);

    await this.prisma.actionLog.create({
      data: {
        userId: record.userId,
        action: 'PASSWORD_RESET_COMPLETED',
        details: `Password successfully reset for user ${record.user.name}`,
      },
    });

    return { message: 'Password reset successfully. You can now log in.' };
  }
}

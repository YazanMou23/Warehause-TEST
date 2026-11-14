import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 login attempts/min per IP
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async refresh(@CurrentUser('id') userId: string) {
    return this.authService.refreshToken(userId);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  /**
   * POST /auth/change-password
   * Body: { currentPassword: string, newPassword: string }
   * Authenticated — available to all roles (EMPLOYEE, ADMIN, MANAGER).
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, changePasswordDto);
  }

  /**
   * POST /auth/forgot-password
   * Body: { email: string }
   * Public — no auth required. Always returns generic message.
   */
  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 300_000 } }) // 3 reset mails per 5 min per IP
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  /**
   * GET /auth/validate-reset-token?token=...
   * Public — frontend checks if a token is still valid before showing the form.
   */
  @Public()
  @Get('validate-reset-token')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async validateResetToken(@Query('token') token: string) {
    return this.authService.validateResetToken(token);
  }

  /**
   * POST /auth/reset-password
   * Body: { token: string, newPassword: string }
   * Public — consumes the token and saves the new password.
   */
  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body('token') token: string,
    @Body('newPassword') newPassword: string,
  ) {
    return this.authService.resetPassword(token, newPassword);
  }
}

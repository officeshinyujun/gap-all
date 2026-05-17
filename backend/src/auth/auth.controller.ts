import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SendCodeDto } from './dto/send-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { SecurityLoggerInterceptor } from '../common/interceptors/security-logger.interceptor';

const isProduction = process.env.NODE_ENV === 'production';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? ('none' as const) : ('lax' as const),
  domain: process.env.COOKIE_DOMAIN || undefined,
  path: '/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? ('none' as const) : ('lax' as const),
  domain: process.env.COOKIE_DOMAIN || undefined,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

@Controller('auth')
@UseInterceptors(SecurityLoggerInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('send-code')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  async sendCode(@Body() dto: SendCodeDto) {
    return this.authService.sendVerificationCode(dto.email);
  }

  @Post('verify-code')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async verifyCode(@Body() dto: VerifyCodeDto) {
    return this.authService.verifyCode(dto.email, dto.code);
  }

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    res.cookie('gap_refresh_token', result.refreshToken, COOKIE_OPTIONS);
    res.cookie('gap_access_token', result.accessToken, ACCESS_COOKIE_OPTIONS);
    const { refreshToken, ...body } = result;
    return body;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    res.cookie('gap_refresh_token', result.refreshToken, COOKIE_OPTIONS);
    res.cookie('gap_access_token', result.accessToken, ACCESS_COOKIE_OPTIONS);
    const { refreshToken, ...body } = result;
    return body;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.['gap_refresh_token'];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }
    const result = await this.authService.refresh(refreshToken);
    res.cookie('gap_refresh_token', result.refreshToken, COOKIE_OPTIONS);
    res.cookie('gap_access_token', result.accessToken, ACCESS_COOKIE_OPTIONS);
    const { refreshToken: _, ...body } = result;
    return body;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.['gap_refresh_token'];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    res.clearCookie('gap_refresh_token', { path: '/auth' });
    res.clearCookie('gap_access_token', { path: '/' });
    return { message: 'Logged out' };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as {
      googleId: string;
      email: string;
      name: string;
      photo: string | null;
    };
    const result = await this.authService.googleLogin(profile);
    res.cookie('gap_refresh_token', result.refreshToken, COOKIE_OPTIONS);
    res.cookie('gap_access_token', result.accessToken, ACCESS_COOKIE_OPTIONS);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    res.redirect(`${frontendUrl}/auth/google/callback`);
  }
}

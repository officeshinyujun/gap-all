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
  Query,
} from '@nestjs/common';
import { GoogleAuthGuard } from '../common/guards/google-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { randomBytes, timingSafeEqual } from 'crypto';
import passport from 'passport';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SendCodeDto } from './dto/send-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { SecurityLoggerInterceptor } from '../common/interceptors/security-logger.interceptor';
import {
  getFrontendOrigin,
  isAllowedOrigin,
} from '../common/security/allowed-origins';

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

const OAUTH_STATE_COOKIE = 'gap_google_oauth_state';
const OAUTH_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? ('none' as const) : ('lax' as const),
  domain: process.env.COOKIE_DOMAIN || undefined,
  path: '/auth/google',
  maxAge: 10 * 60 * 1000,
  signed: true,
};

interface OAuthStateCookie {
  state: string;
  returnTo: string;
}

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
  verifyCode(@Body() dto: VerifyCodeDto) {
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
    const { refreshToken: nextRefreshToken, ...body } = result;
    void nextRefreshToken;
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
    const { refreshToken: nextRefreshToken, ...body } = result;
    void nextRefreshToken;
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
    const { refreshToken: nextRefreshToken, ...body } = result;
    void nextRefreshToken;
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
  googleLogin(
    @Req() req: Request,
    @Res() res: Response,
    @Query('return_to') returnTo?: string,
  ) {
    const state = randomBytes(32).toString('base64url');
    const options: any = { scope: ['email', 'profile'], session: false };
    options.state = state;
    // ponytail: override callbackURL per-request for localhost vs Tailscale hosts
    options.callbackURL = this.getGoogleCallbackURL(req);
    const stateCookie: OAuthStateCookie = {
      state,
      returnTo: this.normalizeReturnTo(returnTo),
    };
    res.cookie(
      OAUTH_STATE_COOKIE,
      JSON.stringify(stateCookie),
      OAUTH_STATE_COOKIE_OPTIONS,
    );
    passport.authenticate('google', options)(req, res);
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const state =
      typeof req.query.state === 'string' ? req.query.state : undefined;
    const stateCookie = this.parseOAuthStateCookie(
      req.signedCookies?.[OAUTH_STATE_COOKIE],
    );
    res.clearCookie(OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_OPTIONS);
    if (!stateCookie || !this.isValidOAuthState(state, stateCookie.state)) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }

    const profile = req.user as {
      googleId: string;
      email: string;
      name: string;
      photo: string | null;
    };
    const result = await this.authService.googleLogin(profile);
    res.cookie('gap_refresh_token', result.refreshToken, COOKIE_OPTIONS);
    res.cookie('gap_access_token', result.accessToken, ACCESS_COOKIE_OPTIONS);
    res.redirect(`${stateCookie.returnTo}/auth/google/callback`);
  }

  private normalizeReturnTo(value?: string): string {
    if (value && isAllowedOrigin(value)) {
      return new URL(value).origin;
    }
    return getFrontendOrigin();
  }

  private getGoogleCallbackURL(req: Request): string {
    const host = req.get('host') || 'localhost:3001';
    const protocol = host.includes('localhost') || host.startsWith('127.') || host.startsWith('192.')
      ? 'http'
      : 'https';
    return `${protocol}://${host}/auth/google/callback`;
  }

  private isValidOAuthState(
    state: string | undefined,
    expectedState: unknown,
  ): boolean {
    if (typeof state !== 'string' || typeof expectedState !== 'string') {
      return false;
    }

    const actual = Buffer.from(state);
    const expected = Buffer.from(expectedState);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private parseOAuthStateCookie(value: unknown): OAuthStateCookie | undefined {
    if (typeof value !== 'string') return undefined;

    try {
      const parsed = JSON.parse(value) as Partial<OAuthStateCookie>;
      if (
        typeof parsed.state !== 'string' ||
        typeof parsed.returnTo !== 'string' ||
        !isAllowedOrigin(parsed.returnTo)
      ) {
        return undefined;
      }
      return { state: parsed.state, returnTo: parsed.returnTo };
    } catch {
      return undefined;
    }
  }
}

import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private verificationCodes = new Map<
    string,
    { code: string; expiresAt: number; verified: boolean; token: string | null }
  >();

  private readonly mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
  ) {}

  // ============================================================
  // Send Verification Code
  // ============================================================
  async sendVerificationCode(email: string) {
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    const code = randomInt(100000, 1000000).toString();
    const expiresAt = Date.now() + 3 * 60 * 1000;

    this.verificationCodes.set(email, {
      code,
      expiresAt,
      verified: false,
      token: null,
    });

    await this.mailer.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: email,
      subject: '[2830] 이메일 인증번호',
      html: `<p>인증번호: <strong>${code}</strong></p><p>3분 이내에 입력해주세요.</p>`,
    });

    return { message: '인증번호가 발송되었습니다.' };
  }

  // ============================================================
  // Verify Code
  // ============================================================
  verifyCode(email: string, code: string) {
    const entry = this.verificationCodes.get(email);
    if (!entry) {
      throw new UnauthorizedException('인증번호를 먼저 요청해주세요.');
    }
    if (Date.now() > entry.expiresAt) {
      this.verificationCodes.delete(email);
      throw new UnauthorizedException('인증번호가 만료되었습니다.');
    }
    if (entry.code !== code) {
      throw new UnauthorizedException('인증번호가 올바르지 않습니다.');
    }

    const token = randomBytes(32).toString('hex');
    entry.verified = true;
    entry.token = token;
    this.verificationCodes.set(email, entry);

    return { verificationToken: token };
  }

  // ============================================================
  // Register
  // ============================================================
  async register(dto: RegisterDto) {
    const entry = this.verificationCodes.get(dto.email);
    if (!entry || !entry.verified || entry.token !== dto.verificationToken) {
      throw new UnauthorizedException('이메일 인증이 필요합니다.');
    }
    this.verificationCodes.delete(dto.email);

    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
      birthday: dto.birthday,
    });
    await this.userRepo.save(user);

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { user: this.sanitize(user), ...tokens };
  }

  // ============================================================
  // Login
  // ============================================================
  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { user: this.sanitize(user), ...tokens };
  }

  // ============================================================
  // Refresh
  // ============================================================
  async refresh(refreshToken: string) {
    const hashedToken = this.hashToken(refreshToken);
    const stored = await this.refreshTokenRepo.findOne({
      where: { token: hashedToken },
      relations: ['user'],
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.');
    }

    const tokens = await this.generateTokens(
      stored.user.id,
      stored.user.email,
      stored.user.role,
    );

    // Refresh Token Rotation
    await this.refreshTokenRepo.remove(stored);
    await this.saveRefreshToken(stored.user.id, tokens.refreshToken);

    return tokens;
  }

  // ============================================================
  // Logout
  // ============================================================
  async logout(refreshToken: string) {
    const hashedToken = this.hashToken(refreshToken);
    await this.refreshTokenRepo.delete({ token: hashedToken });
    return { message: '로그아웃 되었습니다.' };
  }

  // ============================================================
  // Google Login
  // ============================================================
  async googleLogin(profile: {
    googleId: string;
    email: string;
    name: string;
    photo: string | null;
  }) {
    let user = await this.userRepo.findOne({
      where: { provider: 'google', providerId: profile.googleId },
    });

    if (!user) {
      user = await this.userRepo.findOne({ where: { email: profile.email } });
      if (user) {
        user.provider = 'google';
        user.providerId = profile.googleId;
        if (profile.photo && !user.profileImageUrl) {
          user.profileImageUrl = profile.photo;
        }
        await this.userRepo.save(user);
      } else {
        user = this.userRepo.create({
          email: profile.email,
          name: profile.name,
          provider: 'google',
          providerId: profile.googleId,
          profileImageUrl: profile.photo,
        });
        await this.userRepo.save(user);
      }
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { user: this.sanitize(user), ...tokens };
  }

  // ============================================================
  // Private helpers
  // ============================================================
  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };
    const accessSecret = process.env.JWT_ACCESS_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;

    if (!accessSecret) {
      throw new Error('JWT_ACCESS_SECRET is required');
    }

    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is required');
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as any,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(userId: string, token: string) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const hashedToken = this.hashToken(token);
    const rt = this.refreshTokenRepo.create({
      userId,
      token: hashedToken,
      expiresAt,
    });
    await this.refreshTokenRepo.save(rt);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private sanitize(user: User) {
    const { passwordHash, ...safe } = user;
    void passwordHash;
    return safe;
  }
}

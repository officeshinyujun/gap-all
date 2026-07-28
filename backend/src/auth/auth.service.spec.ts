import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

// ── Mock crypto.randomBytes ──
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: () => ({ toString: () => 'mock-random-bytes' }),
  createHash: () => ({
    update: () => ({ digest: () => 'mock-hashed-token' }),
  }),
  randomInt: () => 123456,
}));

// ── Mock bcrypt ──
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

// ── Mock nodemailer ──
jest.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-id' }),
  }),
}));

describe('AuthService', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, JWT_ACCESS_SECRET: 'test-access-secret', JWT_REFRESH_SECRET: 'test-refresh-secret' };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });
  let service: AuthService;
  let userRepo: jest.Mocked<Repository<User>>;
  let refreshTokenRepo: jest.Mocked<Repository<RefreshToken>>;
  let jwtService: jest.Mocked<JwtService>;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: '홍길동',
    passwordHash: 'hashed-password',
    provider: null,
    providerId: null,
    profileImageUrl: null,
    birthday: '2000-01-01',
    studyStreakDays: 0,
    role: 'user' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    refreshTokens: [],
    progress: [],
    exams: [],
    chatSessions: [],
  };

  beforeEach(async () => {
    const mockUserRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const mockRefreshTokenRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      delete: jest.fn(),
    };
    const mockJwtService = {
      signAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: mockRefreshTokenRepo },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepo = module.get(getRepositoryToken(User));
    refreshTokenRepo = module.get(getRepositoryToken(RefreshToken));
    jwtService = module.get(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────────────────────────
  // sendVerificationCode
  // ───────────────────────────────────────────────────
  describe('sendVerificationCode', () => {
    it('이미 가입된 이메일이면 ConflictException 발생', async () => {
      userRepo.findOne.mockResolvedValue(mockUser as User);
      await expect(service.sendVerificationCode('test@example.com')).rejects.toThrow(
        ConflictException,
      );
    });

    it('신규 이메일이면 인증번호 발송 성공', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const result = await service.sendVerificationCode('new@example.com');
      expect(result).toEqual({ message: '인증번호가 발송되었습니다.' });
    });
  });

  // ───────────────────────────────────────────────────
  // verifyCode
  // ───────────────────────────────────────────────────
  describe('verifyCode', () => {
    beforeEach(async () => {
      userRepo.findOne.mockResolvedValue(null);
      await service.sendVerificationCode('new@example.com');
    });

    it('먼저 sendVerificationCode 없이 verifyCode 호출 시 UnauthorizedException', () => {
      expect(() => service.verifyCode('unknown@example.com', '123456')).toThrow(
        UnauthorizedException,
      );
    });

    it('잘못된 인증번호 입력 시 UnauthorizedException', () => {
      expect(() => service.verifyCode('new@example.com', '000000')).toThrow(
        UnauthorizedException,
      );
    });

    it('올바른 인증번호 입력 시 verificationToken 반환', () => {
      const result = service.verifyCode('new@example.com', '123456');
      expect(result).toHaveProperty('verificationToken');
      expect(result.verificationToken).toBe('mock-random-bytes');
    });
  });

  // ───────────────────────────────────────────────────
  // register
  // ───────────────────────────────────────────────────
  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'new@example.com',
      name: '홍길동',
      password: 'Test!@#pass1',
      birthday: '2000-01-01',
      verificationToken: 'invalid-token',
    };

    it('이메일 인증 없이 회원가입 시 UnauthorizedException', async () => {
      await expect(service.register(registerDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('올바른 인증 후 회원가입 성공', async () => {
      // 이메일 인증 수행
      userRepo.findOne.mockResolvedValueOnce(null);
      await service.sendVerificationCode('new@example.com');
      const verified = service.verifyCode('new@example.com', '123456');

      // 중복 이메일 체크 통과
      userRepo.findOne.mockResolvedValueOnce(null);
      userRepo.create.mockReturnValue(mockUser as User);
      userRepo.save.mockResolvedValue(mockUser as User);
      jwtService.signAsync
        .mockResolvedValueOnce('mock-access-token')
        .mockResolvedValueOnce('mock-refresh-token');
      refreshTokenRepo.create.mockReturnValue({} as RefreshToken);
      refreshTokenRepo.save.mockResolvedValue({} as RefreshToken);

      const dto = { ...registerDto, verificationToken: verified.verificationToken };
      const result = await service.register(dto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken', 'mock-access-token');
      expect(result).toHaveProperty('refreshToken', 'mock-refresh-token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });

  // ───────────────────────────────────────────────────
  // login
  // ───────────────────────────────────────────────────
  describe('login', () => {
    it('존재하지 않는 이메일로 로그인 시 UnauthorizedException', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(
        service.login({ email: 'none@example.com', password: 'any' } as LoginDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('잘못된 비밀번호 입력 시 UnauthorizedException', async () => {
      userRepo.findOne.mockResolvedValue(mockUser as User);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' } as LoginDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('올바른 인증정보로 로그인 성공', async () => {
      userRepo.findOne.mockResolvedValue(mockUser as User);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.signAsync
        .mockResolvedValueOnce('mock-access-token')
        .mockResolvedValueOnce('mock-refresh-token');
      refreshTokenRepo.create.mockReturnValue({} as RefreshToken);
      refreshTokenRepo.save.mockResolvedValue({} as RefreshToken);

      const result = await service.login({
        email: 'test@example.com',
        password: 'correct',
      } as LoginDto);

      expect(result).toHaveProperty('accessToken', 'mock-access-token');
      expect(result).toHaveProperty('refreshToken', 'mock-refresh-token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });

  // ───────────────────────────────────────────────────
  // refresh
  // ───────────────────────────────────────────────────
  describe('refresh', () => {
    it('유효하지 않은 리프레시 토큰으로 요청 시 UnauthorizedException', async () => {
      refreshTokenRepo.findOne.mockResolvedValue(null);
      await expect(service.refresh('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('만료된 리프레시 토큰으로 요청 시 UnauthorizedException', async () => {
      refreshTokenRepo.findOne.mockResolvedValue({
        expiresAt: new Date('2020-01-01'),
        user: mockUser,
      } as any);
      await expect(service.refresh('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('유효한 리프레시 토큰으로 재발급 성공', async () => {
      refreshTokenRepo.findOne.mockResolvedValue({
        token: 'mock-hashed-token',
        expiresAt: new Date(Date.now() + 86400000),
        user: mockUser,
      } as any);
      jwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      refreshTokenRepo.remove.mockResolvedValue({} as any);
      refreshTokenRepo.create.mockReturnValue({} as RefreshToken);
      refreshTokenRepo.save.mockResolvedValue({} as RefreshToken);

      const result = await service.refresh('valid-token');

      expect(result).toHaveProperty('accessToken', 'new-access-token');
      expect(result).toHaveProperty('refreshToken', 'new-refresh-token');
      expect(refreshTokenRepo.remove).toHaveBeenCalled();
      expect(refreshTokenRepo.save).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────
  // logout
  // ───────────────────────────────────────────────────
  describe('logout', () => {
    it('리프레시 토큰 삭제 후 메시지 반환', async () => {
      refreshTokenRepo.delete.mockResolvedValue({ affected: 1, raw: {} });
      const result = await service.logout('some-token');
      expect(result).toEqual({ message: '로그아웃 되었습니다.' });
      expect(refreshTokenRepo.delete).toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────
  // googleLogin
  // ───────────────────────────────────────────────────
  describe('googleLogin', () => {
    const googleProfile = {
      googleId: 'google-123',
      email: 'google@example.com',
      name: 'Google User',
      photo: 'https://photo.url',
    };

    it('신규 Google 사용자 회원가입 및 로그인', async () => {
      userRepo.findOne.mockResolvedValue(null);
      userRepo.create.mockReturnValue({ ...mockUser, email: 'google@example.com' } as User);
      userRepo.save.mockResolvedValue({ ...mockUser, email: 'google@example.com' } as User);
      jwtService.signAsync
        .mockResolvedValueOnce('mock-access-token')
        .mockResolvedValueOnce('mock-refresh-token');
      refreshTokenRepo.create.mockReturnValue({} as RefreshToken);
      refreshTokenRepo.save.mockResolvedValue({} as RefreshToken);

      const result = await service.googleLogin(googleProfile);

      expect(result).toHaveProperty('accessToken', 'mock-access-token');
      expect(result).toHaveProperty('refreshToken', 'mock-refresh-token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('기존 Google 사용자 로그인', async () => {
      userRepo.findOne.mockResolvedValue({
        ...mockUser,
        email: 'google@example.com',
        provider: 'google',
        providerId: 'google-123',
      } as User);
      jwtService.signAsync
        .mockResolvedValueOnce('mock-access-token')
        .mockResolvedValueOnce('mock-refresh-token');
      refreshTokenRepo.create.mockReturnValue({} as RefreshToken);
      refreshTokenRepo.save.mockResolvedValue({} as RefreshToken);

      const result = await service.googleLogin(googleProfile);

      expect(result).toHaveProperty('accessToken');
    });
  });
});

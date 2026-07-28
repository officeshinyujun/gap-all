import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<Partial<AuthService>>;

  const mockResponse = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  };

  const mockRequest = {
    cookies: {},
    user: undefined,
    query: {},
  };

  beforeEach(async () => {
    authService = {
      sendVerificationCode: jest.fn(),
      verifyCode: jest.fn(),
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      googleLogin: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  describe('sendCode', () => {
    it('인증코드 발송', async () => {
      authService.sendVerificationCode.mockResolvedValue({ message: '발송됨' });
      const result = await controller.sendCode({ email: 'test@example.com' });
      expect(authService.sendVerificationCode).toHaveBeenCalledWith('test@example.com');
      expect(result).toEqual({ message: '발송됨' });
    });
  });

  describe('verifyCode', () => {
    it('인증코드 검증', () => {
      authService.verifyCode.mockReturnValue({ verificationToken: 'token-123' });
      const result = controller.verifyCode({ email: 'test@example.com', code: '123456' });
      expect(result).toEqual({ verificationToken: 'token-123' });
    });
  });

  describe('register', () => {
    it('회원가입 후 쿠키 설정', async () => {
      authService.register.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
        accessToken: 'access',
        refreshToken: 'refresh',
      });

      const result = await controller.register(
        { email: 'test@example.com', name: '홍', password: 'A!@#test123', birthday: '2000-01-01', verificationToken: 't' },
        mockResponse as any,
      );

      expect(mockResponse.cookie).toHaveBeenCalledTimes(2);
      expect(result).not.toHaveProperty('refreshToken');
    });
  });

  describe('login', () => {
    it('로그인 후 쿠키 설정', async () => {
      authService.login.mockResolvedValue({
        user: { id: 'user-1', email: 'test@example.com' },
        accessToken: 'access',
        refreshToken: 'refresh',
      });

      const result = await controller.login(
        { email: 'test@example.com', password: 'pass' },
        mockResponse as any,
      );

      expect(mockResponse.cookie).toHaveBeenCalledTimes(2);
      expect(result).not.toHaveProperty('refreshToken');
    });
  });

  describe('refresh', () => {
    it('리프레시 토큰으로 재발급', async () => {
      const req = { cookies: { gap_refresh_token: 'old-refresh' } };
      authService.refresh.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      const result = await controller.refresh(req as any, mockResponse as any);
      expect(mockResponse.cookie).toHaveBeenCalledTimes(2);
      expect(result).not.toHaveProperty('refreshToken');
    });

    it('리프레시 토큰 없으면 UnauthorizedException', async () => {
      const req = { cookies: {} };
      await expect(controller.refresh(req as any, mockResponse as any)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('쿠키 삭제', async () => {
      const req = { cookies: { gap_refresh_token: 'token' } };
      const result = await controller.logout(req as any, mockResponse as any);
      expect(mockResponse.clearCookie).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ message: 'Logged out' });
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import passport from 'passport';

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
    signedCookies: {},
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
      expect(authService.sendVerificationCode).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(result).toEqual({ message: '발송됨' });
    });
  });

  describe('verifyCode', () => {
    it('인증코드 검증', () => {
      authService.verifyCode.mockReturnValue({
        verificationToken: 'token-123',
      });
      const result = controller.verifyCode({
        email: 'test@example.com',
        code: '123456',
      });
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
        {
          email: 'test@example.com',
          name: '홍',
          password: 'A!@#test123',
          birthday: '2000-01-01',
          verificationToken: 't',
        },
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
      await expect(
        controller.refresh(req as any, mockResponse as any),
      ).rejects.toThrow(UnauthorizedException);
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

  describe('Google OAuth state', () => {
    it('sets a signed random state cookie before redirecting to Google', () => {
      const authenticate = jest.fn(() => jest.fn());
      jest
        .spyOn(passport, 'authenticate')
        .mockImplementation(authenticate as any);

      controller.googleLogin(mockRequest as any, mockResponse as any);

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'gap_google_oauth_state',
        expect.any(String),
        expect.objectContaining({ signed: true, maxAge: 10 * 60 * 1000 }),
      );
      expect(authenticate).toHaveBeenCalledWith(
        'google',
        expect.objectContaining({ state: expect.any(String) }),
      );
    });

    it('rejects a missing or invalid signed OAuth state before logging in', async () => {
      const req = {
        user: {
          googleId: 'google-1',
          email: 'user@example.com',
          name: 'User',
          photo: null,
        },
        query: { state: 'unexpected' },
        signedCookies: {
          gap_google_oauth_state: JSON.stringify({
            state: 'expected',
            returnTo: 'http://localhost:5173',
          }),
        },
      };

      await expect(
        controller.googleCallback(req as any, mockResponse as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'gap_google_oauth_state',
        expect.any(Object),
      );
      expect(authService.googleLogin).not.toHaveBeenCalled();
    });

    it('accepts a matching signed OAuth state once and clears it', async () => {
      (authService.googleLogin as jest.Mock).mockResolvedValue({
        user: { id: 'user-1', email: 'user@example.com' },
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      const req = {
        user: {
          googleId: 'google-1',
          email: 'user@example.com',
          name: 'User',
          photo: null,
        },
        query: { state: 'expected' },
        signedCookies: {
          gap_google_oauth_state: JSON.stringify({
            state: 'expected',
            returnTo: 'http://localhost:5173',
          }),
        },
      };

      await controller.googleCallback(req as any, mockResponse as any);

      expect(authService.googleLogin).toHaveBeenCalled();
      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'gap_google_oauth_state',
        expect.any(Object),
      );
    });
  });
});

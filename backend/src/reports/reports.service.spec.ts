import { ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ReportsService } from './reports.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'report-id' }),
  })),
}));

describe('ReportsService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SMTP_USER: 'sender@example.com',
      SMTP_FROM: '2830 <sender@example.com>',
      REPORT_RECIPIENT_EMAIL: 'reports@example.com',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('설정된 수신자에게 오류 신고 이메일을 보낸다', async () => {
    const service = new ReportsService();
    const mailer = (nodemailer.createTransport as jest.Mock).mock.results[0].value;

    await expect(
      service.submitErrorReport({
        message: '시험 제출 시 오류가 발생합니다.',
        pageUrl: 'https://app.2830.kr/exam/success',
        userAgent: 'test browser',
      }),
    ).resolves.toEqual({ message: '오류 신고가 전송되었습니다.' });

    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2830 <sender@example.com>',
        to: 'reports@example.com',
        subject: '[2830] 오류 신고',
        text: expect.stringContaining('시험 제출 시 오류가 발생합니다.'),
      }),
    );
  });

  it('수신자 또는 발신자 설정이 없으면 전송하지 않는다', async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_FROM;
    delete process.env.REPORT_RECIPIENT_EMAIL;
    const service = new ReportsService();

    await expect(
      service.submitErrorReport({
        message: '오류',
        pageUrl: 'https://app.2830.kr',
        userAgent: 'test browser',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});

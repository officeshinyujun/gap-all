import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { CreateErrorReportDto } from './dto/create-error-report.dto';

@Injectable()
export class ReportsService {
  private readonly mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  async submitErrorReport(dto: CreateErrorReportDto) {
    const recipient = process.env.REPORT_RECIPIENT_EMAIL ?? process.env.SMTP_USER;
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;

    if (!recipient || !from) {
      throw new ServiceUnavailableException('오류 신고 이메일 설정이 완료되지 않았습니다.');
    }

    await this.mailer.sendMail({
      from,
      to: recipient,
      subject: '[2830] 오류 신고',
      text: [
        '오류 내용',
        dto.message,
        '',
        `페이지: ${dto.pageUrl}`,
        `브라우저: ${dto.userAgent}`,
        `신고 시각: ${new Date().toISOString()}`,
      ].join('\n'),
    });

    return { message: '오류 신고가 전송되었습니다.' };
  }
}

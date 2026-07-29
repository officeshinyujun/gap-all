import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export const EXAM_GENERATION_COOLDOWN_MS = 5 * 60 * 1000;

@Injectable()
export class ExamGenerationCooldownService {
  private readonly cooldowns = new Map<string, number>();

  reserve(userId: string, now = Date.now()) {
    const availableAt = this.cooldowns.get(userId);

    if (availableAt !== undefined && availableAt > now) {
      const retryAfterSeconds = Math.ceil((availableAt - now) / 1000);
      throw new HttpException(
        {
          message: '문제 생성은 5분에 한 번만 가능합니다.',
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.cooldowns.set(userId, now + EXAM_GENERATION_COOLDOWN_MS);
  }
}

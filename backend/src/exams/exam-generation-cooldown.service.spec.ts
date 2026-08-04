import { HttpException, HttpStatus } from '@nestjs/common';
import {
  EXAM_GENERATION_COOLDOWN_MS,
  ExamGenerationCooldownService,
} from './exam-generation-cooldown.service';

describe('ExamGenerationCooldownService', () => {
  it('allows one generation per user every minute', () => {
    const service = new ExamGenerationCooldownService();
    const startedAt = 1_000_000;

    service.reserve('user-1', startedAt);

    expect(() => service.reserve('user-1', startedAt + 1)).toThrow(
      HttpException,
    );
    try {
      service.reserve('user-1', startedAt + 1);
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    expect(() =>
      service.reserve('user-1', startedAt + EXAM_GENERATION_COOLDOWN_MS),
    ).not.toThrow();
  });

  it('tracks each user independently', () => {
    const service = new ExamGenerationCooldownService();

    service.reserve('user-1', 1_000_000);

    expect(() => service.reserve('user-2', 1_000_001)).not.toThrow();
  });
});

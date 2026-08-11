import { InternalServerErrorException } from '@nestjs/common';
import { Difficulty } from '../entities/exam-record.entity';
import { AiExamGenerationService } from './ai-exam-generation.service';

function request() {
  return {
    subjectId: 'subject-1',
    startUnitNum: 1,
    endUnitNum: 1,
    difficulty: Difficulty.MIDDLE,
    questionCount: 1,
    sourceType: 'ai_blueprint' as const,
  };
}

function accepted() {
  const blueprint = {
    id: 'blueprint-1',
    family: 'case' as const,
    subjectId: 'subject-1',
    unitNumber: 1,
    targetConcept: '직무 분석',
    template: 'TPL_CASE_DIAGNOSTIC_FRAME',
    invariantFacts: [],
    mutableSlots: [],
    answerRule: { id: 'answer-v1', description: 'server' },
    answerIndex: 1 as const,
    distractorRule: { id: 'distractor-v1', description: 'server' },
    distractorConcepts: ['직업 윤리', '직업 훈련', '인사 평가', '경력 개발'],
    difficulty: Difficulty.MIDDLE,
    sourceEvidence: [
      { sourceId: 'source-1', sourceHash: 'hash', unitNumber: 1 },
    ],
    blueprintVersion: 'v1',
  };
  return {
    blueprint,
    candidate: {
      stemText: '기업이 직무에 필요한 능력을 조사하였다.',
      explanationText: '직무 분석은 직무에 필요한 능력을 파악하는 것이다.',
    },
    question: {
      targetConcept: '직무 분석',
      itemType: 'ai_blueprint_case',
      difficulty: Difficulty.MIDDLE,
      recommendedTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME' as const,
      questionStem: '다음 사례에 해당하는 개념으로 가장 적절한 것은?',
      stimulusData: {
        case_profile: { name: 'AI 생성 사례', context: '개념 적용' },
        narrative: '기업이 직무에 필요한 능력을 조사하였다.',
        check_items: [],
      },
      optionsList: [
        '① 직무 분석',
        '② 직업 윤리',
        '③ 직업 훈련',
        '④ 인사 평가',
        '⑤ 경력 개발',
      ],
      comboBlock: null,
      explanation: {
        judgment: '직무 분석은 직무에 필요한 능력을 파악하는 것이다.',
      },
      correctAnswer: 1 as const,
      unitName: '1단원',
      setGroupId: null,
      setPosition: null,
    },
    validation: { passed: true, validatorVersion: 'v1' },
    fingerprint: 'ai:fingerprint-1',
    attempt: 1,
  };
}

function serviceFixture() {
  const run = {
    id: 'run-1',
    status: 'pending' as const,
    examId: null,
    acceptedCount: 0,
    rejectedCount: 0,
    progress: 0,
    stage: 'queued',
  };
  const runRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value) => ({ ...run, ...value })),
    save: jest.fn(async (value) => value),
  };
  const candidateRepo = {
    create: jest.fn((value) => value),
    save: jest.fn().mockResolvedValue([]),
  };
  const question = {
    id: 'question-1',
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Object) return undefined;
      return {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((value) => value),
        save: jest.fn().mockResolvedValue(question),
      };
    }),
    save: jest.fn(async (value) => ({ id: 'exam-1', ...value })),
  };
  const examRepo = {
    create: jest.fn((value) => value),
    manager: {
      transaction: jest.fn(async (work: (value: typeof manager) => unknown) =>
        work(manager),
      ),
    },
  };
  const examItemRepo = { create: jest.fn((value) => value) };
  const unitRepo = {};
  const blueprintService = {
    preview: jest.fn().mockResolvedValue({
      subjectSlug: 'success',
      profileVersion: 'v2',
      blueprintVersion: 'v3',
      requestedCount: 1,
      availableCount: 1,
      blueprints: [accepted().blueprint],
    }),
  };
  const questionGenerationService = {
    generate: jest.fn().mockResolvedValue({
      requestedCount: 1,
      accepted: [accepted()],
      rejected: [],
    }),
  };
  return {
    service: new AiExamGenerationService(
      runRepo as never,
      candidateRepo as never,
      examRepo as never,
      examItemRepo as never,
      {} as never,
      unitRepo as never,
      blueprintService as never,
      questionGenerationService as never,
    ),
    runRepo,
    candidateRepo,
    examRepo,
    blueprintService,
    questionGenerationService,
  };
}

describe('AiExamGenerationService', () => {
  it('persists accepted candidates and commits the exam atomically', async () => {
    const fixture = serviceFixture();

    const examId = await fixture.service.generate(
      'user-1',
      request(),
      '성공적인 직업생활',
      'success',
      'job-1',
    );

    expect(examId).toBe('exam-1');
    expect(fixture.candidateRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          runId: 'run-1',
          status: 'accepted',
          fingerprint: 'ai:fingerprint-1',
        }),
      ]),
    );
    expect(fixture.blueprintService.preview).toHaveBeenCalledWith(
      expect.objectContaining({ excludeSourceIds: [] }),
    );
    expect(fixture.runRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        examId: 'exam-1',
        acceptedCount: 1,
      }),
    );
  });

  it('returns an existing completed exam for the same idempotency key', async () => {
    const fixture = serviceFixture();
    fixture.runRepo.findOne.mockResolvedValue({
      id: 'run-existing',
      status: 'completed',
      examId: 'exam-existing',
    });

    await expect(
      fixture.service.generate(
        'user-1',
        request(),
        '성공적인 직업생활',
        'success',
        'job-1',
      ),
    ).resolves.toBe('exam-existing');
    expect(fixture.blueprintService.preview).not.toHaveBeenCalled();
  });

  it('still fails when no candidate passes validation', async () => {
    const fixture = serviceFixture();
    fixture.questionGenerationService.generate.mockResolvedValue({
      requestedCount: 1,
      accepted: [],
      rejected: [
        { blueprintId: 'blueprint-1', attempt: 3, code: 'AI_RETRY_EXHAUSTED' },
      ],
      shortfall: {
        requestedCount: 1,
        generatedCount: 0,
        reason: 'AI_RETRY_EXHAUSTED',
      },
    });

    await expect(
      fixture.service.generate(
        'user-1',
        request(),
        '성공적인 직업생활',
        'success',
        'job-1',
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(fixture.runRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureCode: 'AI_RETRY_EXHAUSTED',
      }),
    );
  });

  it('saves a partial exam when at least one candidate passes validation', async () => {
    const fixture = serviceFixture();
    const item = accepted();
    fixture.questionGenerationService.generate.mockResolvedValue({
      requestedCount: 2,
      accepted: [item],
      rejected: [
        {
          blueprintId: 'blueprint-2',
          attempt: 3,
          code: 'AI_RETRY_EXHAUSTED',
        },
      ],
      shortfall: {
        requestedCount: 2,
        generatedCount: 1,
        reason: 'AI_RETRY_EXHAUSTED',
      },
    });

    const result = await fixture.service.generate(
      'user-1',
      { ...request(), questionCount: 2 },
      '성공적인 직업생활',
      'success',
      'job-partial',
    );

    expect(result).toBe('exam-1');
    expect(fixture.runRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'completed',
        examId: 'exam-1',
        failureCode: 'AI_RETRY_EXHAUSTED',
      }),
    );
  });

  it('reports persistence failures separately after candidates pass validation', async () => {
    const fixture = serviceFixture();
    fixture.examRepo.manager.transaction.mockRejectedValue(
      new Error('database constraint'),
    );

    await expect(
      fixture.service.generate(
        'user-1',
        request(),
        '성공적인 직업생활',
        'success',
        'job-persistence-failure',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AI_PERSISTENCE_FAILED' }),
    });
    expect(fixture.runRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureCode: 'AI_PERSISTENCE_FAILED',
      }),
    );
  });

  it('does not persist a rejected row that shares the accepted fallback attempt', async () => {
    const fixture = serviceFixture();
    fixture.questionGenerationService.generate.mockResolvedValue({
      requestedCount: 1,
      accepted: [accepted()],
      rejected: [
        {
          blueprintId: 'blueprint-1',
          template: 'TPL_CASE_DIAGNOSTIC_FRAME',
          attempt: 1,
          code: 'AI_ANSWER_RULE_MISMATCH',
        },
      ],
    });

    await fixture.service.generate(
      'user-1',
      request(),
      '성공적인 직업생활',
      'success',
      'job-fallback-attempt',
    );

    expect(fixture.candidateRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ status: 'accepted', attempt: 1 }),
      ]),
    );
    expect(fixture.candidateRepo.save.mock.calls[0][0]).toHaveLength(1);
  });
});

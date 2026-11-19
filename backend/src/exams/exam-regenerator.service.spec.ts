import { Difficulty } from '../entities/exam-record.entity';
import { ExamRegeneratorService } from './exam-regenerator.service';

describe('ExamRegeneratorService prompt contract', () => {
  it('requires the json-object questions wrapper for reference regeneration', () => {
    const service = new ExamRegeneratorService();
    const prompt = service.buildBatchRegenPrompt(
      [
        {
          stem: '다음 사례에 대한 설명으로 옳은 것은?',
          stimulus: 'A씨는 근로계약을 체결하고 주 5일 근무한다.',
          viewItems: [],
          choices: ['① 가', '② 나', '③ 다', '④ 라', '⑤ 마'],
          targetConcepts: ['근로계약'],
        },
      ],
      Difficulty.MIDDLE,
      '',
    );

    expect(prompt).toContain('Return one JSON object: {"questions"');
    expect(prompt).toContain('TPL_CASE_DIAGNOSTIC_FRAME');
  });

  it('accepts only a complete generated question and never copies reference choices', async () => {
    const service = new ExamRegeneratorService();
    const client = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    questions: [
                      {
                        stem: '다음 사례에 대한 설명으로 옳은 것은?',
                        stimulus: 'A씨는 근로계약을 체결하고 주 5일 근무한다.',
                        viewItems: [],
                        choices: ['① 가', '② 나', '③ 다', '④ 라', '⑤ 마'],
                        correctAnswer: 2,
                        templateType: 'TPL_CASE_DIAGNOSTIC_FRAME',
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        },
      },
    } as any;
    const result: any[] = [];

    await service.regenerateBatch(
      client,
      'test prompt',
      [
        {
          source: { unitNumber: 1 },
          stem: '원본 발문',
          stimulus: '원본 지문',
          viewItems: [],
          choices: ['① 원본', '② 원본', '③ 원본', '④ 원본', '⑤ 원본'],
          targetConcepts: ['근로계약'],
        },
      ],
      result,
      Difficulty.MIDDLE,
      1,
    );

    expect(result).toHaveLength(1);
    expect(result[0].render_ready.options_list).toEqual([
      '① 가',
      '② 나',
      '③ 다',
      '④ 라',
      '⑤ 마',
    ]);
    expect(result[0].correct_answer).toBe(2);
  });

  it('rejects malformed generated choices instead of copying the reference', async () => {
    const service = new ExamRegeneratorService();
    const client = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    questions: [
                      {
                        stem: '다음 사례에 대한 설명으로 옳은 것은?',
                        stimulus: 'A씨는 근로계약을 체결하고 주 5일 근무한다.',
                        viewItems: [],
                        choices: ['① 가'],
                        correctAnswer: 1,
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        },
      },
    } as any;
    const result: any[] = [];

    await service.regenerateBatch(
      client,
      'test prompt',
      [
        {
          source: { unitNumber: 1 },
          choices: ['① 원본', '② 원본', '③ 원본', '④ 원본', '⑤ 원본'],
          targetConcepts: ['근로계약'],
        },
      ],
      result,
      Difficulty.MIDDLE,
      1,
    );

    expect(result).toEqual([]);
  });
});

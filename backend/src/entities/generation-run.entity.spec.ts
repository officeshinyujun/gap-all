import { GENERATION_RUN_STATUSES } from './generation-run.entity';
import { GeneratedQuestion } from './generated-question.entity';
import { GenerationExamItem } from './generation-exam-item.entity';
import { GenerationExamSession } from './generation-exam-session.entity';

describe('GenerationRun', () => {
  it('keeps only auditable lifecycle states', () => {
    expect(GENERATION_RUN_STATUSES).toEqual([
      'pending',
      'running',
      'completed',
      'failed',
    ]);
  });

  it('keeps generated content and assembly linkage separate from legacy exam entities', () => {
    const generated = new GeneratedQuestion();
    generated.generationRunId = 'run-1';
    generated.slotId = 'slot-1';
    generated.trustedContent = { stem: 'new question' };
    const session = new GenerationExamSession();
    session.generationRunId = generated.generationRunId;
    session.publicExamId = null;
    const item = new GenerationExamItem();
    item.generationExamSessionId = 'session-1';
    item.generatedQuestionId = 'question-1';
    item.orderIndex = 1;

    expect(generated.generationRunId).toBe(session.generationRunId);
    expect(session.publicExamId).toBeNull();
    expect(item.orderIndex).toBe(1);
  });
});

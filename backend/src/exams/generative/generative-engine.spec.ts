import { Difficulty } from '../../entities/difficulty';
import {
  assembleGenerativeQuestion,
  buildConceptHighlight,
  parseGenerativeCandidate,
  renderForSolver,
  dialogueShapeIssue,
  normalizeStem,
  pairRowReason,
  repairUnusedLabels,
  unusedStimulusLabels,
  validateGenerativeCandidate,
} from './generative-item-assembler';
import {
  allocatePoints,
  largestRemainder,
  planGenerativeExam,
  planGenerativeReserves,
  replanGenerativeItem,
  seededRandom,
  shortcutFreeChoiceSet,
} from './generative-item-planner';
import { blindSolveRejection } from './generative-gates';
import {
  generativeMaxAttempts,
  replanFromAttempt,
  runGenerativePipeline,
  similarity,
} from './generative-item-pipeline';
import { buildGenerativeItemPrompt, generativeItemResponseFormat } from './generative-item-prompt';
import {
  GenerativeLlmClient,
  generationReasoningEffort,
  generativeModelForRole,
  verificationReasoningEffort,
  type GenerativeCompletionRequest,
} from './generative-llm.client';
import { conceptAliases, findConceptLeak } from './concept-leak';
import { legalReviewRules } from './legal-review-rules';
import { generativeConcurrency } from './generative-exam-generation.service';
import { isSourceBlocksStimulusData } from '../source-blocks-stimulus';
import type { GenerativeItemSpec } from './generative.types';

const band = { p25: 20, median: 30, p75: 40 };

function spec(overrides: Partial<GenerativeItemSpec> = {}): GenerativeItemSpec {
  return {
    id: 'gen_test',
    ordinal: 1,
    subject: 'kongil',
    unitNumber: 10,
    unitTitle: '구매·자재 관리',
    examFocus: '',
    targetConcept: {
      name: '정량 발주 방식',
      definition: '재고가 발주점에 이르면 일정량을 발주하는 방식',
      keyFacts: [],
      diagnosticCues: [],
      confusableWith: ['정기 발주 방식'],
      weight: 3,
    },
    companionConcepts: [],
    confusionPairs: [],
    responseMode: 'truth_combination',
    polarity: 'positive',
    stemEnding: '옳은 것만을 <보기>에서 있는 대로 고른 것은?',
    stemOpening: 'direct',
    stemExamples: [],
    conditionClause: false,
    material: { genre: '보고서', blockShape: 'text+table', construction: '', labelling: '', share: 1 },
    stimulusShape: 'table+text',
    scenarioArchetype: '재고 관리 개선',
    viewKeys: ['ㄱ', 'ㄴ', 'ㄷ'],
    comboChoiceSet: ['ㄱ', 'ㄴ', 'ㄱㄷ', 'ㄴㄷ', 'ㄱㄴㄷ'],
    trueViewKeys: ['ㄱ', 'ㄷ'],
    answerIndex: 3,
    falseTechniques: ['개념 바꿔치기'],
    trueStatementPatterns: [],
    difficulty: Difficulty.MIDDLE,
    points: 2,
    difficultyLevers: [],
    lengths: {
      stem: { p25: 40, median: 55, p75: 70 },
      stimulus: { p25: 80, median: 200, p75: 300 },
      viewItem: band,
      choice: band,
    },
    toneAndRegister: '',
    numericConventions: '',
    pitfallsToAvoid: [],
    diversityHint: '가구 제조 기업',
    unitDifficultyTier: 'hard',
    ...overrides,
  };
}

const comboOutput = (truths: [boolean, boolean, boolean] = [true, false, true]) => JSON.stringify({
  design: { scenario: '가구 기업 재고 관리', clues: ['재고가 일정 수준이 되면 발주', '발주량 고정'] },
  blocks: [
    { type: 'text', text: '○○ 가구 기업은 원목 재고가 미리 정한 수준까지 줄어들면 매번 같은 양을 주문하는 방식으로 자재를 관리하고 있다.', title: '', headers: [], rows: [], lines: [] },
    { type: 'table', text: '', title: '자재 관리 현황', headers: ['구분', '내용'], rows: [['발주 시점', '재고 200개 도달 시'], ['발주량', '매회 1,000개']], lines: [] },
  ],
  stem: '다음 자료에 나타난 자재 관리 방식에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
  viewItems: [
    { key: 'ㄱ', text: 'ㄱ. 발주 시점은 재고 수준에 따라 달라진다.', truth: truths[0], basis: '재고 200개 도달 시' },
    { key: 'ㄴ', text: '발주 주기가 일정하고 발주량이 매번 달라진다.', truth: truths[1], basis: '정기 발주와 혼동' },
    { key: 'ㄷ', text: '조달 기간 동안의 수요를 고려해 발주점을 정한다.', truth: truths[2], basis: '발주점' },
  ],
  explanation: {
    intent: '정량 발주 방식의 특징을 이해하는가?',
    solution: 'ㄱ은 옳다. ㄴ은 정기 발주 방식의 특징이므로 옳지 않다. ㄷ은 옳다.',
    distractorNotes: ['ㄴ. 발주 주기가 일정한 것은 정기 발주 방식이다.'],
  },
});

/** 중복 검사에 걸리지 않도록 소재만 바꾼 보기형 출력 */
const distinctCombo = (index: number) => {
  const raw = JSON.parse(comboOutput());
  const settings = ['가구 제조 기업의 원목', '식품 공장의 밀가루 포대', '전자 부품 회사의 칩 저항'];
  const tables = [
    [['점검 주기', '매주 월요일 오전'], ['보충 기준', '선반 재고 300단위 이하']],
    [['입고 방식', '협력 업체 직송 트럭'], ['안전 재고', '사흘 사용분 유지']],
    [['창고 위치', '본관 지하 2층'], ['관리 인원', '물류 담당 4명 교대']],
  ];
  raw.blocks[0].text = `${settings[index % settings.length]} 재고가 미리 정한 수준까지 줄어들면 담당자는 매번 같은 수량을 거래처에 주문하며, 주문한 물량은 일주일 안에 입고된다.`;
  raw.blocks[1].title = `${settings[index % settings.length]} 관리표`;
  raw.blocks[1].rows = tables[index % tables.length];
  return JSON.stringify(raw);
};

const withDevices = (content: string) => {
  const raw = JSON.parse(content);
  raw.design.difficultyDevices = ['표 수치로 발주점 계산'];
  return JSON.stringify(raw);
};

describe('generative exam engine', () => {
  describe('planner', () => {
    const request = {
      subject: 'kongil' as const,
      startUnitNum: 1,
      endUnitNum: 20,
      questionCount: 20,
      difficulty: Difficulty.HIGH,
      seed: 'seed-1',
    };

    it('plans a full exam that mirrors the real exam distribution and is deterministic', () => {
      const plan = planGenerativeExam(request);
      expect(plan).toHaveLength(20);
      expect(planGenerativeExam(request).map((item) => item.id)).toEqual(plan.map((item) => item.id));
      expect(plan.every((item) => item.unitNumber >= 1 && item.unitNumber <= 20)).toBe(true);
      expect(new Set(plan.map((item) => item.unitNumber)).size).toBeGreaterThanOrEqual(15);
      // 실제 공일 모의평가는 보기형이 다수다.
      const combos = plan.filter((item) => item.responseMode === 'truth_combination').length;
      expect(combos).toBeGreaterThanOrEqual(8);
      expect(plan.filter((item) => item.polarity === 'negative').length).toBeLessThanOrEqual(2);
      const answers = plan.map((item) => item.answerIndex);
      for (const answer of [1, 2, 3, 4, 5]) {
        expect(answers.filter((value) => value === answer).length).toBeGreaterThanOrEqual(3);
      }
      expect(answers.some((answer, index) => index >= 2 && answer === answers[index - 1] && answer === answers[index - 2])).toBe(false);
    });

    it('follows the real block-shape mix instead of collapsing into dialogue', () => {
      const shapes = planGenerativeExam({ ...request, subject: 'success', startUnitNum: 1, endUnitNum: 3, questionCount: 10, difficulty: Difficulty.MIDDLE })
        .map((item) => item.stimulusShape);
      const dialogue = shapes.filter((shape) => shape.startsWith('dialogue')).length;
      expect(dialogue).toBeLessThanOrEqual(5);
      expect(new Set(shapes).size).toBeGreaterThanOrEqual(3);
    });

    it('fixes the true 보기 set from the planned answer position', () => {
      for (const item of planGenerativeExam(request).filter((entry) => entry.responseMode === 'truth_combination')) {
        expect(item.comboChoiceSet).toHaveLength(5);
        expect(item.trueViewKeys?.join('')).toBe(item.comboChoiceSet?.[item.answerIndex - 1]);
        expect(item.stemEnding).toMatch(/<보기>/u);
      }
    });

    it('keeps response mode and answer when replanning a failed slot', () => {
      const [first] = planGenerativeExam(request);
      const replanned = replanGenerativeItem(request, first, 3, []);
      expect(replanned.responseMode).toBe(first.responseMode);
      expect(replanned.answerIndex).toBe(first.answerIndex);
      expect(replanned.id).not.toBe(first.id);
    });

    it('plans ~30% reserves after the main ordinals with different concepts', () => {
      const main = planGenerativeExam({ ...request, questionCount: 10 });
      const reserves = planGenerativeReserves({ ...request, questionCount: 10 }, main);
      expect(reserves).toHaveLength(3);
      expect(reserves.map((item) => item.ordinal)).toEqual([11, 12, 13]);
      const mainConcepts = new Set(main.map((item) => item.targetConcept.name));
      expect(reserves.filter((item) => mainConcepts.has(item.targetConcept.name)).length).toBe(0);
      expect(new Set([...main, ...reserves].map((item) => item.id)).size).toBe(13);
    });

    it('runs every slot at once by default and honours a numeric limit', () => {
      expect(generativeConcurrency(13, {})).toBe(13);
      expect(generativeConcurrency(13, { AI_GENERATIVE_CONCURRENCY: 'auto' })).toBe(13);
      expect(generativeConcurrency(13, { AI_GENERATIVE_CONCURRENCY: '6' })).toBe(6);
      expect(generativeConcurrency(40, {})).toBe(26);
    });

    it('distributes counts with the largest remainder method', () => {
      expect(largestRemainder({ a: 0.5, b: 0.3, c: 0.2 }, 10).sort()).toEqual(
        ['a', 'a', 'a', 'a', 'a', 'b', 'b', 'b', 'c', 'c'],
      );
    });
  });

  describe('prompt', () => {
    it('states fixed truth values and the exact stem ending', () => {
      const prompt = buildGenerativeItemPrompt(spec());
      expect(prompt).toContain('ㄱ: 참');
      expect(prompt).toContain('ㄴ: 거짓');
      expect(prompt).toContain('옳은 것만을 <보기>에서 있는 대로 고른 것은?');
      const format = generativeItemResponseFormat(spec());
      expect(format.json_schema.strict).toBe(true);
      expect(format.json_schema.schema.required).toContain('viewItems');
    });
  });

  describe('validator and assembler', () => {
    it('assembles a truth-combination item with server-owned answer and combo choices', () => {
      const candidate = parseGenerativeCandidate(comboOutput(), spec());
      expect(validateGenerativeCandidate(spec(), candidate)).toEqual([]);
      const question = assembleGenerativeQuestion(spec(), candidate);
      expect(question.optionsList).toEqual(['① ㄱ', '② ㄴ', '③ ㄱ, ㄷ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ']);
      expect(question.correctAnswer).toBe(3);
      expect(question.comboBlock?.items[0]).toEqual({ key: 'ㄱ', text: '발주 시점은 재고 수준에 따라 달라진다.' });
      expect(question.recommendedTemplate).toBe('TPL_SOURCE_BLOCKS');
      expect(isSourceBlocksStimulusData(question.stimulusData)).toBe(true);
      expect(question.explanation.judgment).toMatch(/^\[출제 의도\]/u);
      expect(renderForSolver(question)).not.toContain('출제 의도');
    });

    it('rejects a candidate whose truth values differ from the plan', () => {
      const candidate = parseGenerativeCandidate(comboOutput([true, true, true]), spec());
      expect(validateGenerativeCandidate(spec(), candidate).map((issue) => issue.code)).toContain('GEN_TRUTH_PLAN_MISMATCH');
    });

    it('rejects a stem that does not end with the planned ending', () => {
      const raw = JSON.parse(comboOutput());
      raw.stem = '다음 자료에 대한 설명으로 옳은 것은?';
      const issues = validateGenerativeCandidate(spec(), parseGenerativeCandidate(JSON.stringify(raw), spec()));
      expect(issues.map((issue) => issue.code)).toContain('GEN_STEM_INVALID');
    });

    it('places a statement keyed choice at the planned position and catches answer leaks in short labels', () => {
      const statementSpec = spec({
        responseMode: 'short_label',
        stemEnding: '가장 적절한 것은?',
        stimulusShape: 'text',
        answerIndex: 2,
        viewKeys: undefined,
        comboChoiceSet: undefined,
        trueViewKeys: undefined,
        lengths: { ...spec().lengths, choice: { p25: 3, median: 5, p75: 8 } },
      });
      const raw = JSON.parse(comboOutput());
      delete raw.viewItems;
      raw.blocks = [raw.blocks[0]];
      raw.stem = '다음 자료에 나타난 자재 관리 방식으로 가장 적절한 것은?';
      raw.keyedChoice = { text: '정량 발주 방식', basis: '' };
      raw.otherChoices = ['정기 발주 방식', '자재 소요 계획', 'ABC 관리', '단순화법'].map((text) => ({ text, basis: '' }));
      const candidate = parseGenerativeCandidate(JSON.stringify(raw), statementSpec);
      expect(validateGenerativeCandidate(statementSpec, candidate)).toEqual([]);
      expect(assembleGenerativeQuestion(statementSpec, candidate).optionsList[1]).toBe('② 정량 발주 방식');

      raw.blocks[0].text += ' 이는 정량 발주 방식에 해당한다.';
      const leaked = parseGenerativeCandidate(JSON.stringify(raw), statementSpec);
      expect(validateGenerativeCandidate(statementSpec, leaked).map((issue) => issue.code)).toContain('GEN_ANSWER_LEAK');
    });
  });

  describe('answer leak and difficulty gates', () => {
    it('derives aliases from parentheses, conjunctions and generic suffixes', () => {
      expect(conceptAliases('SQC(통계적 품질 관리)')).toEqual(expect.arrayContaining(['SQC', '통계적 품질 관리']));
      expect(conceptAliases('직무 분석과 직무 평가')).toEqual(expect.arrayContaining(['직무 분석', '직무 평가']));
      expect(conceptAliases('정량 발주 방식')).toEqual(expect.arrayContaining(['정량 발주']));
    });

    it('flags concept names and same-sentence distinctive words in the stimulus', () => {
      expect(findConceptLeak('정량 발주 방식', '이 기업은 정량 발주를 택했다.')).toBe('정량 발주');
      expect(findConceptLeak('SQC(통계적 품질 관리)', '통계적 방법으로 품질 변동을 관리한다.')).toBe('통계적 품질 관리');
      expect(findConceptLeak('SQC(통계적 품질 관리)', '반도체 품질을 높이려 한다. 불량 수를 공정별로 기록했다.')).toBeNull();
    });

    it('rejects a stimulus that names the target concept and a 3-point item without difficulty devices', () => {
      const raw = JSON.parse(comboOutput());
      raw.blocks[0].text = '○○ 가구 기업은 정량 발주 방식으로 원목 재고를 관리하고 있으며 재고가 기준 아래로 떨어지면 같은 양을 주문한다.';
      const codes = validateGenerativeCandidate(spec({ points: 3 }), parseGenerativeCandidate(JSON.stringify(raw), spec()))
        .map((issue) => issue.code);
      expect(codes).toEqual(expect.arrayContaining(['GEN_ANSWER_LEAK', 'GEN_TOO_EASY']));
    });

    it('rejects stimulus labels that the question never asks about', () => {
      expect(unusedStimulusLabels('작업 (가) 품질 (나) 인적 (다)', 'ㄱ. (가)는 과학적 관리법이다. ㄴ. (나)는 파레토도이다.')).toEqual(['(다)']);
      expect(unusedStimulusLabels('㉠ 활동', '㉠은 품질 분임조이다.')).toEqual([]);
      const raw = JSON.parse(comboOutput());
      raw.blocks[1].rows[0][0] = '(가) 발주 시점';
      const codes = validateGenerativeCandidate(spec(), parseGenerativeCandidate(JSON.stringify(raw), spec())).map((issue) => issue.code);
      expect(codes).toContain('GEN_STIMULUS_INVALID');
    });

    it('repairs unused labels instead of throwing the whole item away', () => {
      const raw = JSON.parse(comboOutput());
      raw.blocks[0].text = '(가) ○○ 가구 기업은 원목 재고가 미리 정한 수준까지 줄어들면 매번 같은 양을 주문한다. (나) 주문 물량은 일주일 안에 들어온다.';
      const repaired = repairUnusedLabels(parseGenerativeCandidate(JSON.stringify(raw), spec()));
      expect(repaired.blocks[0].text).toBe('○○ 가구 기업은 원목 재고가 미리 정한 수준까지 줄어들면 매번 같은 양을 주문한다. 주문 물량은 일주일 안에 들어온다.');
      expect(validateGenerativeCandidate(spec(), repaired).map((issue) => issue.code)).not.toContain('GEN_STIMULUS_INVALID');

      // 표 칸 전체가 라벨(빈칸)이면 고치지 않고 검증에서 반려되게 둔다.
      raw.blocks[1].rows[0][1] = '(가)';
      const blank = repairUnusedLabels(parseGenerativeCandidate(JSON.stringify(raw), spec()));
      expect(blank.blocks[1].rows[0][1]).toBe('(가)');
    });

    it('rejects a stimulus that opens like a stem', () => {
      const raw = JSON.parse(comboOutput());
      raw.blocks[0].text = '다음은 ○○ 가구 기업의 자재 관리 보고서이다. ' + raw.blocks[0].text;
      const issues = validateGenerativeCandidate(spec(), parseGenerativeCandidate(JSON.stringify(raw), spec()));
      expect(issues.map((issue) => issue.message).join(' ')).toContain('다음은');
    });

    it('cross-verifies with the other model family by default', () => {
      expect(generativeModelForRole('verification', { AI_GENERATION_MODEL: 'gemini-3.8-flash', OPENAI_API_KEY: 'k' })).toBe('gpt-4.1');
      expect(generativeModelForRole('verification', { AI_GENERATION_MODEL: 'gpt-4.1', GEMINI_API_KEY: 'k' })).toBe('gemini-3.8-flash');
      expect(generativeModelForRole('verification', { AI_GENERATION_MODEL: 'gpt-4.1' })).toBe('gpt-4.1');
      expect(generativeModelForRole('verification', { AI_GENERATION_MODEL: 'gpt-4.1', AI_VERIFICATION_MODEL: 'o-x' })).toBe('o-x');
    });
  });

  describe('pipeline', () => {
    it('retries with reviewer feedback when the blind solve disagrees, then accepts', async () => {
      const requests: GenerativeCompletionRequest[] = [];
      let solves = 0;
      const llm = new GenerativeLlmClient({
        complete: async (request) => {
          requests.push(request);
          if (request.role === 'generation') return { content: comboOutput(), model: 'fake-gen' };
          solves += 1;
          return {
            content: JSON.stringify({
              reasoning: 'ㄱ, ㄷ 참',
              answerIndex: solves === 1 ? 5 : 3,
              ambiguity: 'none',
              curriculumIssues: [],
            }),
            model: 'fake-verify',
          };
        },
      });
      const result = await runGenerativePipeline([spec()], llm, { concurrency: 1 });
      expect(result.accepted).toHaveLength(1);
      expect(result.accepted[0].attempt).toBe(2);
      expect(result.rejected.map((item) => item.code)).toEqual(['GEN_BLIND_SOLVE_MISMATCH']);
      const secondGeneration = requests.filter((request) => request.role === 'generation')[1];
      expect(secondGeneration.user).toContain('이전 시도 반려 사유');
    });

    it('rejects a 3-point item when the reviewer marks a read-only statement', async () => {
      const llm = new GenerativeLlmClient({
        complete: async (request) => request.role === 'generation'
          ? { content: withDevices(comboOutput()), model: 'fake-gen' }
          : {
              content: JSON.stringify({
                reasoning: 'ㄱ, ㄷ 참', answerIndex: 3, ambiguity: 'none', curriculumIssues: [],
                answerGivenAway: false, perceivedDifficulty: 'moderate', trivialStatements: ['ㄴ'],
              }),
              model: 'fake-verify',
            },
      });
      const threePoint = spec({ points: 3 });
      const result = await runGenerativePipeline([threePoint], llm, { concurrency: 1, maxAttempts: 4 });
      expect(result.accepted).toHaveLength(0);
      expect(result.rejected.map((item) => item.message)).toEqual(
        Array(4).fill('검토자: 단순 읽기 진술 ㄴ'),
      );
      const twoPoint = await runGenerativePipeline([spec()], llm, { concurrency: 1 });
      expect(twoPoint.accepted).toHaveLength(1);
    });

    it('rejects items the reviewer says give the answer away', async () => {
      let solves = 0;
      const llm = new GenerativeLlmClient({
        complete: async (request) => {
          if (request.role === 'generation') return { content: comboOutput(), model: 'fake-gen' };
          solves += 1;
          return {
            content: JSON.stringify({
              reasoning: '제시문에 개념이 그대로 있음',
              answerIndex: 3,
              ambiguity: 'none',
              curriculumIssues: [],
              answerGivenAway: solves === 1,
              perceivedDifficulty: 'moderate',
            }),
            model: 'fake-verify',
          };
        },
      });
      const result = await runGenerativePipeline([spec()], llm, { concurrency: 1 });
      expect(result.rejected.map((item) => item.code)).toEqual(['GEN_TOO_EASY']);
      expect(result.accepted).toHaveLength(1);
    });

    it('defaults to 3 attempts and switches to a replanned spec halfway', async () => {
      expect(generativeMaxAttempts({})).toBe(3);
      expect(replanFromAttempt(3)).toBe(2);
      expect(generativeMaxAttempts({ AI_GENERATIVE_MAX_ATTEMPTS: '10' })).toBe(6);
      expect(replanFromAttempt(4)).toBe(3);
      const seen: string[] = [];
      const llm = new GenerativeLlmClient({
        complete: async (request) => {
          if (request.role === 'generation') {
            seen.push(request.user.includes('# 출제 명세 (gen_replanned)') ? 'replanned' : 'original');
            return { content: '{}', model: 'fake' };
          }
          throw new Error('unreachable');
        },
      });
      await runGenerativePipeline([spec()], llm, {
        concurrency: 1,
        maxAttempts: 4,
        replan: (failed) => ({ ...failed, id: 'gen_replanned' }),
      });
      expect(seen).toEqual(['original', 'original', 'replanned', 'replanned']);
    });

    it('moves a leading (단, …) condition behind the question, keeping nested parentheses', () => {
      expect(normalizeStem('(단, 하렌(Harren, V. A.)의 이론에 근거한다.) 다음 대화에 대한 설명으로 적절한 것은?'))
        .toBe('다음 대화에 대한 설명으로 적절한 것은? (단, 하렌(Harren, V. A.)의 이론에 근거한다.)');
      expect(normalizeStem('다음 자료에 대한 설명으로 옳은 것은?')).toBe('다음 자료에 대한 설명으로 옳은 것은?');
    });

    it('repairs stems that do not open with "다음"', () => {
      expect(normalizeStem('위 사례 보고서를 통해 알 수 있는 내용으로 적절한 것은?')).toBe('다음 사례 보고서를 통해 알 수 있는 내용으로 적절한 것은?');
      expect(normalizeStem('고용 센터 상담 사례를 통해 알 수 있는 내용으로 옳은 것은?')).toBe('다음 고용 센터 상담 사례를 통해 알 수 있는 내용으로 옳은 것은?');
      expect(normalizeStem('○○ 기업의 회의록이다. 이에 대한 설명으로 옳은 것은?')).toBe('다음은 ○○ 기업의 회의록이다. 이에 대한 설명으로 옳은 것은?');
    });

    it('moves a mid-stem (단, …) condition to the end', () => {
      expect(normalizeStem('다음은 학생 A와 선배 B의 대화이다. (단, 해비거스트의 생애 발달 이론에 근거한다.) 이에 대한 설명으로 옳은 것만을 <보기>에서 고른 것은?'))
        .toBe('다음은 학생 A와 선배 B의 대화이다. 이에 대한 설명으로 옳은 것만을 <보기>에서 고른 것은? (단, 해비거스트의 생애 발달 이론에 근거한다.)');
    });

    it('rejects list-like dialogue made of short one-line turns', () => {
      const shortTurns = ['주말에 번 돈으로 식비를 해결하고 싶어요.', '오래 일할 수 있는 곳이 좋아요.', '일이 자주 달라지면 좋겠어요.', '맡은 일이 있어야 동네가 돌아가요.'];
      expect(dialogueShapeIssue(shortTurns)).toContain('가장 긴 발화');
      expect(dialogueShapeIssue(Array(6).fill('충분히 긴 발화 문장입니다. 상황과 동기와 행동과 결과를 모두 이어서 말하는 발화입니다.'))).toContain('6개');
      expect(dialogueShapeIssue([
        '요즘 일은 어떠세요?',
        '졸업하고 부품 공장 조립 라인에 들어가 올해로 4년째예요. 처음엔 설비 점검과 품질 기록 쓰는 법부터 다시 배웠고, 지금은 야간 대학에 다니면서 신입 교육도 맡고 있어요.',
      ])).toBeNull();
    });

    it('rejects a vacuous "(단, 제시문에 드러난 내용만으로 판단한다.)" condition', () => {
      const raw = JSON.parse(comboOutput());
      raw.stem = '다음 자료에 나타난 자재 관리 방식에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은? (단, 제시문에 드러난 내용만으로 판단한다.)';
      const issues = validateGenerativeCandidate(spec(), parseGenerativeCandidate(JSON.stringify(raw), spec()));
      expect(issues.map((issue) => issue.message).join(' ')).toContain('판정 기준을 주지 않는 조건');
    });

    it('records a canceled call as GEN_CANCELED, not as a timeout', async () => {
      const controller = new AbortController();
      const llm = new GenerativeLlmClient({
        complete: (request) => new Promise((_, reject) => {
          request.signal.addEventListener('abort', () => reject(new Error('aborted')));
          setTimeout(() => controller.abort(), 5);
        }),
      });
      const result = await runGenerativePipeline([spec()], llm, { concurrency: 1, signal: controller.signal });
      expect(result.rejected.map((item) => item.code)).toEqual(['GEN_CANCELED']);
    });

    it('reports staged progress with a human-readable activity', async () => {
      const states: { fraction: number; activity: string; items: readonly string[] }[] = [];
      let generations = 0;
      const llm = new GenerativeLlmClient({
        complete: async (request) => request.role === 'generation'
          ? { content: distinctCombo(++generations), model: 'fake-gen' }
          : {
              content: JSON.stringify({
                reasoning: 'ok', answerIndex: 3, ambiguity: 'none', curriculumIssues: [],
                answerGivenAway: false, perceivedDifficulty: 'moderate', trivialStatements: [],
              }),
              model: 'fake-verify',
            },
      });
      await runGenerativePipeline([spec(), spec({ ordinal: 2, id: 'gen_2' })], llm, {
        concurrency: 1,
        onProgress: (state) => { states.push({ fraction: state.fraction, activity: state.activity, items: state.items }); },
      });
      expect(states.map((state) => state.activity)).toEqual([
        '1번 문항 출제 중',
        '1번 문항 검토 중 (정답을 모르는 상태로 다시 풀기)',
        '1번 문항 완성',
        '2번 문항 출제 중',
        '2번 문항 검토 중 (정답을 모르는 상태로 다시 풀기)',
        '2번 문항 완성',
      ]);
      const fractions = states.map((state) => state.fraction);
      expect(fractions).toEqual([...fractions].sort((left, right) => left - right));
      expect(fractions[fractions.length - 1]).toBe(1);
      expect(states.map((state) => state.items.join(','))).toEqual([
        'generating,queued',
        'verifying,queued',
        'accepted,queued',
        'accepted,generating',
        'accepted,verifying',
        'accepted,accepted',
      ]);
    });

    it('with hedging on, starts a reserve when a main item is first rejected and stops once the target is reached', async () => {
      const verifyOk = JSON.stringify({
        reasoning: 'ok', answerIndex: 3, ambiguity: 'none', curriculumIssues: [],
        answerGivenAway: false, perceivedDifficulty: 'moderate', trivialStatements: [],
      });
      const calls: string[] = [];
      const llm = new GenerativeLlmClient({
        complete: (request) => {
          const isReserve = request.user.includes('# 출제 명세 (gen_reserve)');
          if (request.role === 'verification') return Promise.resolve({ content: verifyOk, model: 'fake-verify' });
          calls.push(isReserve ? 'reserve' : 'main');
          if (isReserve) return Promise.resolve({ content: distinctCombo(1), model: 'fake-gen' });
          if (calls.filter((call) => call === 'main').length === 1) {
            const raw = JSON.parse(comboOutput());
            raw.stem = '자료를 보고 답하시오.';
            return Promise.resolve({ content: JSON.stringify(raw), model: 'fake-gen' });
          }
          // 본 문항의 재시도는 느리다. 예비 문항이 먼저 통과하면 취소되어야 한다.
          return new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(new Error('aborted'))));
        },
      });
      const states: string[] = [];
      const result = await runGenerativePipeline([spec({ id: 'gen_main' })], llm, {
        reserves: [spec({ id: 'gen_reserve', ordinal: 2 })],
        hedgeReserves: true,
        targetCount: 1,
        onProgress: (state) => { states.push(`${state.items.join(',')}|${state.reserveItems.join(',')}`); },
      });
      expect(result.accepted.map((item) => item.spec.id)).toEqual(['gen_reserve']);
      expect(result.rejected.map((item) => item.code)).toEqual(['GEN_STEM_INVALID', 'GEN_CANCELED']);
      expect(states.at(-1)).toBe('skipped|accepted');
    });

    it('by default starts a reserve only when the main item enters its last attempt', async () => {
      const verifyOk = JSON.stringify({
        reasoning: 'ok', answerIndex: 3, ambiguity: 'none', curriculumIssues: [],
        answerGivenAway: false, perceivedDifficulty: 'moderate', trivialStatements: [],
      });
      const calls: string[] = [];
      const llm = new GenerativeLlmClient({
        complete: async (request) => {
          if (request.role === 'verification') return { content: verifyOk, model: 'fake-verify' };
          const isReserve = request.user.includes('# 출제 명세 (gen_reserve)');
          calls.push(isReserve ? 'reserve' : 'main');
          if (isReserve) return { content: distinctCombo(1), model: 'fake-gen' };
          const raw = JSON.parse(comboOutput());
          raw.stem = '자료를 보고 답하시오.';
          return { content: JSON.stringify(raw), model: 'fake-gen' };
        },
      });
      const result = await runGenerativePipeline([spec({ id: 'gen_main' })], llm, {
        reserves: [spec({ id: 'gen_reserve', ordinal: 2 })],
        maxAttempts: 2,
        hedgeReserves: false,
      });
      expect(calls[0]).toBe('main');
      expect([...calls].sort()).toEqual(['main', 'main', 'reserve']);
      expect(result.accepted.map((item) => item.spec.id)).toEqual(['gen_reserve']);
      expect(result.rejected.map((item) => item.code)).not.toContain('GEN_CANCELED');
    });

    it('never starts a reserve when nothing is rejected', async () => {
      let generations = 0;
      const llm = new GenerativeLlmClient({
        complete: async (request) => request.role === 'generation'
          ? (generations += 1, { content: distinctCombo(generations), model: 'fake-gen' })
          : {
              content: JSON.stringify({
                reasoning: 'ok', answerIndex: 3, ambiguity: 'none', curriculumIssues: [],
                answerGivenAway: false, perceivedDifficulty: 'moderate', trivialStatements: [],
              }),
              model: 'fake-verify',
            },
      });
      const result = await runGenerativePipeline([spec(), spec({ id: 'gen_b', ordinal: 2 })], llm, {
        reserves: [spec({ id: 'gen_reserve', ordinal: 3 })],
      });
      expect(result.accepted).toHaveLength(2);
      expect(generations).toBe(2);
    });

    it('measures near-duplicate stimuli', () => {
      expect(similarity('가나다라마바사아', '가나다라마바사아')).toBe(1);
      expect(similarity('가나다라마바사아', '자차카타파하')).toBe(0);
    });
  });
});

describe('unit difficulty calibration and cost controls', () => {
  it('MIDDLE follows each unit\'s real exam 3-point share; HIGH is all 3-point; LOW is all 2-point', () => {
    const units = Array.from({ length: 20 }, () => 4).concat(Array.from({ length: 20 }, () => 10));
    const points = allocatePoints('kongil', units, Difficulty.MIDDLE, seededRandom('pts'));
    const share = (unit: number) => {
      const own = points.filter((_, index) => units[index] === unit);
      return own.filter((value) => value === 3).length / own.length;
    };
    // 공일 4단원(기출 3점 0%)은 거의 2점, 10단원(86%)은 대부분 3점
    expect(share(4)).toBeLessThan(0.25);
    expect(share(10)).toBeGreaterThan(0.6);
    expect(allocatePoints('kongil', units, Difficulty.HIGH, seededRandom('pts')).every((value) => value === 3)).toBe(true);
    expect(allocatePoints('kongil', units, Difficulty.INTERGRATE, seededRandom('pts')).every((value) => value === 3)).toBe(true);
    expect(allocatePoints('kongil', units, Difficulty.LOW, seededRandom('pts')).every((value) => value === 2)).toBe(true);
  });

  it('HIGH exams drop single-term concept questions and use 3-point items only', () => {
    for (const subject of ['kongil', 'success'] as const) {
      const plan = planGenerativeExam({ subject, startUnitNum: 1, endUnitNum: 20, questionCount: 20, difficulty: Difficulty.HIGH, seed: `hard-${subject}` });
      expect(plan.every((item) => item.points === 3)).toBe(true);
      expect(plan.some((item) => item.responseMode === 'short_label')).toBe(false);
    }
  });

  it('tags specs with the data-driven unit difficulty tier', () => {
    const plan = planGenerativeExam({ subject: 'success', startUnitNum: 1, endUnitNum: 1, questionCount: 2, difficulty: Difficulty.HIGH, seed: 't' });
    expect(plan.every((item) => item.unitDifficultyTier === 'easy')).toBe(true);
    const hard = planGenerativeExam({ subject: 'success', startUnitNum: 17, endUnitNum: 17, questionCount: 2, difficulty: Difficulty.HIGH, seed: 't' });
    expect(hard.every((item) => item.unitDifficultyTier === 'hard')).toBe(true);
  });

  it('spends reasoning by points: low/medium for writing, medium/high for blind solving', () => {
    expect(generationReasoningEffort({ points: 2 }, {})).toBe('low');
    expect(generationReasoningEffort({ points: 3 }, {})).toBe('medium');
    expect(generationReasoningEffort({ points: 2 }, { AI_GENERATION_REASONING_EFFORT: 'high' })).toBe('high');
    expect(verificationReasoningEffort(2, {})).toBe('medium');
    expect(verificationReasoningEffort(3, {})).toBe('high');
    expect(verificationReasoningEffort(3, { AI_VERIFICATION_REASONING_EFFORT: 'low' })).toBe('low');
  });

  it('passes the per-item reasoning effort to the provider', async () => {
    const efforts: string[] = [];
    const llm = new GenerativeLlmClient({
      complete: async (request) => {
        efforts.push(`${request.role}:${request.reasoningEffort}`);
        return request.role === 'generation'
          ? { content: comboOutput(), model: 'fake' }
          : { content: JSON.stringify({ reasoning: 'ok', answerIndex: 3, ambiguity: 'none', curriculumIssues: [], answerGivenAway: false, perceivedDifficulty: 'easy', trivialStatements: [] }), model: 'fake' };
      },
    });
    const result = await runGenerativePipeline([spec({ points: 2, difficulty: Difficulty.HIGH })], llm, {});
    expect(efforts).toEqual(['generation:low', 'verification:medium']);
    // 상 난이도 시험이어도 2점 문항은 쉬운 개념 확인형으로 받는다(3점만 easy 반려).
    expect(result.accepted).toHaveLength(1);
  });
});

describe('step-by-step explanation (conceptHighlightV2)', () => {
  const withSteps = (extra: Record<string, unknown> = {}) => {
    const raw = JSON.parse(comboOutput());
    raw.explanation = {
      ...raw.explanation,
      clues: [
        { quote: '재고가 미리 정한 수준까지 줄어들면', why: '발주점에 도달하면 주문하는 정량 발주의 단서' },
        { quote: '매회 1,000개', why: '발주량이 일정하다' },
        { quote: '제시문에 없는 문장', why: '버려져야 한다' },
      ],
      steps: ['① 표에서 발주 시점과 발주량을 확인한다.', '② 발주 시점이 재고 수준에 따라 정해지는지 본다.', '③ 정량 발주 기준을 <보기>에 적용한다.'],
      takeaway: '발주량이 고정이면 정량 발주, 발주 주기가 고정이면 정기 발주다.',
      ...extra,
    };
    return JSON.stringify(raw);
  };

  it('builds the study-screen highlight with server verdicts and only exact quotes', () => {
    const item = spec();
    const highlight = buildConceptHighlight(item, parseGenerativeCandidate(withSteps(), item));
    expect(highlight?.stimulusClues.map((clue) => clue.quote)).toEqual(['재고가 미리 정한 수준까지 줄어들면', '매회 1,000개']);
    expect(highlight?.optionAnalysis).toEqual([
      { optionKey: 'ㄱ', verdict: 'O', reasoning: '재고 200개 도달 시' },
      { optionKey: 'ㄴ', verdict: 'X', reasoning: '정기 발주와 혼동' },
      { optionKey: 'ㄷ', verdict: 'O', reasoning: '발주점' },
    ]);
    expect(highlight?.solvingFlow).toEqual([
      { step: 1, action: '표에서 발주 시점과 발주량을 확인한다.' },
      { step: 2, action: '발주 시점이 재고 수준에 따라 정해지는지 본다.' },
      { step: 3, action: '정량 발주 기준을 <보기>에 적용한다.' },
    ]);
    const assembled = assembleGenerativeQuestion(item, parseGenerativeCandidate(withSteps(), item));
    expect(assembled.explanation.conceptHighlightV2).toEqual(highlight);
    expect(assembled.explanation.judgment).toContain('[해설]');
  });

  it('marks the keyed choice X for "옳지 않은 것" items and the rest O, in final option order', () => {
    const item = spec({ responseMode: 'statement', polarity: 'negative', answerIndex: 2, viewKeys: undefined, trueViewKeys: undefined, comboChoiceSet: undefined });
    const raw = JSON.parse(withSteps());
    delete raw.viewItems;
    raw.keyedChoice = { text: '틀린 진술', basis: '정기 발주의 특징이다.' };
    raw.otherChoices = ['가', '나', '다', '라'].map((label) => ({ text: `옳은 진술 ${label}`, basis: `${label} 근거` }));
    const highlight = buildConceptHighlight(item, parseGenerativeCandidate(JSON.stringify(raw), item));
    expect(highlight?.optionAnalysis.map((entry) => ('optionNum' in entry ? `${entry.optionNum}${entry.verdict}` : ''))).toEqual(['1O', '2X', '3O', '4O', '5O']);
    expect(highlight?.optionAnalysis[1]).toMatchObject({ reasoning: '정기 발주의 특징이다.' });
  });

  it('omits the highlight (keeps the text explanation) when no quote matches the stimulus', () => {
    const item = spec();
    const candidate = parseGenerativeCandidate(withSteps({ clues: [{ quote: '없는 문장', why: 'x' }, { quote: '또 없는 문장', why: 'y' }] }), item);
    expect(buildConceptHighlight(item, candidate)).toBeNull();
    expect(assembleGenerativeQuestion(item, candidate).explanation).not.toHaveProperty('conceptHighlightV2');
  });
});

describe('labor-law consistency rules (성직 15~19단원)', () => {
  it('applies only to the success law units and covers the reviewer-reported errors', () => {
    expect(legalReviewRules('kongil', 16)).toEqual([]);
    expect(legalReviewRules('success', 3)).toEqual([]);
    const unit16 = legalReviewRules('success', 16).join('\n');
    expect(unit16).toContain('직접 생산 공정');
    expect(unit16).toContain('상시 근로자 수');
    expect(unit16).toContain('비교 대상 근로자');
    expect(legalReviewRules('success', 17).join('\n')).toContain('"실업 인정"은 수급 자격이 인정된 사람에게만');
    expect(legalReviewRules('success', 18).join('\n')).toContain('직장적응훈련비·재활운동비는 사업주에게');
  });

  it('uses labor-exam false-statement techniques first in law units', () => {
    const plan = planGenerativeExam({ subject: 'success', startUnitNum: 16, endUnitNum: 16, questionCount: 4, difficulty: Difficulty.MIDDLE, seed: 'law-tech' });
    for (const item of plan) {
      expect(item.falseTechniques[0]).toMatch(/^(기관·주체 교체|의무 강도 교체|기한·수치 교체|적용 범위 뒤집기|요건 하나 빼기)/);
    }
    const kongil = planGenerativeExam({ subject: 'kongil', startUnitNum: 16, endUnitNum: 16, questionCount: 2, difficulty: Difficulty.MIDDLE, seed: 'law-tech' });
    expect(kongil.flatMap((item) => item.falseTechniques).some((technique) => technique.startsWith('의무 강도 교체'))).toBe(false);
    expect(legalReviewRules('success', 15).join('\n')).toContain('해고 시기 제한');
  });

  it('puts the rules in the writing prompt and the blind-solve prompt', async () => {
    const lawSpec = spec({ subject: 'success', unitNumber: 17, unitTitle: '고용 서비스와 사회 제도' });
    expect(buildGenerativeItemPrompt(lawSpec)).toContain('## 법적 정합성');
    expect(buildGenerativeItemPrompt(spec())).not.toContain('## 법적 정합성');
    const users: string[] = [];
    const llm = new GenerativeLlmClient({
      complete: async (request) => {
        if (request.role === 'verification') users.push(request.user);
        return request.role === 'generation'
          ? { content: comboOutput(), model: 'fake' }
          : { content: JSON.stringify({ reasoning: 'ok', answerIndex: 3, ambiguity: 'none', curriculumIssues: [], answerGivenAway: false, perceivedDifficulty: 'moderate', trivialStatements: [] }), model: 'fake' };
      },
    });
    await runGenerativePipeline([lawSpec], llm, {});
    expect(users[0]).toContain('[법적 정합성 점검 항목]');
    expect(users[0]).toContain('실업 인정');
  });
});

describe('generative explanations and concept fit', () => {
  it('explains each wrong pair-table row by its own wrong cells, not by note order', () => {
    const notes = ['36,000원은 가산수당을 더한 값이다.', '8일은 1개월 개근 연차를 센 값이다.', '15일은 1년 80% 출근 연차이다.'];
    const reason = pairRowReason(['(가)', '(나)'], ['24,000원', '발생하지 않음'], ['36,000원', '8일'], notes);
    expect(reason).toContain('(가)에는 ‘36,000원’ 대신 ‘24,000원’이 들어가야 한다.');
    expect(reason).toContain('(나)에는 ‘8일’ 대신 ‘발생하지 않음’이 들어가야 한다.');
    expect(reason).toContain(notes[0]);
    expect(reason).toContain(notes[1]);
    expect(reason).not.toContain(notes[2]);
  });

  it('gives statement-format signature items a concept that matches the server statements', () => {
    const plan = planGenerativeExam({ subject: 'success', startUnitNum: 15, endUnitNum: 18, questionCount: 20, difficulty: Difficulty.HIGH, seed: 'concept-fit' });
    const keywords: Record<string, readonly string[]> = {
      labor: ['근로시간', '주휴', '연차', '퇴직금', '5명 미만'],
      dismissal_remedy: ['해고'],
      night_work: ['야간', '연장', '연소', '미성년자'],
      job_seeking_benefit: ['소정급여일수', '구직급여', '취업촉진'],
    };
    const statementItems = plan.filter((item) => item.calculation?.format === 'statements');
    expect(statementItems.length).toBeGreaterThan(0);
    for (const item of statementItems) {
      const words = keywords[item.calculation?.kind ?? ''] ?? [];
      expect(words.some((word) => item.targetConcept.name.includes(word))).toBe(true);
    }
  });
});

describe('ultra-hard mode (skill)', () => {
  const VIEWS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'] as const;
  const toggle = (option: string, key: string) =>
    VIEWS.filter((view) => (view === key ? !option.includes(view) : option.includes(view))).join('');

  it('builds <보기> choice sets with no elimination shortcut: every 보기 must be judged', () => {
    for (const answer of [3, 4, 5]) {
      for (let seed = 0; seed < 30; seed += 1) {
        const options = shortcutFreeChoiceSet(VIEWS, answer, seededRandom(`ultra-${answer}-${seed}`));
        expect(new Set(options).size).toBe(5);
        expect(options.every((option) => option.length > 0)).toBe(true);
        expect([...options].sort((a, b) => a.length - b.length || (a < b ? -1 : 1))).toEqual(options);
        const keyed = options[answer - 1] ?? '';
        // 어느 보기 하나라도 판정하지 않으면, 그 보기만 다른 선지가 함께 남는다.
        for (const view of VIEWS) expect(options).toContain(toggle(keyed, view));
      }
    }
    expect(() => shortcutFreeChoiceSet(VIEWS, 1, seededRandom('x'))).toThrow();
    expect(() => shortcutFreeChoiceSet(VIEWS, 2, seededRandom('x'))).toThrow();
  });

  it('plans ultra exams with 3-point combo/statement items, no fixed calc statements, and balanced answers', () => {
    const plan = planGenerativeExam({ subject: 'success', startUnitNum: 15, endUnitNum: 18, questionCount: 10, difficulty: Difficulty.HIGH, seed: 'ultra', ultra: true });
    expect(plan.every((item) => item.ultra === true && item.points === 3 && item.calculation === undefined)).toBe(true);
    expect(new Set(plan.map((item) => item.responseMode))).toEqual(new Set(['truth_combination', 'statement']));
    for (const item of plan.filter((entry) => entry.responseMode === 'truth_combination')) {
      expect(item.answerIndex).toBeGreaterThanOrEqual(3);
      const keyed = item.comboChoiceSet?.[item.answerIndex - 1] ?? '';
      for (const view of item.viewKeys ?? []) expect(item.comboChoiceSet).toContain(toggle(keyed, view));
    }
    expect(plan.some((item) => item.answerIndex <= 2)).toBe(true);
    const [single] = planGenerativeExam({ subject: 'success', startUnitNum: 15, endUnitNum: 18, questionCount: 1, difficulty: Difficulty.HIGH, seed: 'ultra-one', ultra: true });
    expect(single.responseMode).toBe('truth_combination');
    expect(buildGenerativeItemPrompt(single)).toContain('## 초고난도');
    const replanned = replanGenerativeItem({ subject: 'success', startUnitNum: 15, endUnitNum: 18, questionCount: 1, difficulty: Difficulty.HIGH, seed: 'ultra-one', ultra: true }, single, 2, []);
    expect(replanned.ultra).toBe(true);
    expect(replanned.calculation).toBeUndefined();
    expect(replanned.answerIndex).toBe(single.answerIndex);
  });

  it('rejects ultra items unless the blind reviewer rates them hard', () => {
    const solve = (perceivedDifficulty: 'easy' | 'moderate' | 'hard') => ({
      answerIndex: 3 as const, ambiguity: 'none' as const, curriculumIssues: [], answerGivenAway: false, trivialStatements: [], perceivedDifficulty, reasoning: 'r',
    });
    const spec = { answerIndex: 3 as const, points: 3 as const, difficulty: Difficulty.HIGH, ultra: true };
    expect(blindSolveRejection(spec, solve('moderate'))).toMatchObject({ code: 'GEN_TOO_EASY' });
    expect(blindSolveRejection(spec, solve('hard'))).toBeNull();
    expect(blindSolveRejection({ ...spec, ultra: undefined }, solve('moderate'))).toBeNull();
  });
});

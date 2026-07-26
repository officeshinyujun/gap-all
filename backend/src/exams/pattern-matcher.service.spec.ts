import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  PatternMatcherService,
  QuestionDnaV2,
} from './pattern-matcher.service';

const makeDna = (overrides: Partial<QuestionDnaV2> = {}): QuestionDnaV2 => ({
  schemaVersion: 2,
  dnaId: 'dna-v2-success-1-1-test',
  subject: 'success',
  unitNumber: 1,
  targetConcepts: ['직업 가치'],
  difficulty: 'MIDDLE',
  itemFamily: 'truth_combination',
  provenance: {
    sourceHash: 'sha256:test',
    sourceType: 'suteck',
    sourceExam: 'test.pdf',
    questionNumber: 1,
  },
  materialContract: {
    materialKind: 'case',
    requiredTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
    requiredFields: ['case_profile', 'narrative'],
    metadataRequirements: [],
    requiresVisualParity: true,
  },
  stemContract: {
    materialReference: '두 개의 독립된 사례 사실',
    judgmentTarget: '직업 가치 판단',
    polarity: 'positive',
    responseMode: 'truth_combination',
    requiredEntityLabels: ['A씨'],
    forbiddenGenericPatterns: [],
  },
  solutionContract: {
    minimumReasoningSteps: 3,
    evidenceSlots: [
      {
        id: 'E1',
        sourceUnitId: 'F1',
        sourceLocation: '사례 첫 문장',
        evidence: '첫 번째 결정 사실',
        role: 'fact',
      },
      {
        id: 'E2',
        sourceUnitId: 'F2',
        sourceLocation: '사례 둘째 문장',
        evidence: '두 번째 결정 사실',
        role: 'condition',
      },
    ],
    decisionRule: '두 사실을 함께 적용해야 판단할 수 있다.',
    claimProofs: [
      {
        claimId: 'ga',
        verdict: true,
        evidenceSlotIds: ['E1', 'E2'],
        indispensabilityChecks: [
          { evidenceSlotId: 'E1', verdictWithoutEvidence: 'indeterminate' },
          { evidenceSlotId: 'E2', verdictWithoutEvidence: 'changes' },
        ],
        appliedRule: '교과 규칙',
      },
    ],
    answerEncodingRule: 'ㄱ이 참인 조합을 선택한다.',
  },
  qualityConstraints: {
    sourceClosed: true,
    requiredEvidenceSlotCount: 2,
    rejectDirectAnswer: true,
    indispensableEvidenceVerified: true,
    noveltyConstraints: [],
  },
  ...overrides,
});

describe('PatternMatcherService DNA v2 admissibility', () => {
  let tempDir: string;
  let previousPatternsBasePath: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gap-dna-'));
    previousPatternsBasePath = process.env.PATTERNS_BASE_PATH;
    process.env.PATTERNS_BASE_PATH = tempDir;
    fs.mkdirSync(path.join(tempDir, 'dna', 'success'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (previousPatternsBasePath === undefined) {
      delete process.env.PATTERNS_BASE_PATH;
    } else {
      process.env.PATTERNS_BASE_PATH = previousPatternsBasePath;
    }
  });

  const writeRecords = (records: QuestionDnaV2[]) => {
    fs.writeFileSync(
      path.join(tempDir, 'dna', 'success', '1단원.v2.json'),
      JSON.stringify({
        schemaVersion: 2,
        subject: 'success',
        unit: 1,
        records,
      }),
    );
  };

  it('selects DNA only when every claimed source unit is indispensable', () => {
    writeRecords([makeDna()]);

    const matcher = new PatternMatcherService();

    expect(matcher.findDna('success', 1, 1, undefined, 1)).toHaveLength(1);
  });

  it('rejects DNA that merely names two evidence slots without counterfactual proof', () => {
    const directDna = makeDna();
    directDna.solutionContract.claimProofs[0].indispensabilityChecks = [
      { evidenceSlotId: 'E1', verdictWithoutEvidence: 'indeterminate' },
    ];
    writeRecords([directDna]);

    const matcher = new PatternMatcherService();

    expect(matcher.findDna('success', 1, 1, undefined, 1)).toHaveLength(0);
  });
});

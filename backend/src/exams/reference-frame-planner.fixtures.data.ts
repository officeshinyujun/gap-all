import type { ConceptPayload, ReferenceFrame } from './reference-frame.types';
import { classifyReferenceArchetype } from './reference-archetype';
import {
  ReferenceFramePlannerService,
  type ReferenceFramePlannerChatRequest,
  type ReferenceFramePlannerClient,
  type ReferenceFramePlannerCompletion,
  type ReferenceFramePlannerDependencies,
  type ReferenceFramePlannerRequest,
  type ReferenceFramePlannerRequestOptions,
} from './reference-frame-planner.service';

export type ModelOutcome =
  | Readonly<{ kind: 'content'; content: string | null }>
  | Readonly<{ kind: 'refusal'; refusal: string }>
  | Readonly<{ kind: 'truncated'; content: string }>
  | Readonly<{ kind: 'failure'; error: Error }>
  | Readonly<{ kind: 'timeout' }>;

class FixtureConfigurationError extends Error {
  readonly name = 'FixtureConfigurationError';
}

type SourceFamily = 'sungjik' | 'kongil';

export type SharedSetLink = Readonly<{
  setId: string;
  role: 'shared_primary' | 'shared_pair';
}>;

type StructuralProjection = Readonly<{
  provenance: Readonly<{
    family: SourceFamily;
    unit: number;
    questionNumber: number;
    sourceId: string;
  }>;
  shell: Readonly<{
    kind: string;
    requiresStructuredSource: boolean;
    requiresViewBlock: boolean;
    requiresChoiceCombination: boolean;
  }>;
  register: Readonly<{
    stimulusRole: string;
    informationShape: string;
    allowedTplFamilies: readonly string[];
  }>;
  evidence: Readonly<{
    itemRoles: readonly string[];
    evidenceOrder: readonly string[];
  }>;
  conceptRoles: readonly string[];
  distractorTransforms: readonly string[];
  combinationPlan: Readonly<{
    responseMode: string;
    choiceEncoding: string;
    optionCount: number;
    expectedAnswerCount: number;
  }>;
  sharedSet?: SharedSetLink;
}>;

type FixtureDefinition = Readonly<{
  projection: StructuralProjection;
  source: Readonly<{
    stem: string;
    stimulus: string;
    viewItems: readonly string[];
    choices: readonly string[];
  }>;
}>;

type FixtureSummary = Readonly<{
  provenance: StructuralProjection['provenance'];
  shell: StructuralProjection['shell'];
  register: StructuralProjection['register'];
  evidence: StructuralProjection['evidence'];
  conceptRoles: readonly string[];
  distractorTransforms: readonly string[];
  combinationPlan: StructuralProjection['combinationPlan'];
  sharedSet?: SharedSetLink;
}>;

type ParsedSource = Readonly<{
  stem: string;
  stimulus: string;
  viewItems: readonly string[];
  choices: readonly string[];
}>;

const SOURCE_ARCHETYPE_FIXTURES: readonly FixtureDefinition[] = [
  {
    projection: {
      provenance: {
        family: 'sungjik',
        unit: 15,
        questionNumber: 1,
        sourceId: 'sungjik:15:1',
      },
      shell: {
        kind: 'table',
        requiresStructuredSource: true,
        requiresViewBlock: true,
        requiresChoiceCombination: true,
      },
      register: {
        stimulusRole: 'table',
        informationShape: 'comparison',
        allowedTplFamilies: ['TPL_COMPARATIVE_MATRIX'],
      },
      evidence: {
        itemRoles: [
          'correct',
          'condition_omission',
          'condition_reversal',
          'irrelevant',
          'irrelevant',
        ],
        evidenceOrder: [
          'correct',
          'condition_omission',
          'condition_reversal',
          'irrelevant',
          'irrelevant',
        ],
      },
      conceptRoles: ['core', 'supporting', 'distractor'],
      distractorTransforms: [
        'condition_omission',
        'condition_reversal',
        'scope_reversal',
      ],
      combinationPlan: {
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
        optionCount: 5,
        expectedAnswerCount: 2,
      },
    },
    source: {
      stem: '다음은 근로관계법에 대한 내용이다. (가), (나)에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      stimulus:
        '| 종류 | 내용 |\n|---|---|\n| (가) | 근로자와 사용자 간의 근로 계약 관계를 규정한 개별 계약법으로, 개개 근로자와 사용자 사이의 근로 계약에 적용됨. |\n| (나) | 근로자 단체와 사용자 또는 사용자 단체에 관한 법률로, 대등한 노사관계 형성을 위한 근로자들의 단결권을 보장함. |',
      viewItems: [
        'ㄱ. (가)는 근로자의 최저 생계 수준 유지를 목적으로 제정된 법률을 포함한다.',
        'ㄴ. (나)는 노동위원회 설치 및 그 운영에 관한 사항을 규정하는 법률을 포함한다.',
        'ㄷ. (가)는 노동자와 사용자 간의 분쟁을 조정할 수 있는 법률을, (나)는 만 15세 이상~만 18세 미만인 연소 근로자의 근로 시간을 제정한 법률을 포함한다.',
      ],
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄷ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
    },
  },
  {
    projection: {
      provenance: {
        family: 'sungjik',
        unit: 15,
        questionNumber: 2,
        sourceId: 'sungjik:15:2',
      },
      shell: {
        kind: 'case',
        requiresStructuredSource: true,
        requiresViewBlock: true,
        requiresChoiceCombination: true,
      },
      register: {
        stimulusRole: 'case',
        informationShape: 'case_profile',
        allowedTplFamilies: ['TPL_CASE_DIAGNOSTIC_FRAME'],
      },
      evidence: {
        itemRoles: [
          'correct',
          'correct',
          'incorrect',
          'irrelevant',
          'irrelevant',
        ],
        evidenceOrder: [
          'correct',
          'correct',
          'incorrect',
          'irrelevant',
          'irrelevant',
        ],
      },
      conceptRoles: ['core', 'supporting'],
      distractorTransforms: ['quantity_misread', 'rule_overextension'],
      combinationPlan: {
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
        optionCount: 5,
        expectedAnswerCount: 2,
      },
    },
    source: {
      stem: '다음은 근로관계법 관련 사례이다. 이를 분석한 내용으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      stimulus:
        '○○고등학교에 재학 중인 청소년 A씨(만 18세)는 상시 근로자가 5명인 △△음식점에서 매장 정리, 주방 보조 담당으로 평일(월~금) 오전 11시부터 오후 2시까지 시간당 11,000원을 받고 일하는 조건으로 근로 계약을 체결했고, 오늘이 첫 주급을 받는 날이다.\nA 씨는 첫 주급을 어디에 사용할지 기대하며 출근하였지만, 사장님이 이번 주는 수습 기간이라며 첫 5시간 근무에 대해서는 시급이 없다고 하여 막막하였다.\n참고 기록에는 오전 11시부터 오후 2시까지의 근무 시간만 구조적으로 남긴다.',
      viewItems: [
        'ㄱ. A씨가 최대로 받을 수 있는 주급은 198,000원이다.',
        'ㄴ. A씨는 1개월간 개근하면 1일의 유급 휴가를 받을 수 있다.',
        'ㄷ. 사장님이 주장하는 내용이 근로계약서에 명시되어 있다면 A 씨는 이를 따라야 한다.',
      ],
      choices: ['① ㄱ', '② ㄷ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
    },
  },
  {
    projection: {
      provenance: {
        family: 'sungjik',
        unit: 15,
        questionNumber: 3,
        sourceId: 'sungjik:15:3',
      },
      shell: {
        kind: 'timeline',
        requiresStructuredSource: true,
        requiresViewBlock: false,
        requiresChoiceCombination: false,
      },
      register: {
        stimulusRole: 'timeline',
        informationShape: 'condition_flow',
        allowedTplFamilies: ['TPL_SEQUENTIAL_WORKFLOW'],
      },
      evidence: {
        itemRoles: [
          'correct',
          'incorrect',
          'incorrect',
          'incorrect',
          'correct',
        ],
        evidenceOrder: [
          'correct',
          'incorrect',
          'incorrect',
          'incorrect',
          'correct',
        ],
      },
      conceptRoles: ['core', 'supporting'],
      distractorTransforms: ['role_swap', 'timing_reversal'],
      combinationPlan: {
        responseMode: 'single_selection',
        choiceEncoding: 'single_choice',
        optionCount: 5,
        expectedAnswerCount: 1,
      },
    },
    source: {
      stem: '다음은 ○○ 기업의 일자별 노사관계 업무 처리 과정을 나타낸 것이다. 이에 대한 설명으로 옳은 것은?',
      stimulus:
        '1월 2일: ○○기업 노동조합 설립\n4월 15일: 노동조합 측이 ○○ 기업에게 성과급 300%, 임금 인상률 2.8%, 임금 피크 제도 개선 등 요구\n5월 30일: 4월 15일에 요구한 사항이 받아들여지지 않아 쟁의 행위 실시',
      viewItems: [],
      choices: [
        '① 1월 2일에 설립된 조합에 가입하는 것은 근로자의 의무이다.',
        '② 4월 15일에 근로자의 권리를 주장할 대표자는 사용자가 정한다.',
        '③ 4월 15일에는 제3자가 개입하여 노사 간의 분쟁을 조정할 수 있다.',
        '④ 5월 30일에 근로자 측은 사용자 측과 대등한 입장에서 서로 의논하며 분쟁을 해결하였다.',
        '⑤ 5월 30일에 근로자 측은 파업, 태업, 시위, 보이콧 등으로 자신의 주장을 관철시킬 수 있다.',
      ],
    },
  },
  {
    projection: {
      provenance: {
        family: 'sungjik',
        unit: 15,
        questionNumber: 4,
        sourceId: 'sungjik:15:4',
      },
      shell: {
        kind: 'document',
        requiresStructuredSource: true,
        requiresViewBlock: false,
        requiresChoiceCombination: false,
      },
      register: {
        stimulusRole: 'document',
        informationShape: 'document_rules',
        allowedTplFamilies: ['TPL_FORMAL_DOCUMENT'],
      },
      evidence: {
        itemRoles: [
          'correct',
          'incorrect',
          'incorrect',
          'incorrect',
          'incorrect',
        ],
        evidenceOrder: [
          'correct',
          'incorrect',
          'incorrect',
          'incorrect',
          'incorrect',
        ],
      },
      conceptRoles: ['core'],
      distractorTransforms: ['textual_scope_shift', 'statutory_gap'],
      combinationPlan: {
        responseMode: 'single_selection',
        choiceEncoding: 'single_choice',
        optionCount: 5,
        expectedAnswerCount: 1,
      },
    },
    source: {
      stem: '다음은 근로기준법 조항 내용의 일부이다. (가)에 해당하는 시간으로 옳지 않은 것은?',
      stimulus:
        '근로기준법\n제4장 근로시간과 휴식\n제50조(근로시간) ① 1주 간의 근로시간은 휴게시간을 제외하고 40시간을 초과할 수 없다.\n② 1일의 근로시간은 휴게시간을 제외하고 8시간을 초과할 수 없다.\n③ 제1항 및 제2항에 따라 근로시간을 산정하는 경우 작업을 위하여 근로자가 (가) 등은 근로시간으로 본다.\n<신설 2012. 2. 1., 2020. 5. 26.>',
      viewItems: [],
      choices: [
        '① 작업장 조명을 소등하는 시간',
        '② 사무 업무에 필요한 PC 전원을 켜는 시간',
        '③ 회사 내 탕비실에서 점심식사를 하는 시간',
        '④ 회의실에서 신입사원 적응 교육을 받는 시간',
        '⑤ 음식점 계산대 앞에서 손님을 기다리는 시간',
      ],
    },
  },
  {
    projection: {
      provenance: {
        family: 'sungjik',
        unit: 15,
        questionNumber: 5,
        sourceId: 'sungjik:15:5',
      },
      shell: {
        kind: 'table',
        requiresStructuredSource: true,
        requiresViewBlock: true,
        requiresChoiceCombination: true,
      },
      register: {
        stimulusRole: 'table',
        informationShape: 'comparison',
        allowedTplFamilies: ['TPL_COMPARATIVE_MATRIX'],
      },
      evidence: {
        itemRoles: [
          'correct',
          'incorrect',
          'incorrect',
          'correct',
          'incorrect',
        ],
        evidenceOrder: [
          'correct',
          'incorrect',
          'incorrect',
          'correct',
          'incorrect',
        ],
      },
      conceptRoles: ['core', 'supporting'],
      distractorTransforms: ['case_swapping', 'restriction_extension'],
      combinationPlan: {
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
        optionCount: 5,
        expectedAnswerCount: 2,
      },
    },
    source: {
      stem: '다음 근로 계약 사례 조사 보고서에 대한 분석 내용으로 옳은 것만을 <보기>에서 고른 것은?',
      stimulus:
        '[근로 계약 사례 조사 보고서]\n이름: ○○○\n| 구분 | 내용 |\n|---|---|\n| 기업체명 | ㈜△△식품(상시 근로자 150명) |\n| 업무 내용 | 물류 관리 |\n| 근로 계약 기간 | 2026년 1월 2일~2026년 6월 30일 |\n| 1일 근로 시간 | 08:30~17:30 (휴게 시간 1시간(11:30~12:30) 제공) |\n| 근무일/휴일 | 주 5일(월~금)/매주 토, 일요일 |\n| 임금 | 시간당 12,000원 (연장 근로 수당 별도 지급) |',
      viewItems: [
        'ㄱ. 1주 소정 근로 시간은 45시간이다.',
        'ㄴ. 휴게 시간은 근로기준법을 준수하였다.',
        'ㄷ. 계약 기간 동안 개근하면 연 15일의 유급 휴가를 받을 수 있다.',
        'ㄹ. 연장 근로 시 시간당 18,000원의 연장 근로 수당을 받을 수 있다.',
      ],
      choices: ['① ㄱ, ㄴ', '② ㄱ, ㄷ', '③ ㄴ, ㄷ', '④ ㄴ, ㄹ', '⑤ ㄷ, ㄹ'],
    },
  },
  {
    projection: {
      provenance: {
        family: 'sungjik',
        unit: 15,
        questionNumber: 6,
        sourceId: 'sungjik:15:6',
      },
      shell: {
        kind: 'dialogue',
        requiresStructuredSource: true,
        requiresViewBlock: false,
        requiresChoiceCombination: false,
      },
      register: {
        stimulusRole: 'dialogue',
        informationShape: 'forum_qa',
        allowedTplFamilies: ['TPL_DIGITAL_FORUM_INTERFACE'],
      },
      evidence: {
        itemRoles: [
          'correct',
          'incorrect',
          'incorrect',
          'incorrect',
          'incorrect',
        ],
        evidenceOrder: [
          'correct',
          'incorrect',
          'incorrect',
          'incorrect',
          'incorrect',
        ],
      },
      conceptRoles: ['core', 'supporting'],
      distractorTransforms: ['age_condition_shift', 'permission_scope_shift'],
      combinationPlan: {
        responseMode: 'single_selection',
        choiceEncoding: 'single_choice',
        optionCount: 5,
        expectedAnswerCount: 1,
      },
    },
    source: {
      stem: '[6~7] 다음은 노동 법률 상담 Q&A 내용의 일부이다. 물음에 답하시오.\n\n위 사례의 A씨와 B씨의 근로계약에 대한 설명으로 옳은 것은?',
      stimulus:
        '노동 법률 상담 Q&A\n질문: 아내와 공동 대표로 ○○시에서 △△분식집을 운영하고 있습니다. 그동안 둘이 가게의 모든 일을 해 왔는데요. 일손이 모자라 인근 지역의 고등학생 A씨(만 16세), 대학교 졸업 예정인 B씨(만 22세)를 지난달 1일부터 평일 4시간씩, 주당 20시간씩 근무하는 조건의 아르바이트생으로 채용하여 함께 일하고 있습니다. 상시 근로자 A씨와 B씨에게 적용되는 근로기준법에 대해 알고 싶습니다.\n답변: (가)',
      viewItems: [],
      choices: [
        '① A씨는 본인이 동의만 하면 밤 10시 이후에도 근무가 가능하다.',
        '② A씨는 본인이 동의만 하면 1일 최장 8시간까지 근무가 가능하다.',
        '③ B씨는 본인이 동의만 하면 1주 최장 60시간 근무가 가능하다.',
        '④ B씨는 본인이 동의만 하면 1일 최장 4시간의 연장 근로가 가능하다.',
        '⑤ A씨, B씨 모두 본인이 동의만 하면 법정 공휴일에 근무가 가능하다.',
      ],
    },
  },
  {
    projection: {
      provenance: {
        family: 'sungjik',
        unit: 15,
        questionNumber: 7,
        sourceId: 'sungjik:15:7',
      },
      shell: {
        kind: 'case_profile',
        requiresStructuredSource: false,
        requiresViewBlock: true,
        requiresChoiceCombination: true,
      },
      register: {
        stimulusRole: 'prose',
        informationShape: 'case_profile',
        allowedTplFamilies: ['TPL_CASE_DIAGNOSTIC_FRAME'],
      },
      evidence: {
        itemRoles: [
          'incorrect',
          'incorrect',
          'incorrect',
          'incorrect',
          'correct',
        ],
        evidenceOrder: [
          'incorrect',
          'incorrect',
          'incorrect',
          'incorrect',
          'correct',
        ],
      },
      conceptRoles: ['core'],
      distractorTransforms: ['exception_flip', 'coverage_extension'],
      combinationPlan: {
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
        optionCount: 5,
        expectedAnswerCount: 2,
      },
      sharedSet: { setId: 'sungjik-rights-case-set-1', role: 'shared_primary' },
    },
    source: {
      stem: '위 사례에서 (가)에 들어갈 답변으로 적절한 것만을 <보기>에서 고른 것은?',
      stimulus: 'A씨가 근로기준법상 권리 침해를 상담하고 있다.',
      viewItems: [
        'ㄱ. 주 1회 유급 휴일을 보장하지 않아도 됩니다.',
        'ㄴ. 정당한 사유가 아니라도 예고 없이 해고할 수 있습니다.',
        'ㄷ. 상시 근로자가 여성이라도 생리 휴가를 부여하지 않을 수 있습니다.',
        'ㄹ. 사장님의 개인 사정으로 휴업하는 경우라도 휴업 수당을 지급하지 않아도 됩니다.',
      ],
      choices: ['① ㄱ, ㄴ', '② ㄱ, ㄷ', '③ ㄴ, ㄷ', '④ ㄴ, ㄹ', '⑤ ㄷ, ㄹ'],
    },
  },
  {
    projection: {
      provenance: {
        family: 'sungjik',
        unit: 15,
        questionNumber: 8,
        sourceId: 'sungjik:15:8',
      },
      shell: {
        kind: 'case_profile',
        requiresStructuredSource: false,
        requiresViewBlock: true,
        requiresChoiceCombination: true,
      },
      register: {
        stimulusRole: 'prose',
        informationShape: 'case_profile',
        allowedTplFamilies: ['TPL_CASE_DIAGNOSTIC_FRAME'],
      },
      evidence: {
        itemRoles: [
          'incorrect',
          'correct',
          'correct',
          'irrelevant',
          'irrelevant',
        ],
        evidenceOrder: [
          'incorrect',
          'correct',
          'correct',
          'irrelevant',
          'irrelevant',
        ],
      },
      conceptRoles: ['core', 'supporting'],
      distractorTransforms: ['payment_method_shift', 'attendance_rule_shift'],
      combinationPlan: {
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
        optionCount: 5,
        expectedAnswerCount: 2,
      },
      sharedSet: { setId: 'sungjik-rights-case-set-1', role: 'shared_pair' },
    },
    source: {
      stem: '다음은 근로기준법 관련 사례이다. A씨와 B씨에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?\n(단, 근로기준법상 미성년자는 고려하지 않는다.)',
      stimulus:
        'A씨는 ○○편의점에서 일하고 있다. 교대 근무라 지난주는 매일 오후 1시부터 10시까지 일했고, 이번 주는 오후 10시부터 새벽 6시까지 일하고 있다. 그런데 사장님이 A씨가 동생 명의의 통장으로 월급을 받는 것을 이유로 야간 근로 수당을 편의점에서 팔다 남은 즉석식품으로 주었다. A씨가 야근 수당도 현금으로 주시면 좋겠다고 말하자, 사장님은 도리어 월급 수령 방법을 문제삼으며 화를 냈다.\n\nB씨는 △△상사에서 하루 4시간씩 시간제 근로자로 일하고 있다. 며칠 전에는 예비군 훈련 참석으로 출근하지 못한다고 회사에 이야기했더니, 단시간 근로자들의 사정까지 봐줄 수 없다며 결근한 날의 임금은 주지 않는다는 답변을 받았다.',
      viewItems: [
        'ㄱ. A씨가 월급을 받는 방법에 따른 책임은 A 씨에게만 있다.',
        'ㄴ. B씨는 단시간 근로자이므로 회사의 결정에 따라야 한다.',
        'ㄷ. A씨에게 즉석식품을 준 것은 통화불의 원칙에 어긋나는 행위이고, B씨의 회사는 전액불의 원칙을 지키지 않았다.',
      ],
      choices: ['① ㄱ', '② ㄷ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
    },
  },
  {
    projection: {
      provenance: {
        family: 'sungjik',
        unit: 15,
        questionNumber: 9,
        sourceId: 'sungjik:15:9',
      },
      shell: {
        kind: 'document',
        requiresStructuredSource: true,
        requiresViewBlock: false,
        requiresChoiceCombination: false,
      },
      register: {
        stimulusRole: 'document',
        informationShape: 'document_rules',
        allowedTplFamilies: ['TPL_FORMAL_DOCUMENT'],
      },
      evidence: {
        itemRoles: [
          'incorrect',
          'correct',
          'incorrect',
          'incorrect',
          'incorrect',
        ],
        evidenceOrder: [
          'incorrect',
          'correct',
          'incorrect',
          'incorrect',
          'incorrect',
        ],
      },
      conceptRoles: ['core'],
      distractorTransforms: ['exception_hypothesis', 'notice_medium_shift'],
      combinationPlan: {
        responseMode: 'single_selection',
        choiceEncoding: 'single_choice',
        optionCount: 5,
        expectedAnswerCount: 1,
      },
    },
    source: {
      stem: '다음은 근로기준법 조항의 일부이다. 이에 대한 설명으로 옳은 것은? (단, 상시 근로자가 5인 이상인 사업장일 경우에 한한다.)',
      stimulus:
        '제26조 사용자는 근로자를 해고(경영상 이유에 의한 해고를 포함한다)하려면 적어도 30일 전에 예고를 하여야 하고, 30일 전에 예고를 하지 아니하였을 때에는 30일분 이상의 통상 임금을 지급하여야 한다.\n제27조 사용자는 근로자를 해고하려면 해고 사유와 해고 시기를 서면으로 통지하여야 한다.',
      viewItems: [],
      choices: [
        '① 근로자가 계속 근로한 기간이 6개월인 경우 위 조항의 적용을 받지 않는다.',
        '② 천재·사변의 사유로 사업 지속이 어려운 사용자는 위 조항을 따르지 않아도 된다.',
        '③ 근로자가 먼저 일을 그만두겠다고 통보하더라도 사용자는 위 조항을 따라야 한다.',
        '④ 사용자는 해고될 근로자에게 SNS 메시지로 해고 사유와 해고 시기를 통지할 수 있다.',
        '⑤ 근로자가 고의로 사업에 막대한 지장을 초래한 경우라도 사용자는 위 조항을 따라야 한다.',
      ],
    },
  },
  {
    projection: {
      provenance: {
        family: 'kongil',
        unit: 15,
        questionNumber: 1,
        sourceId: 'kongil:15:1',
      },
      shell: {
        kind: 'prose',
        requiresStructuredSource: true,
        requiresViewBlock: true,
        requiresChoiceCombination: true,
      },
      register: {
        stimulusRole: 'prose',
        informationShape: 'case_profile',
        allowedTplFamilies: ['TPL_CASE_DIAGNOSTIC_FRAME'],
      },
      evidence: {
        itemRoles: ['correct', 'incorrect', 'correct', 'correct', 'incorrect'],
        evidenceOrder: [
          'correct',
          'incorrect',
          'correct',
          'correct',
          'incorrect',
        ],
      },
      conceptRoles: ['core', 'supporting', 'supporting'],
      distractorTransforms: [
        'cause_type_shift',
        'suppressant_shift',
        'organization_shift',
      ],
      combinationPlan: {
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
        optionCount: 5,
        expectedAnswerCount: 3,
      },
    },
    source: {
      stem: '다음 재해 사례를 통해 알 수 있는 내용으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      stimulus:
        '○○아파트 건설 현장 지하층에서 기계 설비 공사 작업 중 피복이 벗겨진 두 전선이 접촉되면서 불꽃이 일어나 화재가 발생하였다. 산소 공급을 차단해 연소에 필요한 산소 농도 이하가 되게 하는 방법을 활용하여 초기에 화재를 진압하였다. 이후 동종 사고를 예방하기 위해 현장 작업자에게 직접 안전에 관한 조언을 할 수 있도록 별도의 안전 관리 전담 부서를 신설하였다.',
      viewItems: [
        'ㄱ. 화재 발생 원인은 합선에 해당한다.',
        'ㄴ. 화재의 유형은 B급 화재에 해당한다.',
        'ㄷ. 신설한 안전 관리 조직은 참모형 조직에 해당한다.',
        'ㄹ. 화재의 초기 진압 방법으로 질식소화법을 활용하였다.',
      ],
      choices: [
        '① ㄱ, ㄴ',
        '② ㄴ, ㄹ',
        '③ ㄷ, ㄹ',
        '④ ㄱ, ㄴ, ㄷ',
        '⑤ ㄱ, ㄷ, ㄹ',
      ],
    },
  },
  {
    projection: {
      provenance: {
        family: 'kongil',
        unit: 15,
        questionNumber: 2,
        sourceId: 'kongil:15:2',
      },
      shell: {
        kind: 'table',
        requiresStructuredSource: true,
        requiresViewBlock: true,
        requiresChoiceCombination: true,
      },
      register: {
        stimulusRole: 'table',
        informationShape: 'comparison',
        allowedTplFamilies: ['TPL_COMPARATIVE_MATRIX'],
      },
      evidence: {
        itemRoles: [
          'correct',
          'incorrect',
          'incorrect',
          'incorrect',
          'incorrect',
        ],
        evidenceOrder: [
          'correct',
          'incorrect',
          'incorrect',
          'incorrect',
          'incorrect',
        ],
      },
      conceptRoles: ['core', 'supporting'],
      distractorTransforms: ['sign_misread', 'safety_control_shift'],
      combinationPlan: {
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
        optionCount: 5,
        expectedAnswerCount: 1,
      },
    },
    source: {
      stem: '다음은 ○○기업 현장 안전 점검 체크 리스트의 일부이다. 이를 통해 알 수 있는 내용으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      stimulus:
        '○○기업 현장 안전 점검 체크 리스트\n\n| 작업장 | 점검 사항 | 점검 결과 (예) | 점검 결과 (아니요) |\n| --- | --- | --- | --- |\n| (가) | 분진이 발생하는 곳에 필요한 보호구를 비치하였는가? | ✓ | |\n| (나) | 비상구의 위치를 알 수 있도록 작업장에 산업 안전 보건 표지를 부착하였는가? | | ✓ |\n| (다) | 작업에 적합한 조명 배치 및 공간을 확보하였는가? | ✓ | |',
      viewItems: [
        'ㄱ. (가)에서 비치할 수 있는 보호구에는 방진 마스크가 포함된다.',
        'ㄴ. (나)에서는 산업 안전 보건 표지 중 지시 표지에 해당하는 표지 부착 유무를 확인하였다.',
        'ㄷ. (다)에서는 기계 설비의 안전화 방안 중 구조의 안전화에 대해 점검하였다.',
      ],
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄷ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
    },
  },
  {
    projection: {
      provenance: {
        family: 'kongil',
        unit: 15,
        questionNumber: 3,
        sourceId: 'kongil:15:3',
      },
      shell: {
        kind: 'prose',
        requiresStructuredSource: true,
        requiresViewBlock: false,
        requiresChoiceCombination: false,
      },
      register: {
        stimulusRole: 'prose',
        informationShape: 'case_profile',
        allowedTplFamilies: ['TPL_CASE_DIAGNOSTIC_FRAME'],
      },
      evidence: {
        itemRoles: [
          'incorrect',
          'correct',
          'incorrect',
          'correct',
          'incorrect',
        ],
        evidenceOrder: [
          'incorrect',
          'correct',
          'incorrect',
          'correct',
          'incorrect',
        ],
      },
      conceptRoles: ['core'],
      distractorTransforms: ['mechanism_swap', 'injury_type_shift'],
      combinationPlan: {
        responseMode: 'single_selection',
        choiceEncoding: 'single_choice',
        optionCount: 5,
        expectedAnswerCount: 1,
      },
      sharedSet: {
        setId: 'kongil-paired-safety-set-1',
        role: 'shared_primary',
      },
    },
    source: {
      stem: '[사례 1]과 [사례 2]의 기계 안전사고의 종류로 바르게 짝지은 것은?',
      stimulus:
        '[3~4] 다음은 ○○기업 재해 발생 보고서의 일부이다. 물음에 답하시오.\n\n○○기업 재해 발생 보고서\n[사례 1]\n• 개요: 산업용 로봇 운전 범위 내에 접근한 작업자가 산업용 로봇과 충돌하여 3개월의 요양을 요하는 부상을 입음.\n• 발생 원인: 작업자 안전 의식 부족, 안전장치 미설치\n• 예방 대책: 작업자의 실수로 산업용 로봇 작업장에 문을 닫지 않으면 작동이 되지 않는 방책문 설치\n\n[사례 2]\n• 개요: 선반 작업 중 발생한 절삭 칩이 얼굴에 튀어 전치 3주의 상해를 입음.\n• 발생 원인: 안전장치 미설치\n• 예방 대책: 선반 회전부에 덮개 설치',
      viewItems: [],
      choices: [
        '① [사례 1] 끼임(협착) / [사례 2] 얽힘',
        '② [사례 1] 끼임(협착) / [사례 2] 날아옴(비래)',
        '③ [사례 1] 부딪힘(충격) / [사례 2] 얽힘',
        '④ [사례 1] 부딪힘(충격) / [사례 2] 끼임(협착)',
        '⑤ [사례 1] 부딪힘(충격) / [사례 2] 날아옴(비래)',
      ],
    },
  },
  {
    projection: {
      provenance: {
        family: 'kongil',
        unit: 15,
        questionNumber: 4,
        sourceId: 'kongil:15:4',
      },
      shell: {
        kind: 'prose',
        requiresStructuredSource: true,
        requiresViewBlock: true,
        requiresChoiceCombination: true,
      },
      register: {
        stimulusRole: 'prose',
        informationShape: 'case_profile',
        allowedTplFamilies: ['TPL_CASE_DIAGNOSTIC_FRAME'],
      },
      evidence: {
        itemRoles: ['correct', 'correct', 'correct', 'incorrect', 'incorrect'],
        evidenceOrder: [
          'correct',
          'correct',
          'correct',
          'incorrect',
          'incorrect',
        ],
      },
      conceptRoles: ['core', 'supporting', 'supporting'],
      distractorTransforms: [
        'proofing_shift',
        'shielding_shift',
        'severity_shift',
      ],
      combinationPlan: {
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
        optionCount: 5,
        expectedAnswerCount: 3,
      },
      sharedSet: { setId: 'kongil-paired-safety-set-1', role: 'shared_pair' },
    },
    source: {
      stem: '위 보고서를 통해 알 수 있는 내용으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      stimulus: '',
      viewItems: [
        'ㄱ. [사례 1]의 예방 대책에서 풀 프루프 기능을 갖춘 장치를 설치하였다.',
        'ㄴ. [사례 1]의 재해 원인은 하인리히의 재해 발생 모형에 의하면 불안전한 상태 및 행동에 해당한다.',
        'ㄷ. [사례 2]의 예방 대책에서 격리형 방호 장치를 설치하였다.',
        'ㄹ. [사례 1]과 [사례 2]의 사고 결과는 중대 재해에 해당한다.',
      ],
      choices: [
        '① ㄱ, ㄴ',
        '② ㄴ, ㄹ',
        '③ ㄷ, ㄹ',
        '④ ㄱ, ㄴ, ㄷ',
        '⑤ ㄱ, ㄷ, ㄹ',
      ],
    },
  },
  {
    projection: {
      provenance: {
        family: 'kongil',
        unit: 15,
        questionNumber: 5,
        sourceId: 'kongil:15:5',
      },
      shell: {
        kind: 'prose',
        requiresStructuredSource: true,
        requiresViewBlock: true,
        requiresChoiceCombination: true,
      },
      register: {
        stimulusRole: 'prose',
        informationShape: 'case_profile',
        allowedTplFamilies: ['TPL_CASE_DIAGNOSTIC_FRAME'],
      },
      evidence: {
        itemRoles: ['incorrect', 'correct', 'correct', 'incorrect', 'correct'],
        evidenceOrder: [
          'incorrect',
          'correct',
          'correct',
          'incorrect',
          'correct',
        ],
      },
      conceptRoles: ['core', 'supporting', 'supporting'],
      distractorTransforms: [
        'color_code_shift',
        'fuel_agent_shift',
        'training_mode_shift',
      ],
      combinationPlan: {
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
        optionCount: 5,
        expectedAnswerCount: 3,
      },
    },
    source: {
      stem: '다음 화재 사례 보고서를 통해 알 수 있는 내용으로 옳은 것만을 <보기>에서 고른 것은?',
      stimulus:
        '화재 사례 보고서\n\n화재 사고 개요\n리튬 배터리를 생산하는 ○○공장에서 리튬 배터리 충전 중 과도한 전류가 흘러 리튬 배터리의 온도가 높아지며 화재가 발생하였고, 초기 진압에 실패하여 근로자 3명이 부상을 입음.\n\n예방 대책\n• 작업장마다 적합 소화제 구비\n• 화재 재발 방지를 위해 작업자들 대상으로 작업 현장에서 매 업무 시작 시 안전 교육 실시',
      viewItems: [
        'ㄱ. 화재 유형의 구분색은 황색이다.',
        'ㄴ. 적합한 소화제에는 건조사(마른 모래)가 있다.',
        'ㄷ. 발생한 화재 사고의 원인은 과열에 해당한다.',
        'ㄹ. 안전 교육 방법은 Off-JT(Off the Job Training)에 해당한다.',
      ],
      choices: ['① ㄱ, ㄴ', '② ㄱ, ㄷ', '③ ㄴ, ㄷ', '④ ㄴ, ㄹ', '⑤ ㄷ, ㄹ'],
    },
  },
  {
    projection: {
      provenance: {
        family: 'kongil',
        unit: 15,
        questionNumber: 6,
        sourceId: 'kongil:15:6',
      },
      shell: {
        kind: 'document',
        requiresStructuredSource: true,
        requiresViewBlock: true,
        requiresChoiceCombination: true,
      },
      register: {
        stimulusRole: 'document',
        informationShape: 'document_rules',
        allowedTplFamilies: ['TPL_FORMAL_DOCUMENT'],
      },
      evidence: {
        itemRoles: [
          'incorrect',
          'correct',
          'incorrect',
          'correct',
          'incorrect',
        ],
        evidenceOrder: [
          'incorrect',
          'correct',
          'incorrect',
          'correct',
          'incorrect',
        ],
      },
      conceptRoles: ['core', 'supporting', 'supporting'],
      distractorTransforms: [
        'company_liability_shift',
        'safety_principle_shift',
      ],
      combinationPlan: {
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
        optionCount: 5,
        expectedAnswerCount: 2,
      },
    },
    source: {
      stem: '다음 사례를 통해 알 수 있는 ○○기업에 대한 내용으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      stimulus:
        '㈜○○기업 대표는 철도 신호 시스템 분야에 진출하면서 무엇보다 안전이 최우선이라는 사실을 절실히 깨달았다. 이러한 인식을 바탕으로, 그는 철도 분야에서의 전문성과 신뢰를 얻기 위해 철도 신호 기술사 자격증을 취득하는 등 꾸준한 노력을 기울였고, 그 결과 업계의 인정을 받게 되었다. 이후 열차의 안전 운행을 위해 철도에서 신호 설비의 고장 등 이상이 있으면 열차를 서행하거나 중지하도록 표시되는 철도 신호 설비를 개발하였다. 또한 철도 터널 내에서 작업이 이루어질 때, 터널로 진입하는 열차를 감지하고 경보를 울려 작업자가 신속히 대피할 수 있도록 돕는 터널 경보 장치를 개발하여 △△철도공사에 공급하고, 해당 장치의 유지·보수 업무도 수행하고 있다.',
      viewItems: [
        'ㄱ. 무한 책임 사원으로만 구성되어 있다.',
        'ㄴ. 페일 세이프 기능이 적용된 철도 신호 설비를 개발하였다.',
        'ㄷ. 대표가 취득한 국가 기술 자격은 기능사 취득 후 실무 경력 5년이 있어야 취득할 수 있다.',
        'ㄹ. △△철도공사에 공급하는 장치는 재해 예방의 원칙 중 예방 가능의 원칙을 준수한 것이다.',
      ],
      choices: [
        '① ㄱ, ㄴ',
        '② ㄴ, ㄹ',
        '③ ㄷ, ㄹ',
        '④ ㄱ, ㄴ, ㄷ',
        '⑤ ㄱ, ㄷ, ㄹ',
      ],
    },
  },
  {
    projection: {
      provenance: {
        family: 'kongil',
        unit: 15,
        questionNumber: 7,
        sourceId: 'kongil:15:7',
      },
      shell: {
        kind: 'prose',
        requiresStructuredSource: true,
        requiresViewBlock: true,
        requiresChoiceCombination: true,
      },
      register: {
        stimulusRole: 'prose',
        informationShape: 'case_profile',
        allowedTplFamilies: ['TPL_CASE_DIAGNOSTIC_FRAME'],
      },
      evidence: {
        itemRoles: ['correct', 'incorrect', 'incorrect'],
        evidenceOrder: ['correct', 'incorrect', 'incorrect'],
      },
      conceptRoles: ['core', 'supporting'],
      distractorTransforms: ['step_confusion', 'job_class_shift'],
      combinationPlan: {
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
        optionCount: 5,
        expectedAnswerCount: 2,
      },
    },
    source: {
      stem: '위 보고서를 통해 알 수 있는 내용으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      stimulus:
        '[7~8] 다음은 재해 사례 개선 활동 보고서이다. 물음에 답하시오.\n\n재해 사례 개선 활동 보고서\n■ 사고 개요\n범용 기계 조작원 A씨가 가공 작업 중 회전부에서 발생하는 이상한 소리의 원인을 찾기 위해 가동 중인 범용 기계 회전부를 점검하다 옷이 말려 들어가 신체의 일부가 끼이는 재해가 발생함.\n\n■ 사고 예방 5단계 절차 시행\n하인리히(Heinrich, H. W.) 사고 예방 5단계를 적용함.\n| 1단계 | 2단계 | 3단계 | 4단계 | 5단계 |\n| --- | --- | --- | --- | --- |\n| 안전 관리 조직 | (가) | 분석 및 평가 | 시정 방법의 선정 | 시정 방법의 적용 |\n\n■ 재해 방지 대책\n• 범용 기계의 주의가 필요한 부분에 붉은색의 안전 색채를 사용함.\n• 생산 라인 작업자들을 대상으로 매 작업 전마다 안전 교육을 실시함.',
      viewItems: [
        'ㄱ. 사고의 원인은 버드의 재해 이론 중 직접 원인에 해당한다.',
        'ㄴ. 재해 방지를 위해 기계 설비의 안전화 방안 중 기능의 안전화를 적용하였다.',
        'ㄷ. A 씨의 직종은 한국표준직업분류 대분류 항목 중 기능원 및 관련 기능 종사자에 해당한다.',
      ],
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄷ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
    },
  },
  {
    projection: {
      provenance: {
        family: 'kongil',
        unit: 15,
        questionNumber: 8,
        sourceId: 'kongil:15:8',
      },
      shell: {
        kind: 'prose',
        requiresStructuredSource: true,
        requiresViewBlock: false,
        requiresChoiceCombination: false,
      },
      register: {
        stimulusRole: 'prose',
        informationShape: 'case_profile',
        allowedTplFamilies: ['TPL_CASE_DIAGNOSTIC_FRAME'],
      },
      evidence: {
        itemRoles: [
          'incorrect',
          'correct',
          'incorrect',
          'incorrect',
          'incorrect',
        ],
        evidenceOrder: [
          'incorrect',
          'correct',
          'incorrect',
          'incorrect',
          'incorrect',
        ],
      },
      conceptRoles: ['core'],
      distractorTransforms: ['step_order_confusion'],
      combinationPlan: {
        responseMode: 'single_selection',
        choiceEncoding: 'single_choice',
        optionCount: 5,
        expectedAnswerCount: 1,
      },
    },
    source: {
      stem: '위 보고서의 사고 예방 5단계 중 (가)에 해당하는 활동으로 가장 적절한 것은?',
      stimulus: '',
      viewItems: [],
      choices: [
        '① 사고 동종 기계의 연간 안전 관리 계획을 수립한다.',
        '② 안전 관리 조직을 구성하여 안전 활동 방침 및 계획을 수립한다.',
        '③ 조사에 필요한 안전 관리 기록과 재해자의 작업 일지를 확인한다.',
        '④ 현장 조사 결과를 바탕으로 사고의 원인에 대해 분석하고 평가한다.',
        '⑤ 범용 기계의 주의가 필요한 부분에 붉은색의 안전 색채를 사용한다.',
      ],
    },
  },
];

function toProjection(definition: FixtureDefinition): StructuralProjection {
  return definition.projection;
}

function toParsedSource(definition: FixtureDefinition): ParsedSource {
  return definition.source;
}

export const AR_ARCHETYPE_FIXTURES = SOURCE_ARCHETYPE_FIXTURES.map(
  (definition) => ({
    projection: toProjection(definition),
    source: toParsedSource(definition),
  }),
);

export function sourceArchetypeFixtureSummaries(): readonly FixtureSummary[] {
  return SOURCE_ARCHETYPE_FIXTURES.map((definition) => {
    const projection = toProjection(definition);
    return {
      provenance: projection.provenance,
      shell: projection.shell,
      register: projection.register,
      evidence: projection.evidence,
      conceptRoles: projection.conceptRoles,
      distractorTransforms: projection.distractorTransforms,
      combinationPlan: projection.combinationPlan,
      sharedSet: projection.sharedSet,
    };
  });
}

export function sourceArchetypeFixtureProjections(): readonly StructuralProjection[] {
  return SOURCE_ARCHETYPE_FIXTURES.map(toProjection);
}

export function sourceArchetypeFixtureRecords(): readonly ParsedSource[] {
  return SOURCE_ARCHETYPE_FIXTURES.map((definition) => definition.source);
}

export function sourceArchetypeFixtureByProvenance(
  family: SourceFamily,
  questionNumber: number,
): StructuralProjection | null {
  const record = SOURCE_ARCHETYPE_FIXTURES.find(
    (definition) =>
      definition.projection.provenance.family === family &&
      definition.projection.provenance.questionNumber === questionNumber,
  );
  return record === undefined ? null : toProjection(record);
}

export function parseFixtureSource(source: ParsedSource): Readonly<{
  stem: string;
  stimulus: string;
  viewItems: readonly string[];
  choices: readonly string[];
}> {
  return source;
}

export function validRequest(
  overrides: Partial<ReferenceFramePlannerRequest> = {},
): ReferenceFramePlannerRequest {
  const classification = classifyReferenceArchetype({
    stem: 'Which career-planning statement is correct?',
    stimulus:
      'A student compares career paths before selecting a training plan.',
    viewItems: [],
    choices: [
      '① Career planning is iterative.',
      '② Career planning is fixed.',
      '③ Career planning excludes training.',
      '④ Career planning has no values.',
      '⑤ Career planning is random.',
    ],
  });
  if (classification.kind !== 'classified') {
    throw new FixtureConfigurationError(
      'Fixture reference archetype classification failed.',
    );
  }
  const archetype = classification.value;
  const reference = {
    source: { sourceId: 'success:1:unit-1.pdf:1', sourceHash: 'fnv1a:1234' },
    unitNumber: 1,
    questionNumber: 1,
    stem: 'Which career-planning statement is correct?',
    stimulus:
      'A student compares career paths before selecting a training plan.',
    viewItems: [],
    choices: [
      '① Career planning is iterative.',
      '② Career planning is fixed.',
      '③ Career planning excludes training.',
      '④ Career planning has no values.',
      '⑤ Career planning is random.',
    ],
    targetConcepts: ['Career values'] as const,
    target: {
      primaryConcept: 'Career values',
      concepts: ['Career values'] as const,
    },
    archetype,
  };
  const { archetype: overrideArchetype, ...requestOverrides } = overrides;
  return {
    subject: 'success',
    unitRange: { start: 1, end: 2 },
    selection: {
      kind: 'selected',
      concepts: [
        { concept: 'Career values', unitNumbers: [1] },
        { concept: 'Career planning', unitNumbers: [2] },
      ],
      distractorAxisCatalog: [
        'condition_omission',
        'scope_reversal',
        'causal_reversal',
      ],
      distractorAxes: ['condition_omission'],
      references: [reference],
    },
    reference,
    referenceDistractorAxes: ['condition_omission'],
    catalogConcepts: [
      {
        id: 'concept_career_planning',
        subject: 'success',
        unit: 2,
        canonicalLabel: 'Career planning',
        ruleTags: ['comparison'],
      },
    ],
    ...requestOverrides,
    archetype: overrideArchetype ?? archetype,
  };
}

export function validFrameJson(
  overrides: Partial<Omit<ReferenceFrame, 'archetype'>> = {},
): string {
  return JSON.stringify({
    source: { sourceId: 'success:1:unit-1.pdf:1', sourceHash: 'fnv1a:1234' },
    subject: 'success',
    unitRange: { start: 1, end: 2 },
    stem: {
      style: 'statement evaluation',
      polarity: 'positive',
      languageSignals: ['formal'],
    },
    response: {
      mode: 'single_selection',
      choiceEncoding: 'single_choice',
      choiceCount: 5,
      viewItemCount: 0,
      choiceTopology: 'single_choice',
      combinationPlan: {
        expectedAnswerCount: 1,
        optionCount: 5,
        topology: 'single_choice',
      },
    },
    materialDensity: {
      targetLength: 100,
      paragraphCount: 1,
      namedEntities: 1,
      numericFacts: 0,
      conditionCount: 1,
    },
    informationShape: 'case_profile',
    difficultySignals: ['requires comparison'],
    shell: {
      kind: 'plain',
      requiresStructuredSource: false,
      requiresViewBlock: false,
      requiresChoiceCombination: false,
    },
    structureBlueprint: {
      informationUnits: [
        { id: 'unit_1', order: 1, kind: 'context', atomIds: ['atom_1'] },
        { id: 'unit_2', order: 2, kind: 'condition', atomIds: ['atom_2'] },
        { id: 'unit_3', order: 3, kind: 'conclusion', atomIds: ['atom_3'] },
      ],
      relations: [
        { kind: 'condition_of', fromUnitId: 'unit_2', toUnitId: 'unit_3' },
      ],
      reasoningSteps: [
        {
          id: 'step_1',
          order: 1,
          operation: 'derive_conclusion',
          unitIds: ['unit_2', 'unit_3'],
          dependsOnStepIds: [],
        },
      ],
      itemRoles: [
        {
          itemKind: 'choice',
          itemIndex: 1,
          role: 'correct',
          unitIds: ['unit_3'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 2,
          role: 'condition_omission',
          unitIds: ['unit_2'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 3,
          role: 'condition_reversal',
          unitIds: ['unit_2', 'unit_3'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 4,
          role: 'irrelevant',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 5,
          role: 'irrelevant',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
      ],
      evidenceBlocks: [
        {
          itemKind: 'choice',
          itemIndex: 1,
          role: 'correct',
          unitIds: ['unit_3'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 2,
          role: 'condition_omission',
          unitIds: ['unit_2'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 3,
          role: 'condition_reversal',
          unitIds: ['unit_2', 'unit_3'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 4,
          role: 'irrelevant',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 5,
          role: 'irrelevant',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
      ],
    },
    semanticAtoms: [
      {
        id: 'atom_1',
        subjectSlot: 'actor_a',
        predicateKind: 'has_status',
        operator: 'equals',
        objectSlot: null,
        quantityRole: null,
        polarity: true,
      },
      {
        id: 'atom_2',
        subjectSlot: 'actor_a',
        predicateKind: 'satisfies_condition',
        operator: 'conditional',
        objectSlot: 'process_a',
        quantityRole: null,
        polarity: true,
      },
      {
        id: 'atom_3',
        subjectSlot: 'actor_a',
        predicateKind: 'produces_outcome',
        operator: 'conditional',
        objectSlot: 'artifact_a',
        quantityRole: null,
        polarity: true,
      },
    ],
    groundingLexicon: {
      entities: [
        { slot: 'actor_a', class: 'person' },
        { slot: 'process_a', class: 'process' },
        { slot: 'artifact_a', class: 'artifact' },
      ],
      quantities: [],
      rules: [
        { id: 'rule_1', conceptId: 'concept_career_planning', polarity: true },
      ],
      bindings: [
        {
          atomId: 'atom_1',
          entitySlots: ['actor_a'],
          quantityIds: [],
          ruleIds: [],
        },
        {
          atomId: 'atom_2',
          entitySlots: ['actor_a', 'process_a'],
          quantityIds: [],
          ruleIds: ['rule_1'],
        },
        {
          atomId: 'atom_3',
          entitySlots: ['actor_a', 'artifact_a'],
          quantityIds: [],
          ruleIds: ['rule_1'],
        },
      ],
    },
    ...overrides,
  });
}

export function validPayloadJson(
  overrides: Partial<ConceptPayload> = {},
): string {
  return JSON.stringify({
    source: { sourceId: 'success:1:unit-1.pdf:1', sourceHash: 'fnv1a:1234' },
    subject: 'success',
    unitRange: { start: 1, end: 2 },
    eligibleUnits: [2],
    targetConceptIds: ['concept_career_planning'],
    supportingConceptIds: [],
    distractorAxes: ['scope_reversal'],
    answerPlan: {
      responseMode: 'single_selection',
      choiceEncoding: 'single_choice',
      expectedAnswerCount: 5,
      options: [
        { id: 'option_1', verdict: true, atomIds: ['atom_3'] },
        { id: 'option_2', verdict: false, atomIds: ['atom_2'] },
        { id: 'option_3', verdict: false, atomIds: ['atom_1'] },
        { id: 'option_4', verdict: false, atomIds: ['atom_2'] },
        { id: 'option_5', verdict: false, atomIds: ['atom_3'] },
      ],
    },
    requiredInformationShape: 'case_profile',
    noveltyRules: ['Use new facts.'],
    ...overrides,
  });
}

function completion(outcome: ModelOutcome): ReferenceFramePlannerCompletion {
  if (outcome.kind === 'refusal')
    return {
      choices: [{ message: { content: null, refusal: outcome.refusal } }],
    };
  if (outcome.kind === 'truncated')
    return {
      choices: [
        { message: { content: outcome.content }, finish_reason: 'length' },
      ],
    };
  if (outcome.kind === 'content')
    return { choices: [{ message: { content: outcome.content } }] };
  throw new FixtureConfigurationError(
    'Failure outcomes do not have completions.',
  );
}

function abortError(): Error {
  const error = new Error('request aborted');
  Object.defineProperty(error, 'name', { value: 'AbortError' });
  return error;
}

function waitForAbort(
  options: ReferenceFramePlannerRequestOptions | undefined,
): Promise<never> {
  return new Promise((_resolve, reject) => {
    const signal = options?.signal;
    if (signal === undefined) {
      reject(new FixtureConfigurationError('Expected an abort signal.'));
      return;
    }
    signal.addEventListener('abort', () => reject(abortError()), {
      once: true,
    });
  });
}

export function plannerClient(outcomes: readonly ModelOutcome[]): Readonly<{
  client: ReferenceFramePlannerClient;
  create: jest.Mock<
    Promise<ReferenceFramePlannerCompletion>,
    [ReferenceFramePlannerChatRequest, ReferenceFramePlannerRequestOptions?]
  >;
}> {
  const remaining = [...outcomes];
  const create = jest.fn<
    Promise<ReferenceFramePlannerCompletion>,
    [ReferenceFramePlannerChatRequest, ReferenceFramePlannerRequestOptions?]
  >(async (_request, options) => {
    const outcome = remaining.shift();
    if (outcome === undefined)
      throw new FixtureConfigurationError('No mock completion remains.');
    if (outcome.kind === 'timeout') return waitForAbort(options);
    if (outcome.kind === 'failure') throw outcome.error;
    return completion(outcome);
  });

  return { client: { chat: { completions: { create } } }, create };
}

export function planner(
  client: ReferenceFramePlannerClient,
  maxAttempts = 1,
  timeoutMs = 20,
): ReferenceFramePlannerService {
  const dependencies: ReferenceFramePlannerDependencies = {
    client,
    model: 'mocked-planner-model',
    maxAttempts,
    timeoutMs,
    retryDelayMs: 0,
  };
  return new ReferenceFramePlannerService(dependencies);
}

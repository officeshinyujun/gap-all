# QuestionStem 컴포넌트 설명서

EBS 수능특강 스타일의 지문(문제 지문) 렌더링 컴포넌트 시스템입니다.
9가지 템플릿 스키마를 기반으로 각각의 지문 유형을 JSON 데이터로 받아 렌더링합니다.

---

## 목차

1. [공통 원자 컴포넌트 (`_shared`)](#1-공통-원자-컴포넌트-_shared)
2. [TPL_COMPARATIVE_MATRIX](#2-tpl_comparative_matrix)
3. [TPL_FORMAL_DOCUMENT](#3-tpl_formal_document)
4. [TPL_CONVERSATIONAL_FLOW](#4-tpl_conversational_flow)
5. [TPL_CASE_DIAGNOSTIC_FRAME](#5-tpl_case_diagnostic_frame)
6. [TPL_SEQUENTIAL_WORKFLOW](#6-tpl_sequential_workflow)
7. [TPL_INSTRUCTIONAL_SCENE](#7-tpl_instructional_scene)
8. [TPL_DIGITAL_FORUM_INTERFACE](#8-tpl_digital_forum_interface)
9. [TPL_QUANTITATIVE_CHART](#9-tpl_quantitative_chart)
10. [TPL_PROMOTIONAL_CANVAS](#10-tpl_promotional_canvas)
11. [Import 방법](#11-import-방법)
12. [공통 설계 원칙](#12-공통-설계-원칙)

---

## 1. 공통 원자 컴포넌트 (`_shared`)

모든 템플릿 컴포넌트에서 공유하는 기본 원자 컴포넌트입니다.

### StemBox

지문 전체를 감싸는 외곽 박스. 수능 시험지의 지문 영역처럼 흰 배경과 테두리를 제공합니다.

```tsx
import { StemBox } from '@/components/exam/QuestionStem';

<StemBox variant="default">  {/* "default" | "bordered" */}
  {/* 지문 내용 */}
</StemBox>
```

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `variant` | `"default" \| "bordered"` | `"default"` | `default`: 얇은 테두리, `bordered`: 굵은 이중 테두리 |
| `children` | `ReactNode` | — | 지문 내용 |
| `className` | `string` | — | 추가 클래스 |

---

### StemLabel

"다음 글을 읽고 물음에 답하시오." 같은 지시문 레이블.

```tsx
import { StemLabel } from '@/components/exam/QuestionStem';

<StemLabel>다음 글을 읽고 물음에 답하시오.</StemLabel>
```

---

### BlankSlot

수능 지문의 빈칸(`___`) 또는 기호(`㉠`, `(가)`) 표시 인라인 요소. 텍스트 흐름 안에 삽입됩니다.

```tsx
import { BlankSlot } from '@/components/exam/QuestionStem';

<p>
  다음 빈칸 <BlankSlot label="㉠" /> 에 들어갈 말로 적절한 것은?
</p>
```

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `label` | `string` | — | 빈칸 안 텍스트. 없으면 빈 밑줄만 표시 |
| `width` | `number` | `60` | 빈칸 최소 너비 (px) |

---

### SelectionChip

수능 선택지 번호 칩 (①②③④⑤).

```tsx
import { SelectionChip } from '@/components/exam/QuestionStem';

<SelectionChip number={1} />
<SelectionChip number={2} selected />
<SelectionChip number={3} correct />
<SelectionChip number={4} wrong />
```

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `number` | `1 \| 2 \| 3 \| 4 \| 5` | — | 선택지 번호 |
| `selected` | `boolean` | `false` | 선택된 상태 (파란 배경) |
| `correct` | `boolean` | `false` | 정답 상태 (초록 배경) |
| `wrong` | `boolean` | `false` | 오답 상태 (빨간 배경) |
| `onClick` | `() => void` | — | 클릭 핸들러 (있으면 커서 포인터) |

---

## 2. TPL_COMPARATIVE_MATRIX

비교 행렬 표 + 하단 선택지 칩 조합 지문. "다음 표를 보고 물음에 답하시오." 형식.

### 스키마

```ts
{
  headers: Array<{ id: string; label: string }>;
  rows: Array<{ id: string; cells: string[] }>;
  selection_chips: Array<string>;
}
```

### 사용 예시

```tsx
import { TPLComparativeMatrix } from '@/components/exam/QuestionStem';

const data = {
  headers: [
    { id: 'h1', label: '구분' },
    { id: 'h2', label: '갑' },
    { id: 'h3', label: '을' },
  ],
  rows: [
    { id: 'r1', cells: ['소득', '높음', '낮음'] },
    { id: 'r2', cells: ['지출', '낮음', '높음'] },
  ],
  selection_chips: ['소득이 높다', '지출이 많다', '저축률이 높다'],
};

<TPLComparativeMatrix data={data} label="다음 표를 보고 물음에 답하시오." />
```

### 하위 컴포넌트

| 컴포넌트 | 파일 | 역할 |
|----------|------|------|
| `MatrixTable` | `MatrixTable/index.tsx` | `<table>` 전체 래퍼. `MatrixHead` + `MatrixRow` 조합 |
| `MatrixHead` | `MatrixHead/index.tsx` | `<thead>` + `<th>` 헤더 행 |
| `MatrixRow` | `MatrixRow/index.tsx` | `<tr>` 데이터 행. 첫 번째 셀은 행 헤더로 강조 |
| `MatrixCell` | `MatrixCell/index.tsx` | `<td>` 개별 셀. `align`, `highlight` prop 지원 |

---

## 3. TPL_FORMAL_DOCUMENT

공문서/보고서 형식의 지문. "다음 글을 읽고 물음에 답하시오." 공식 문서 형식.

### 스키마

```ts
{
  doc_type: string;                          // 문서 유형 (예: "보고서", "안내문")
  header_info: {
    title: string;
    date: string;
    author: string;
  };
  paragraphs: Array<{
    sub_title: string;                       // 소제목 (없으면 빈 문자열)
    content: string;                         // 본문
  }>;
  footnotes: Array<string>;                  // 각주 목록
}
```

### 사용 예시

```tsx
import { TPLFormalDocument } from '@/components/exam/QuestionStem';

const data = {
  doc_type: '환경부 보고서',
  header_info: {
    title: '2024년 탄소 배출 현황 분석',
    date: '2024. 3. 15.',
    author: '환경정책과',
  },
  paragraphs: [
    { sub_title: '1. 현황', content: '국내 탄소 배출량은 전년 대비 3% 감소하였다.' },
    { sub_title: '2. 원인', content: '재생에너지 보급 확대가 주요 원인으로 분석된다.' },
  ],
  footnotes: ['탄소 배출량은 이산화탄소 환산 기준임.'],
};

<TPLFormalDocument data={data} />
```

### 하위 컴포넌트

| 컴포넌트 | 파일 | 역할 |
|----------|------|------|
| `DocHeader` | `DocHeader/index.tsx` | 문서 유형 + 제목 + 날짜/작성자 헤더 박스 |
| `DocParagraph` | `DocParagraph/index.tsx` | 소제목 + 본문 단락 |
| `DocFootnote` | `DocFootnote/index.tsx` | ※ 기호와 함께 각주 항목 표시 |

---

## 4. TPL_CONVERSATIONAL_FLOW

대화문 형식의 지문. 수능 영어/국어 대화 지문 형식.

### 스키마

```ts
{
  participants: Array<{
    id: string;
    name: string;
    role: string;                            // 예: "학생", "교사"
  }>;
  messages: Array<{
    p_id: string;                            // participants의 id 참조
    text: string;
    timestamp: string;                       // 예: "오전 10:23"
  }>;
}
```

### 사용 예시

```tsx
import { TPLConversationalFlow } from '@/components/exam/QuestionStem';

const data = {
  participants: [
    { id: 'p1', name: '민준', role: '학생' },
    { id: 'p2', name: '선생님', role: '교사' },
  ],
  messages: [
    { p_id: 'p1', text: '선생님, 광합성이 무엇인가요?', timestamp: '오전 9:00' },
    { p_id: 'p2', text: '식물이 빛 에너지를 이용해 포도당을 만드는 과정이야.', timestamp: '오전 9:01' },
  ],
};

<TPLConversationalFlow data={data} />
```

### 하위 컴포넌트

| 컴포넌트 | 파일 | 역할 |
|----------|------|------|
| `ConvParticipantTag` | `ConvParticipantTag/index.tsx` | 참여자 이름 + 역할 태그. `colorIndex`로 색상 구분 |
| `ConvBubble` | `ConvBubble/index.tsx` | 말풍선. `direction: "left" \| "right"` |
| `ConvTimestamp` | `ConvTimestamp/index.tsx` | 타임스탬프 텍스트 |

> 첫 번째 참여자(index 0)는 좌측, 나머지는 우측 말풍선으로 자동 배치됩니다.

---

## 5. TPL_CASE_DIAGNOSTIC_FRAME

사례 분석 + 진단 체크리스트 형식의 지문. 수능 사회/과학 사례 분석 지문 형식.

### 스키마

```ts
{
  case_profile: {
    name: string;                            // 사례 대상 이름
    context: string;                         // 배경 설명
  };
  narrative: string;                         // 사례 서술 본문
  check_items: Array<{
    id: string;
    label: string;
    is_checked: boolean;                     // true: ✓, false: □
  }>;
}
```

### 사용 예시

```tsx
import { TPLCaseDiagnosticFrame } from '@/components/exam/QuestionStem';

const data = {
  case_profile: {
    name: '갑',
    context: '고등학교 2학년, 도시 거주',
  },
  narrative: '갑은 매일 대중교통을 이용하며 탄소 발자국을 줄이려 노력한다.',
  check_items: [
    { id: 'c1', label: '대중교통 이용', is_checked: true },
    { id: 'c2', label: '일회용품 사용 자제', is_checked: true },
    { id: 'c3', label: '재활용 분리수거', is_checked: false },
  ],
};

<TPLCaseDiagnosticFrame data={data} />
```

### 하위 컴포넌트

| 컴포넌트 | 파일 | 역할 |
|----------|------|------|
| `CaseProfileCard` | `CaseProfileCard/index.tsx` | 이름 + 배경 프로필 박스 (아바타 포함) |
| `CaseNarrative` | `CaseNarrative/index.tsx` | 사례 서술 본문 영역 |
| `CaseCheckItem` | `CaseCheckItem/index.tsx` | 체크리스트 항목. `is_checked`에 따라 ✓/□ 표시 |

---

## 6. TPL_SEQUENTIAL_WORKFLOW

순서도/절차 흐름 형식의 지문. 수능 순서 배열 / 절차 지문 형식.

### 스키마

```ts
{
  orientation: 'horizontal' | 'vertical';
  steps: Array<{
    idx: number;                             // 순서 번호
    label: string;                           // 스텝 제목
    desc: string;                            // 스텝 설명
    is_missing: boolean;                     // true: 빈칸 스텝 (?)
  }>;
}
```

### 사용 예시

```tsx
import { TPLSequentialWorkflow } from '@/components/exam/QuestionStem';

const data = {
  orientation: 'horizontal',
  steps: [
    { idx: 1, label: '문제 인식', desc: '현상 파악', is_missing: false },
    { idx: 2, label: '(가)', desc: '', is_missing: true },
    { idx: 3, label: '대안 선택', desc: '최적안 결정', is_missing: false },
    { idx: 4, label: '실행', desc: '계획 수행', is_missing: false },
  ],
};

<TPLSequentialWorkflow data={data} />
```

### 하위 컴포넌트

| 컴포넌트 | 파일 | 역할 |
|----------|------|------|
| `WorkflowStep` | `WorkflowStep/index.tsx` | 일반 스텝 박스 (실선 테두리) |
| `WorkflowArrow` | `WorkflowArrow/index.tsx` | 스텝 간 화살표 (→ 또는 ↓) |
| `WorkflowMissingStep` | `WorkflowMissingStep/index.tsx` | 빈칸 스텝 (점선 테두리 + ? 표시) |

---

## 7. TPL_INSTRUCTIONAL_SCENE

수업 장면 형식의 지문. 수능 과학/수학의 "선생님이 설명하고 있다" 형식.

### 스키마

```ts
{
  instructor: { id: string; text: string };
  canvas_content: {
    type: 'text' | 'table' | 'image';
    data: string | string[][] | { src: string; alt?: string };
  };
  students: Array<{ id: string; text: string }>;
}
```

### canvas_content.data 타입별 형식

| type | data 형식 | 예시 |
|------|-----------|------|
| `"text"` | `string` | `"광합성은 빛 에너지를 화학 에너지로 전환하는 과정이다."` |
| `"table"` | `string[][]` | `[["구분","값"],["온도","25°C"]]` (첫 행이 헤더) |
| `"image"` | `{ src: string; alt?: string }` | `{ src: "/img/cell.png", alt: "세포 구조" }` |

### 사용 예시

```tsx
import { TPLInstructionalScene } from '@/components/exam/QuestionStem';

const data = {
  instructor: {
    id: '선생님',
    text: '오늘은 광합성의 과정에 대해 알아보겠습니다.',
  },
  canvas_content: {
    type: 'table',
    data: [
      ['단계', '장소', '산물'],
      ['명반응', '틸라코이드', 'ATP, NADPH'],
      ['캘빈 회로', '스트로마', '포도당'],
    ],
  },
  students: [
    { id: '학생 A', text: '명반응에서 빛이 필요한 이유가 무엇인가요?' },
    { id: '학생 B', text: '캘빈 회로는 빛이 없어도 진행되나요?' },
  ],
};

<TPLInstructionalScene data={data} />
```

### 하위 컴포넌트

| 컴포넌트 | 파일 | 역할 |
|----------|------|------|
| `InstructorBubble` | `InstructorBubble/index.tsx` | 강사 말풍선 (좌측, 파란 테마) |
| `SceneCanvas` | `SceneCanvas/index.tsx` | 중앙 칠판/화면. type에 따라 text/table/image 렌더링 |
| `StudentBubble` | `StudentBubble/index.tsx` | 학생 말풍선 (우측, 회색 테마) |

---

## 8. TPL_DIGITAL_FORUM_INTERFACE

온라인 게시판 형식의 지문. 수능 영어 인터넷 게시판 지문 형식.

### 스키마

```ts
{
  forum_name: string;
  main_post: {
    author: string;
    title: string;
    content: string;
  };
  comments: Array<{
    author: string;
    text: string;
  }>;
}
```

### 사용 예시

```tsx
import { TPLDigitalForumInterface } from '@/components/exam/QuestionStem';

const data = {
  forum_name: '환경 사랑 커뮤니티',
  main_post: {
    author: 'GreenMinjun',
    title: '플라스틱 줄이기 실천 방법 공유해요',
    content: '저는 텀블러를 항상 들고 다니며 일회용 컵 사용을 줄이고 있어요.',
  },
  comments: [
    { author: 'EcoSuji', text: '저도 장바구니를 항상 챙겨 다녀요!' },
    { author: 'NatureHyun', text: '분리수거를 철저히 하는 것도 중요하죠.' },
  ],
};

<TPLDigitalForumInterface data={data} />
```

### 하위 컴포넌트

| 컴포넌트 | 파일 | 역할 |
|----------|------|------|
| `ForumHeader` | `ForumHeader/index.tsx` | 포럼명 + 네비게이션 상단 바 (파란 배경) |
| `ForumPost` | `ForumPost/index.tsx` | 원글 (제목 + 작성자 + 본문) |
| `ForumComment` | `ForumComment/index.tsx` | 댓글 항목 (들여쓰기 + └ 기호) |

---

## 9. TPL_QUANTITATIVE_CHART

정량 차트 형식의 지문. 수능 사회/과학 그래프 지문 형식. **Recharts 라이브러리 필요.**

### 스키마

```ts
{
  chart_type: 'radar' | 'bar' | 'line';
  axes: Array<{
    key: string;                             // 데이터 키
    label: string;                           // 축 레이블 (표시용)
    max: number;                             // 최대값
  }>;
  datasets: Array<{
    label: string;                           // 데이터셋 이름 (범례)
    values: number[];                        // axes 순서에 맞는 값 배열
  }>;
}
```

### 사용 예시

```tsx
import { TPLQuantitativeChart } from '@/components/exam/QuestionStem';

// 막대 그래프 예시
const data = {
  chart_type: 'bar',
  axes: [
    { key: '2020', label: '2020년', max: 100 },
    { key: '2021', label: '2021년', max: 100 },
    { key: '2022', label: '2022년', max: 100 },
  ],
  datasets: [
    { label: '갑국', values: [60, 70, 75] },
    { label: '을국', values: [80, 65, 55] },
  ],
};

<TPLQuantitativeChart data={data} chartHeight={300} />
```

### chart_type별 렌더링

| chart_type | 컴포넌트 | 설명 |
|------------|----------|------|
| `"radar"` | `ChartRadar` | 방사형 그래프. 다각형 비교에 적합 |
| `"bar"` | `ChartBar` | 막대 그래프. 항목별 수치 비교에 적합 |
| `"line"` | `ChartLine` | 꺾은선 그래프. 시계열/추세 비교에 적합 |

### 하위 컴포넌트

| 컴포넌트 | 파일 | 역할 |
|----------|------|------|
| `ChartRadar` | `ChartRadar/index.tsx` | Recharts `RadarChart` 래퍼 |
| `ChartBar` | `ChartBar/index.tsx` | Recharts `BarChart` 래퍼 (그룹 막대 지원) |
| `ChartLine` | `ChartLine/index.tsx` | Recharts `LineChart` 래퍼 |

> `axes`와 `datasets`는 `chartUtils.ts`의 `buildChartData()`로 Recharts 포맷으로 변환됩니다.

---

## 10. TPL_PROMOTIONAL_CANVAS

광고/홍보물 형식의 지문. 수능 영어 광고문, 안내문, 홍보 포스터 지문 형식.

### 스키마

```ts
{
  slogan: string;                            // 메인 슬로건
  bullets: Array<string>;                    // 특징/혜택 목록
  visual_elements: Array<string>;            // 시각 요소 설명 (예: "로고", "제품 사진")
  missing_part: string;                      // 빈칸 힌트 (예: "행사 날짜")
}
```

### 사용 예시

```tsx
import { TPLPromotionalCanvas } from '@/components/exam/QuestionStem';

const data = {
  slogan: '지구를 위한 선택, 친환경 제품 박람회',
  bullets: [
    '100여 개 친환경 브랜드 참가',
    '무료 체험 및 시연 행사',
    '선착순 500명 기념품 증정',
  ],
  visual_elements: ['박람회 로고', '친환경 제품 사진'],
  missing_part: '행사 날짜',
};

<TPLPromotionalCanvas data={data} />
```

### 하위 컴포넌트

| 컴포넌트 | 파일 | 역할 |
|----------|------|------|
| `PromoSlogan` | `PromoSlogan/index.tsx` | 메인 슬로건 (이중 테두리 강조) |
| `PromoBullet` | `PromoBullet/index.tsx` | 불릿 항목 (▶◆●★■ 순환) |
| `PromoVisualTag` | `PromoVisualTag/index.tsx` | 시각 요소 플레이스홀더 `[로고]` 형식 |
| `PromoMissingPart` | `PromoMissingPart/index.tsx` | 빈칸 강조 박스 (점선 파란 테두리) |

---

## 11. Import 방법

모든 컴포넌트와 타입은 단일 진입점에서 import할 수 있습니다.

```tsx
// 메인 템플릿 컴포넌트
import {
  TPLComparativeMatrix,
  TPLFormalDocument,
  TPLConversationalFlow,
  TPLCaseDiagnosticFrame,
  TPLSequentialWorkflow,
  TPLInstructionalScene,
  TPLDigitalForumInterface,
  TPLQuantitativeChart,
  TPLPromotionalCanvas,
} from '@/components/exam/QuestionStem';

// 하위 원자 컴포넌트 (필요 시 개별 사용)
import {
  StemBox,
  StemLabel,
  BlankSlot,
  SelectionChip,
  MatrixTable,
  MatrixHead,
  MatrixRow,
  MatrixCell,
  // ... 기타
} from '@/components/exam/QuestionStem';

// 타입
import type {
  TPL_COMPARATIVE_MATRIX,
  TPL_FORMAL_DOCUMENT,
  TPL_CONVERSATIONAL_FLOW,
  TPL_CASE_DIAGNOSTIC_FRAME,
  TPL_SEQUENTIAL_WORKFLOW,
  TPL_INSTRUCTIONAL_SCENE,
  TPL_DIGITAL_FORUM_INTERFACE,
  TPL_QUANTITATIVE_CHART,
  TPL_PROMOTIONAL_CANVAS,
} from '@/types/questionstem';
```

---

## 12. 공통 설계 원칙

### 레이아웃
- 모든 컴포넌트는 `VStack` / `HStack`으로 레이아웃을 구성합니다.
- `display: flex` 직접 사용 금지 (단, `position: relative` 등 필수 케이스 제외).

### 색상
- 모든 색상은 `app/styles/variables.scss`의 SCSS 변수만 사용합니다.
- hex 값 하드코딩 금지. 단, Recharts 차트 컴포넌트는 JS 값이 필요하므로 `chartUtils.ts`에 변수 값을 상수로 정의하여 사용합니다.

### 간격
- 간격은 `constants/spacing.ts`의 `SPACING` 상수 또는 SCSS의 `$spacing-*` 변수를 사용합니다.

### 타이포그래피
- 일반 텍스트: `Typo` 컴포넌트 사용.
- 수능 시험지 느낌이 필요한 텍스트: `font-family: 'Noto Serif KR', 'KoPubWorldBatang', 'Batang', Georgia, serif` 직접 적용.

### Props 패턴
- 각 템플릿 컴포넌트는 `data` prop으로 해당 스키마 타입을 수신합니다.
- `label` prop으로 지시문 텍스트를 커스터마이징할 수 있습니다 (기본값 제공).
- 하위 원자 컴포넌트는 독립적으로도 사용 가능합니다.

### 접근성
- 클릭 가능한 요소에는 `role`, `tabIndex`, `onKeyDown` 처리.
- 장식용 요소에는 `aria-hidden="true"` 적용.
- 이미지에는 `alt` 텍스트 필수.

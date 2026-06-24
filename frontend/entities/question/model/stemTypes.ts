// ============================================================
// QuestionStem 템플릿 스키마 타입 정의
// ============================================================

export type ChartType = 'radar' | 'bar' | 'line';
export type CanvasContentType = 'text' | 'table' | 'image' | 'mind_map' | 'key_map';
export type WorkflowOrientation = 'horizontal' | 'vertical';

// ------------------------------------------------------------
// 1. TPL_COMPARATIVE_MATRIX
// ------------------------------------------------------------

export interface MatrixHeader {
  id: string;
  label: string;
}

export interface MatrixRowData {
  /** exam.json: number / ex2am.json: string */
  id: string | number;
  /** cells[0]은 행 헤더 역할 */
  cells: string[];
}

export interface TPL_COMPARATIVE_MATRIX {
  headers: MatrixHeader[];
  rows: MatrixRowData[];
  /** 빈칸 정답 힌트. QuestionRenderer에서 []로 마스킹 */
  selection_chips: string[];
}

// ------------------------------------------------------------
// 2. TPL_FORMAL_DOCUMENT
// ------------------------------------------------------------

export interface DocHeaderInfo {
  title: string;
  /** 형식 자유 — "2024. 3. 15." 또는 "2026-05-08" */
  date: string;
  author: string;
}

export interface DocParagraphData {
  /** 빈 문자열이면 소제목 미표시 */
  sub_title: string;
  /** 줄바꿈(\n) 포함 가능 */
  content: string;
}

export interface TPL_FORMAL_DOCUMENT {
  doc_type: string;
  header_info: DocHeaderInfo;
  paragraphs: DocParagraphData[];
  /** 빈 배열이면 각주 영역 미표시 */
  footnotes: string[];
}

// ------------------------------------------------------------
// 3. TPL_CONVERSATIONAL_FLOW
// ------------------------------------------------------------

export interface ConvParticipant {
  /** messages의 p_id와 매칭 */
  id: string;
  name: string;
  role: string;
}

export interface ConvMessage {
  p_id: string;
  text: string;
  /** 현재 UI 미표시, 참고용 */
  timestamp: string;
}

export interface TPL_CONVERSATIONAL_FLOW {
  /** index 0: 좌측 배치, 나머지: 우측 배치 */
  participants: ConvParticipant[];
  messages: ConvMessage[];
}

// ------------------------------------------------------------
// 4. TPL_CASE_DIAGNOSTIC_FRAME
// ------------------------------------------------------------

export interface CaseProfile {
  name: string;
  context: string;
}

export interface CaseCheckItemData {
  /** exam.json: number / ex2am.json: string. 화면에 레이블로 표시 */
  id: string | number;
  label: string;
  /** QuestionRenderer에서 항상 false로 마스킹 */
  is_checked: boolean;
}

export interface TPL_CASE_DIAGNOSTIC_FRAME {
  case_profile: CaseProfile;
  /** 줄바꿈(\n) 포함 가능 */
  narrative: string;
  check_items: CaseCheckItemData[];
}

// ------------------------------------------------------------
// 5. TPL_SEQUENTIAL_WORKFLOW
// ------------------------------------------------------------

export interface WorkflowStepData {
  idx: number;
  /** is_missing=true이면 "(가)", "(나)" 등 빈칸 레이블 */
  label: string;
  /** is_missing=true이면 빈 문자열 */
  desc: string;
  /** true: 점선 박스 + ? / false: 실선 박스 */
  is_missing: boolean;
}

export interface TPL_SEQUENTIAL_WORKFLOW {
  /** horizontal: → 화살표 / vertical: ↓ 화살표 */
  orientation: WorkflowOrientation;
  steps: WorkflowStepData[];
}

// ------------------------------------------------------------
// 6. TPL_INSTRUCTIONAL_SCENE
// ------------------------------------------------------------

export interface SceneParticipant {
  /** 화면에 이름 레이블로 표시 */
  id: string;
  text: string;
}

export interface CanvasImageData {
  src: string;
  alt?: string;
}

export interface CanvasContent {
  /**
   * text: string / table: string[][] / image: CanvasImageData
   * mind_map·key_map: "중심개념: [항목1], [항목2]" 형식 string
   */
  type: CanvasContentType;
  data: string | string[][] | CanvasImageData;
}

export interface TPL_INSTRUCTIONAL_SCENE {
  /** 좌측 말풍선 */
  instructor: SceneParticipant;
  canvas_content: CanvasContent;
  /** 우측 말풍선. 빈 배열이면 미표시 */
  students: SceneParticipant[];
}

// ------------------------------------------------------------
// 7. TPL_DIGITAL_FORUM_INTERFACE
// ------------------------------------------------------------

export interface ForumMainPost {
  author: string;
  title: string;
  content: string;
}

export interface ForumCommentData {
  author: string;
  /** 빈칸 "(가)" 포함 가능 */
  text?: string;
  /** GPT 생성 데이터 호환용 */
  content?: string;
}

export interface TPL_DIGITAL_FORUM_INTERFACE {
  forum_name: string;
  main_post: ForumMainPost;
  /** 빈 배열이면 댓글 영역 미표시 */
  comments: ForumCommentData[];
}

// ------------------------------------------------------------
// 8. TPL_QUANTITATIVE_CHART
// ------------------------------------------------------------

export interface ChartAxis {
  key: string;
  label: string;
  max: number;
}

export interface ChartDataset {
  label: string;
  /** axes 순서와 동일한 길이 */
  values: number[];
}

export interface TPL_QUANTITATIVE_CHART {
  /** bar: 막대 / line: 꺾은선 / radar: 방사형 */
  chart_type: ChartType;
  axes: ChartAxis[];
  datasets: ChartDataset[];
}

// ------------------------------------------------------------
// 9. TPL_PROMOTIONAL_CANVAS
// ------------------------------------------------------------

export interface TPL_PROMOTIONAL_CANVAS {
  slogan: string;
  /** "키워드: 설명" 형식 또는 단순 텍스트. 빈칸 "(가)" 포함 가능 */
  bullets: string[];
  /** 시각 요소 플레이스홀더 텍스트 */
  visual_elements: string[];
  /** 빈칸 없으면 빈 문자열("") */
  missing_part: string;
}

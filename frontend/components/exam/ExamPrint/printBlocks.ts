import { normalizeSourceBlocks } from '@shared/utils/sourceBlocks';
import type {
  SourceFigure,
  TPL_ANNOUNCEMENT,
  TPL_ARTICLE,
  TPL_CASE_DIAGNOSTIC_FRAME,
  TPL_COMPARATIVE_MATRIX,
  TPL_CONVERSATIONAL_FLOW,
  TPL_DIGITAL_FORUM_INTERFACE,
  TPL_FORMAL_DOCUMENT,
  TPL_INCIDENT_REPORT,
  TPL_INSTRUCTIONAL_SCENE,
  TPL_PROMOTIONAL_CANVAS,
  TPL_QUANTITATIVE_CHART,
  TPL_REPORT,
  TPL_SEQUENTIAL_WORKFLOW,
  TPL_STATISTICS,
} from '@/types/questionstem';

/**
 * 인쇄용 시험지 제시문 블록.
 * 템플릿마다 다른 stimulus_data를 실제 시험지에 쓰이는 몇 가지 블록(제목·글·표·대화·순서·그림)으로 맞춘다.
 * 문자열 안의 `[그림 F1]` 토큰은 렌더러가 figures로 바꾼다.
 */
export type PrintBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'meta'; text: string }
  | { kind: 'paragraph'; text: string; emphasis?: boolean }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; title?: string; headers: string[][]; rows: string[][]; caption?: string }
  | { kind: 'dialogue'; lines: { speaker: string; text: string }[] }
  | { kind: 'steps'; steps: { label: string; desc: string }[]; horizontal: boolean }
  | { kind: 'figure'; figureId: string }
  | { kind: 'note'; text: string };

export interface PrintStimulus {
  blocks: PrintBlock[];
  figures: Record<string, SourceFigure>;
  choiceTable: { headers: string[]; rows: string[][] } | null;
}

const EMPTY: PrintStimulus = { blocks: [], figures: {}, choiceTable: null };

const text = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));
const filled = (value: unknown): boolean => text(value).trim() !== '';

function paragraphs(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (entry && typeof entry === 'object' && 'content' in entry && typeof entry.content === 'string') return [entry.content];
    return [];
  });
}

function compact(blocks: (PrintBlock | null | false | undefined)[]): PrintBlock[] {
  return blocks.filter((block): block is PrintBlock => {
    if (!block) return false;
    switch (block.kind) {
      case 'heading':
      case 'meta':
      case 'paragraph':
      case 'note':
        return filled(block.text);
      case 'list':
        return block.items.length > 0;
      case 'table':
        return block.rows.length > 0 || block.headers.length > 0;
      case 'dialogue':
        return block.lines.length > 0;
      case 'steps':
        return block.steps.length > 0;
      default:
        return true;
    }
  });
}

function fromSourceBlocks(data: unknown): PrintStimulus {
  const source = normalizeSourceBlocks(data);
  const blocks = compact(
    source.blocks.map((block): PrintBlock | null => {
      switch (block.type) {
        case 'text':
          return { kind: 'paragraph', text: block.text };
        case 'table':
          return {
            kind: 'table',
            title: block.title ?? undefined,
            headers: block.headers,
            rows: block.rows,
            caption: block.caption ?? undefined,
          };
        case 'dialogue':
          return { kind: 'dialogue', lines: block.lines.map((line) => ({ speaker: line.speaker, text: line.text })) };
        case 'figure':
          return { kind: 'figure', figureId: block.figure_id };
        default:
          return null;
      }
    }),
  );
  return { blocks, figures: source.figures, choiceTable: source.choice_table ?? null };
}

function fromLegacy(template: string, data: unknown): PrintBlock[] {
  switch (template) {
    case 'TPL_COMPARATIVE_MATRIX': {
      const d = data as TPL_COMPARATIVE_MATRIX;
      return compact([
        {
          kind: 'table',
          headers: d.headers?.length ? [d.headers.map((header) => text(header.label))] : [],
          rows: (d.rows ?? []).map((row) => (row.cells ?? []).map(text)),
        },
      ]);
    }
    case 'TPL_FORMAL_DOCUMENT': {
      const d = data as TPL_FORMAL_DOCUMENT;
      return compact([
        { kind: 'heading', text: text(d.header_info?.title) },
        ...(d.paragraphs ?? []).flatMap((paragraph): PrintBlock[] => [
          { kind: 'paragraph', text: text(paragraph.sub_title), emphasis: true },
          { kind: 'paragraph', text: text(paragraph.content) },
        ]),
        ...(d.footnotes ?? []).map((footnote): PrintBlock => ({ kind: 'note', text: `* ${text(footnote)}` })),
      ]);
    }
    case 'TPL_CONVERSATIONAL_FLOW': {
      const d = data as TPL_CONVERSATIONAL_FLOW;
      const names = new Map((d.participants ?? []).map((participant) => [participant.id, participant.name]));
      return compact([
        { kind: 'dialogue', lines: (d.messages ?? []).map((message) => ({ speaker: text(names.get(message.p_id) ?? message.p_id), text: text(message.text) })) },
      ]);
    }
    case 'TPL_CASE_DIAGNOSTIC_FRAME': {
      const d = data as TPL_CASE_DIAGNOSTIC_FRAME;
      const profiles = Array.isArray(d.case_profile) ? d.case_profile : d.case_profile ? [d.case_profile] : [];
      const checks = Array.isArray(d.check_items) ? d.check_items : [];
      return compact([
        ...profiles.flatMap((profile): PrintBlock[] => [
          { kind: 'paragraph', text: text(profile.name), emphasis: true },
          { kind: 'paragraph', text: text(profile.context) },
        ]),
        { kind: 'paragraph', text: text(d.narrative) },
        { kind: 'list', items: checks.map((item) => `${item.is_checked ? '☑' : '☐'} ${text(item.label)}`) },
      ]);
    }
    case 'TPL_SEQUENTIAL_WORKFLOW': {
      const d = data as TPL_SEQUENTIAL_WORKFLOW;
      return compact([
        {
          kind: 'steps',
          horizontal: d.orientation === 'horizontal',
          steps: (d.steps ?? []).map((step) => ({
            label: text(step.label).trim(),
            desc: step.is_missing ? '(   ?   )' : text(step.desc),
          })),
        },
      ]);
    }
    case 'TPL_INSTRUCTIONAL_SCENE': {
      const d = data as TPL_INSTRUCTIONAL_SCENE;
      const canvas = d.canvas_content;
      const canvasBlock: PrintBlock | null = !canvas
        ? null
        : canvas.type === 'table' && Array.isArray(canvas.data)
          ? { kind: 'table', headers: [], rows: (canvas.data as unknown[][]).map((row) => row.map(text)) }
          : { kind: 'paragraph', text: text(canvas.data) };
      return compact([
        { kind: 'dialogue', lines: [{ speaker: text(d.instructor?.id) || '교사', text: text(d.instructor?.text) }] },
        canvasBlock,
        { kind: 'dialogue', lines: (d.students ?? []).map((student) => ({ speaker: text(student.id) || '학생', text: text(student.text) })) },
      ]);
    }
    case 'TPL_DIGITAL_FORUM_INTERFACE': {
      const d = data as TPL_DIGITAL_FORUM_INTERFACE;
      return compact([
        { kind: 'heading', text: text(d.forum_name) },
        { kind: 'paragraph', text: text(d.main_post?.title), emphasis: true },
        { kind: 'paragraph', text: text(d.main_post?.content) },
        { kind: 'dialogue', lines: (d.comments ?? []).map((comment) => ({ speaker: text(comment.author), text: text(comment.text) })) },
      ]);
    }
    case 'TPL_QUANTITATIVE_CHART': {
      const d = data as TPL_QUANTITATIVE_CHART;
      const datasets = d.datasets ?? [];
      return compact([
        {
          kind: 'table',
          headers: [['구분', ...datasets.map((dataset) => text(dataset.label))]],
          rows: (d.axes ?? []).map((axis, index) => [text(axis.label), ...datasets.map((dataset) => text((dataset.values ?? [])[index] ?? '-'))]),
        },
      ]);
    }
    case 'TPL_PROMOTIONAL_CANVAS': {
      const d = data as TPL_PROMOTIONAL_CANVAS;
      return compact([
        { kind: 'heading', text: text(d.slogan) },
        { kind: 'list', items: (d.bullets ?? []).map((bullet) => `• ${text(bullet)}`) },
        ...(d.visual_elements ?? []).map((element): PrintBlock => ({ kind: 'note', text: `[${text(element)}]` })),
      ]);
    }
    case 'TPL_ARTICLE': {
      const d = data as TPL_ARTICLE;
      return compact([
        { kind: 'heading', text: text(d.title) },
        { kind: 'meta', text: [text(d.byline), text(d.published_date)].filter(filled).join(' · ') },
        ...paragraphs(d.body_paragraphs).map((paragraph): PrintBlock => ({ kind: 'paragraph', text: paragraph })),
        { kind: 'meta', text: filled(d.source) ? `- ${text(d.source)} -` : '' },
      ]);
    }
    case 'TPL_STATISTICS': {
      const d = data as TPL_STATISTICS;
      return compact([
        {
          kind: 'table',
          title: text(d.title) || undefined,
          headers: [[text(d.category_label) || '항목', text(d.unit) || '값']],
          rows: (d.data_entries ?? []).map((entry) => [text(entry.label), text(entry.value)]),
          caption: filled(d.source) ? `출처: ${text(d.source)}` : undefined,
        },
      ]);
    }
    case 'TPL_INCIDENT_REPORT': {
      const d = data as TPL_INCIDENT_REPORT;
      return compact([
        { kind: 'heading', text: text(d.title) },
        {
          kind: 'list',
          items: [
            filled(d.incident_type) ? `• 유형: ${text(d.incident_type)}` : '',
            filled(d.date) ? `• 발생 일시: ${text(d.date)}` : '',
            filled(d.location) ? `• 발생 장소: ${text(d.location)}` : '',
            filled(d.overview) ? `• 개요: ${text(d.overview)}` : '',
            filled(d.cause) ? `• 원인: ${text(d.cause)}` : '',
            filled(d.damage) ? `• 피해: ${text(d.damage)}` : '',
            ...(d.timeline ?? []).map((event) => `• ${text(event.time)} ${text(event.event)}`),
          ].filter(filled),
        },
      ]);
    }
    case 'TPL_ANNOUNCEMENT': {
      const d = data as TPL_ANNOUNCEMENT;
      return compact([
        { kind: 'heading', text: text(d.title) },
        {
          kind: 'list',
          items: [
            filled(d.organizer) ? `• 주최: ${text(d.organizer)}` : '',
            d.schedule ? `• 기간: ${text(d.schedule.start)}${d.schedule.end ? ` ~ ${text(d.schedule.end)}` : ''}` : '',
            filled(d.location) ? `• 장소: ${text(d.location)}` : '',
            filled(d.target) ? `• 대상: ${text(d.target)}` : '',
            ...(d.details ?? []).map((detail) => `• ${text(detail.label)}: ${text(detail.content)}`),
            filled(d.contact) ? `• 문의: ${text(d.contact)}` : '',
          ].filter(filled),
        },
      ]);
    }
    case 'TPL_REPORT': {
      const d = data as TPL_REPORT;
      return compact([
        { kind: 'heading', text: text(d.title) },
        { kind: 'meta', text: [filled(d.author) ? `작성자: ${text(d.author)}` : '', filled(d.date) ? `작성일: ${text(d.date)}` : ''].filter(filled).join(' | ') },
        ...(d.sections ?? []).flatMap((section): PrintBlock[] => [
          { kind: 'paragraph', text: text(section.heading), emphasis: true },
          { kind: 'paragraph', text: text(section.content) },
        ]),
        { kind: 'paragraph', text: filled(d.conclusion) ? `결론: ${text(d.conclusion)}` : '' },
      ]);
    }
    default: {
      if (typeof data === 'string') return compact([{ kind: 'paragraph', text: data }]);
      if (data && typeof data === 'object' && 'data' in data && typeof data.data === 'string') {
        return compact([{ kind: 'paragraph', text: data.data }]);
      }
      return [];
    }
  }
}

export function toPrintStimulus(template: string | undefined, data: unknown): PrintStimulus {
  if (data == null) return EMPTY;
  try {
    if (template === 'TPL_SOURCE_BLOCKS') return fromSourceBlocks(data);
    return { blocks: fromLegacy(template ?? '', data), figures: {}, choiceTable: null };
  } catch {
    return EMPTY;
  }
}

export type ChoiceLayout = 'inline' | 'triple' | 'stack';

/** 지면 폭 기준 글자 수(한글 1, 공백·쉼표 0.4, 그 밖 0.6) */
export function visualWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    if (/[\s,.]/u.test(char)) width += 0.4;
    else if (/[ㄱ-ㆎ가-힣一-鿿]/u.test(char)) width += 1;
    else width += 0.6;
  }
  return width;
}

/**
 * 실제 시험지 선지 배치: 짧으면 한 줄에 다섯 개(① ㄱ ② ㄷ …), 중간이면 세 개씩 두 줄, 길면 한 줄에 하나.
 */
export function choiceLayout(options: readonly string[]): ChoiceLayout {
  const widths = options.map(visualWidth);
  const longest = Math.max(0, ...widths);
  // 번호(①)와 간격까지 한 선지당 약 1.6자를 더해 한 단 폭(약 22자)에 들어가는지 본다.
  const lineWidth = widths.reduce((sum, width) => sum + width + 1.6, 0);
  if (longest <= 6 && lineWidth <= 22) return 'inline';
  if (longest <= 10) return 'triple';
  return 'stack';
}

import { validateSimplyReferenceStructuredTpl } from './simply-reference-generation-contract';
import type { NormalizedSourceReference } from './reference-selector.types';
import { isStructuredTplName, type StructuredTplName } from './tpl-schemas';

/** Increment when source-preserving output semantics change. */
export const SOURCE_PRESERVING_ADAPTER_VERSION = 2 as const;

export type SourcePreservingRender = Readonly<{
  template: StructuredTplName;
  stimulusData: Record<string, unknown>;
}>;

export function sourceTemplate(
  reference: NormalizedSourceReference,
): StructuredTplName | null {
  const template = reference.archetype?.sourceTemplate;
  return isStructuredTplName(template) ? template : null;
}

export function sourcePreservingRender(
  reference: NormalizedSourceReference,
): SourcePreservingRender | null {
  const template = sourceTemplate(reference);
  if (template === null) return null;
  const stimulusData = sourceStimulusData(template, reference.stimulus);
  return stimulusData !== null &&
    validateSimplyReferenceStructuredTpl(template, stimulusData)
    ? { template, stimulusData }
    : null;
}

function sourceStimulusData(
  template: StructuredTplName,
  stimulus: string,
): Record<string, unknown> | null {
  switch (template) {
    case 'TPL_COMPARATIVE_MATRIX':
      return sourceMatrixStimulus(stimulus);
    case 'TPL_CASE_DIAGNOSTIC_FRAME': {
      const name = sourceCaseName(stimulus);
      return name === null
        ? null
        : {
            case_profile: { name, context: '' },
            narrative: stimulus,
            check_items: [],
          };
    }
    case 'TPL_FORMAL_DOCUMENT':
      return stimulus === ''
        ? null
        : {
            doc_type: '원문 문서',
            header_info: { title: '', date: '', author: '' },
            paragraphs: physicalLines(stimulus).map((content) => ({
              sub_title: '',
              content,
            })),
            footnotes: [],
          };
    case 'TPL_SEQUENTIAL_WORKFLOW':
      return sourceWorkflowStimulus(stimulus);
    case 'TPL_CONVERSATIONAL_FLOW':
      return sourceConversationStimulus(stimulus);
    case 'TPL_ARTICLE':
      return stimulus === ''
        ? null
        : {
            title: '원문 자료',
            source: '',
            published_date: '',
            body_paragraphs: physicalLines(stimulus),
            key_facts: [],
          };
    default:
      return null;
  }
}

function sourceMatrixStimulus(stimulus: string): Record<string, unknown> | null {
  const lines = physicalLines(stimulus);
  const hasMarkdownSeparator = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/u.test(
    lines[1] ?? '',
  );
  const tableLines = hasMarkdownSeparator ? lines.filter((_, i) => i !== 1) : lines;
  if (tableLines.length < 2) return null;
  const parsedRows = tableLines.map(tableCells);
  const headerCells = parsedRows[0] ?? null;
  if (
    headerCells === null ||
    headerCells.length < 2 ||
    parsedRows.slice(1).some(
      (cells) => cells === null || cells.length !== headerCells.length,
    )
  ) {
    return null;
  }
  return {
    headers: headerCells.map((label, index) => ({
      id: `column-${index + 1}`,
      label,
    })),
    rows: parsedRows.slice(1).map((cells, index) => ({
      id: `row-${index + 1}`,
      cells: cells ?? [],
    })),
    selection_chips: [],
  };
}

function sourceWorkflowStimulus(stimulus: string): Record<string, unknown> | null {
  const lines = physicalLines(stimulus);
  const steps: Array<{ idx: number; label: string; desc: string; is_missing: boolean }> = [];
  for (const line of lines) {
    const marker = workflowMarker(line, steps.length + 1);
    if (marker !== null) {
      steps.push({ ...marker, is_missing: false });
      continue;
    }
    const previous = steps.at(-1);
    if (previous === undefined) return null;
    previous.desc += `\n${line}`;
  }
  return steps.length >= 2 && steps.every((step) => step.desc.trim() !== '')
    ? { steps, orientation: 'vertical' }
    : null;
}

function sourceConversationStimulus(stimulus: string): Record<string, unknown> | null {
  const pattern = /^\s*([^:：]{1,20}?)\s*[:：](.*)$/u;
  const parsed: Array<{ speaker: string; text: string }> = [];
  for (const line of physicalLines(stimulus)) {
    const match = line.match(pattern);
    if (match !== null) {
      const speaker = match[1]?.trim() ?? '';
      if (speaker === '') return null;
      parsed.push({ speaker, text: match[2] ?? '' });
      continue;
    }
    const previous = parsed.at(-1);
    if (previous === undefined) return null;
    previous.text += `\n${line}`;
  }
  if (parsed.length < 2 || !parsed.every((message) => message.text.trim() !== '')) {
    return null;
  }
  const participants = new Map<string, string>();
  for (const message of parsed.filter(isPresent)) {
    if (!participants.has(message.speaker)) {
      participants.set(message.speaker, `speaker-${participants.size + 1}`);
    }
  }
  return {
    participants: [...participants.entries()].map(([name, id]) => ({ id, name, role: '' })),
    messages: parsed.filter(isPresent).map((message, index) => ({
      p_id: participants.get(message.speaker) ?? '',
      text: message.text,
      timestamp: String(index + 1),
    })),
  };
}

function workflowMarker(
  line: string,
  fallbackIndex: number,
): Readonly<{ idx: number; label: string; desc: string }> | null {
  const numbered = line.match(/^\s*(\d+)\s*([.)])\s*(\S.*)$/u);
  if (numbered !== null) {
    return {
      idx: Number(numbered[1]) || fallbackIndex,
      label: `${numbered[1]}${numbered[2]}`,
      desc: numbered[3] ?? '',
    };
  }
  const bullet = line.match(/^\s*([-•·])\s*(\S.*)$/u);
  if (bullet !== null) {
    return { idx: fallbackIndex, label: bullet[1] ?? '', desc: bullet[2] ?? '' };
  }
  const date = line.match(
    /^\s*((?:\d{4}[./-]\d{1,2}[./-]\d{1,2})|(?:\d{1,2}[./-]\d{1,2}))\s*[:：-]\s*(\S.*)$/u,
  );
  return date === null
    ? null
    : { idx: fallbackIndex, label: date[1] ?? '', desc: date[2] ?? '' };
}

function physicalLines(stimulus: string): readonly string[] {
  return stimulus.split('\n');
}

function sourceCaseName(stimulus: string): string | null {
  return stimulus.match(/(?:[A-Z]씨|[가-힣]{2,4}(?:씨|기업|회사)|㈜\S+)/u)?.[0] ?? null;
}

function tableCells(line: string): readonly string[] | null {
  const content = line.startsWith('|') && line.endsWith('|') ? line.slice(1, -1) : line;
  if (!content.includes('|')) return null;
  const cells = content.split('|');
  return cells.length > 0 && cells.every((cell) => cell.trim() !== '') ? cells : null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

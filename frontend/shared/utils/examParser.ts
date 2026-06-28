import type { ParsedStimulus } from '@/types/examQuestion';

/**
 * stimulus_data의 구조를 보고 어떤 TPL인지 자동 추론합니다.
 * recommended_template이 없는 ex2am.json 문항에 사용됩니다.
 */
export function inferTemplate(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if ('headers' in d && 'rows' in d) return 'TPL_COMPARATIVE_MATRIX';
  if ('doc_type' in d && 'header_info' in d && 'paragraphs' in d) return 'TPL_FORMAL_DOCUMENT';
  if ('participants' in d && 'messages' in d) return 'TPL_CONVERSATIONAL_FLOW';
  if ('case_profile' in d && 'narrative' in d && 'check_items' in d) return 'TPL_CASE_DIAGNOSTIC_FRAME';
  if ('orientation' in d && 'steps' in d) return 'TPL_SEQUENTIAL_WORKFLOW';
  if ('instructor' in d && 'canvas_content' in d && 'students' in d) return 'TPL_INSTRUCTIONAL_SCENE';
  if ('forum_name' in d && 'main_post' in d) return 'TPL_DIGITAL_FORUM_INTERFACE';
  if ('chart_type' in d && 'axes' in d && 'datasets' in d) return 'TPL_QUANTITATIVE_CHART';
  if ('slogan' in d && 'bullets' in d) return 'TPL_PROMOTIONAL_CANVAS';

  // 구조는 있는데 매칭 실패 → PLAIN_TEXT로 fallback
  if (Object.keys(d).length > 0) return 'TPL_PLAIN_TEXT';

  return null;
}

/**
 * exam.json의 stimulus_data를 recommended_template에 따라
 * 올바른 TPL_* 타입으로 파싱합니다.
 * recommended_template이 없으면 inferTemplate으로 자동 추론합니다.
 */
export function parseStimulus(
  template: string | undefined | null,
  data: unknown,
): ParsedStimulus | null {
  if (typeof data === 'string' && data.trim()) {
    return { template: 'TPL_PLAIN_TEXT', data };
  }

  const resolvedTemplate = template ?? inferTemplate(data);
  if (!resolvedTemplate) {
    // 템플릿 없어도 마지막 방어선
    if (data && typeof data === 'object') {
      return { template: 'TPL_PLAIN_TEXT', data: JSON.stringify(data, null, 2) };
    }
    if (typeof data === 'string') {
      return { template: 'TPL_PLAIN_TEXT', data };
    }
    return { template: 'TPL_PLAIN_TEXT', data: '' };
  }

  switch (resolvedTemplate) {
    case 'TPL_COMPARATIVE_MATRIX':
      return { template: 'TPL_COMPARATIVE_MATRIX', data: data as any };
    case 'TPL_FORMAL_DOCUMENT':
      return { template: 'TPL_FORMAL_DOCUMENT', data: data as any };
    case 'TPL_CONVERSATIONAL_FLOW':
      return { template: 'TPL_CONVERSATIONAL_FLOW', data: data as any };
    case 'TPL_CASE_DIAGNOSTIC_FRAME':
      return { template: 'TPL_CASE_DIAGNOSTIC_FRAME', data: data as any };
    case 'TPL_SEQUENTIAL_WORKFLOW':
      return { template: 'TPL_SEQUENTIAL_WORKFLOW', data: data as any };
    case 'TPL_INSTRUCTIONAL_SCENE':
      return { template: 'TPL_INSTRUCTIONAL_SCENE', data: data as any };
    case 'TPL_DIGITAL_FORUM_INTERFACE':
      return { template: 'TPL_DIGITAL_FORUM_INTERFACE', data: data as any };
    case 'TPL_QUANTITATIVE_CHART':
      return { template: 'TPL_QUANTITATIVE_CHART', data: data as any };
    case 'TPL_PROMOTIONAL_CANVAS':
      return { template: 'TPL_PROMOTIONAL_CANVAS', data: data as any };
    case 'TPL_PLAIN_TEXT': {
      if (typeof data === 'string') return { template: 'TPL_PLAIN_TEXT', data };
      if (data && typeof data === 'object' && 'content' in data) {
        const content = (data as Record<string, unknown>).content;
        if (typeof content === 'string') return { template: 'TPL_PLAIN_TEXT', data: content };
      }
      return null;
    }
    default:
      // 알 수 없는 template도 무조건 PLAIN_TEXT로 fallback
      if (data && typeof data === 'object') {
        return { template: 'TPL_PLAIN_TEXT', data: JSON.stringify(data, null, 2) };
      }
      if (typeof data === 'string') {
        return { template: 'TPL_PLAIN_TEXT', data };
      }
      return { template: 'TPL_PLAIN_TEXT', data: '' };
  }
}

/**
 * 템플릿 이름을 한국어 레이블로 변환합니다.
 */
export function getTemplateLabel(template: string): string {
  const labels: Record<string, string> = {
    TPL_COMPARATIVE_MATRIX: '비교 행렬',
    TPL_FORMAL_DOCUMENT: '공식 문서',
    TPL_CONVERSATIONAL_FLOW: '대화문',
    TPL_CASE_DIAGNOSTIC_FRAME: '사례 진단',
    TPL_SEQUENTIAL_WORKFLOW: '순서도',
    TPL_INSTRUCTIONAL_SCENE: '수업 장면',
    TPL_DIGITAL_FORUM_INTERFACE: '게시판',
    TPL_QUANTITATIVE_CHART: '차트',
    TPL_PROMOTIONAL_CANVAS: '광고문',
  };
  return labels[template] ?? template;
}

import type { ParsedStimulus } from '@/types/examQuestion';

function asRecord(data: unknown): Record<string, any> {
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, any>)
    : {};
}

function normalizeComparativeMatrix(data: unknown): any {
  const d = asRecord(data);
  return {
    headers: Array.isArray(d.headers) ? d.headers : [],
    rows: Array.isArray(d.rows) ? d.rows : [],
    selection_chips: Array.isArray(d.selection_chips) ? d.selection_chips : [],
  };
}

function normalizeFormalDocument(data: unknown): any {
  const d = asRecord(data);
  const header = asRecord(d.header_info);
  return {
    doc_type: typeof d.doc_type === 'string' ? d.doc_type : '',
    header_info: {
      title: typeof header.title === 'string' ? header.title : '',
      date: typeof header.date === 'string' ? header.date : '',
      author: typeof header.author === 'string' ? header.author : '',
    },
    paragraphs: Array.isArray(d.paragraphs) ? d.paragraphs : [],
    footnotes: Array.isArray(d.footnotes) ? d.footnotes : [],
  };
}

function normalizeConversationalFlow(data: unknown): any {
  const d = asRecord(data);
  return {
    participants: Array.isArray(d.participants) ? d.participants : [],
    messages: Array.isArray(d.messages) ? d.messages : [],
  };
}

function normalizeCaseDiagnosticFrame(data: unknown): any {
  const d = asRecord(data);
  const profile = asRecord(d.case_profile ?? d.profile);
  return {
    case_profile: {
      name: typeof profile.name === 'string' ? profile.name : '',
      context: typeof profile.context === 'string' ? profile.context : '',
    },
    narrative:
      typeof d.narrative === 'string'
        ? d.narrative
        : typeof d.profile === 'string'
          ? d.profile
          : '',
    check_items: Array.isArray(d.check_items) ? d.check_items : [],
  };
}

function normalizeSequentialWorkflow(data: unknown): any {
  const d = asRecord(data);
  const events = Array.isArray(d.events)
    ? d.events.map((event: any, index: number) => ({
        idx: index + 1,
        label: event?.date ?? event?.label ?? `Step ${index + 1}`,
        desc: event?.description ?? event?.activity ?? event?.content ?? '',
        is_missing: event?.is_missing === true,
      }))
    : [];
  return {
    orientation: d.orientation === 'vertical' ? 'vertical' : 'horizontal',
    steps: Array.isArray(d.steps) ? d.steps : events,
  };
}

function normalizeInstructionalScene(data: unknown): any {
  const d = asRecord(data);
  const instructor = asRecord(d.instructor);
  const canvas = asRecord(d.canvas_content);
  const rawCanvasType = canvas.type;
  const canvasType =
    rawCanvasType === 'table' ||
    rawCanvasType === 'image' ||
    rawCanvasType === 'mind_map' ||
    rawCanvasType === 'key_map'
      ? rawCanvasType
      : 'text';
  return {
    instructor: {
      id: typeof instructor.id === 'string' ? instructor.id : '',
      text: typeof instructor.text === 'string' ? instructor.text : '',
    },
    canvas_content: {
      type: canvasType,
      data: canvas.data ?? '',
    },
    students: Array.isArray(d.students) ? d.students : [],
  };
}

function normalizeDigitalForumInterface(data: unknown): any {
  const d = asRecord(data);
  const mainPost = asRecord(d.main_post ?? d.post);
  return {
    forum_name: typeof d.forum_name === 'string' ? d.forum_name : '',
    main_post: {
      author: typeof mainPost.author === 'string' ? mainPost.author : '',
      title: typeof mainPost.title === 'string' ? mainPost.title : '',
      content: typeof mainPost.content === 'string' ? mainPost.content : '',
    },
    comments: Array.isArray(d.comments) ? d.comments : [],
  };
}

function normalizeQuantitativeChart(data: unknown): any {
  const d = asRecord(data);
  return {
    chart_type:
      d.chart_type === 'radar' || d.chart_type === 'line' ? d.chart_type : 'bar',
    axes: Array.isArray(d.axes) ? d.axes : [],
    datasets: Array.isArray(d.datasets) ? d.datasets : [],
  };
}

function normalizePromotionalCanvas(data: unknown): any {
  const d = asRecord(data);
  return {
    slogan: typeof d.slogan === 'string' ? d.slogan : '',
    bullets: Array.isArray(d.bullets) ? d.bullets : [],
    visual_elements: Array.isArray(d.visual_elements) ? d.visual_elements : [],
    missing_part: typeof d.missing_part === 'string' ? d.missing_part : '',
  };
}

function normalizePlainText(data: unknown): string {
  if (typeof data === 'string') return data;
  const d = asRecord(data);
  if (typeof d.data === 'string') return d.data;
  if (typeof d.content === 'string') return d.content;
  if (typeof d.body === 'string') return d.body;
  if (typeof d.text === 'string') return d.text;
  if (typeof d.stimulus === 'string') return d.stimulus;
  if (data && typeof data === 'object') return JSON.stringify(data, null, 2);
  return '';
}

export function inferTemplate(data: unknown): string | null {
  if (typeof data === 'string') return 'TPL_PLAIN_TEXT';
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
  if ('profile' in d) return 'TPL_CASE_DIAGNOSTIC_FRAME';
  if ('events' in d) return 'TPL_SEQUENTIAL_WORKFLOW';
  if ('post' in d) return 'TPL_DIGITAL_FORUM_INTERFACE';
  if ('data' in d || 'content' in d || 'body' in d || 'text' in d || 'stimulus' in d) {
    return 'TPL_PLAIN_TEXT';
  }

  if (Object.keys(d).length > 0) return 'TPL_PLAIN_TEXT';
  return null;
}

export function parseStimulus(
  template: string | undefined | null,
  data: unknown,
): ParsedStimulus | null {
  const resolvedTemplate = template ?? inferTemplate(data);
  if (!resolvedTemplate) {
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
      return { template: 'TPL_COMPARATIVE_MATRIX', data: normalizeComparativeMatrix(data) };
    case 'TPL_FORMAL_DOCUMENT':
      return { template: 'TPL_FORMAL_DOCUMENT', data: normalizeFormalDocument(data) };
    case 'TPL_CONVERSATIONAL_FLOW':
      return { template: 'TPL_CONVERSATIONAL_FLOW', data: normalizeConversationalFlow(data) };
    case 'TPL_CASE_DIAGNOSTIC_FRAME':
      return { template: 'TPL_CASE_DIAGNOSTIC_FRAME', data: normalizeCaseDiagnosticFrame(data) };
    case 'TPL_SEQUENTIAL_WORKFLOW':
      return { template: 'TPL_SEQUENTIAL_WORKFLOW', data: normalizeSequentialWorkflow(data) };
    case 'TPL_INSTRUCTIONAL_SCENE':
      return { template: 'TPL_INSTRUCTIONAL_SCENE', data: normalizeInstructionalScene(data) };
    case 'TPL_DIGITAL_FORUM_INTERFACE':
      return { template: 'TPL_DIGITAL_FORUM_INTERFACE', data: normalizeDigitalForumInterface(data) };
    case 'TPL_QUANTITATIVE_CHART':
      return { template: 'TPL_QUANTITATIVE_CHART', data: normalizeQuantitativeChart(data) };
    case 'TPL_PROMOTIONAL_CANVAS':
      return { template: 'TPL_PROMOTIONAL_CANVAS', data: normalizePromotionalCanvas(data) };
    case 'TPL_PLAIN_TEXT':
      return { template: 'TPL_PLAIN_TEXT', data: normalizePlainText(data) };
    default:
      if (data && typeof data === 'object') {
        return { template: 'TPL_PLAIN_TEXT', data: JSON.stringify(data, null, 2) };
      }
      if (typeof data === 'string') {
        return { template: 'TPL_PLAIN_TEXT', data };
      }
      return { template: 'TPL_PLAIN_TEXT', data: '' };
  }
}

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

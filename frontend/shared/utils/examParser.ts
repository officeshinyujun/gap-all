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
    participants: Array.isArray(d.participants)
      ? d.participants.map((participant) => {
          const p = asRecord(participant);
          return {
            id: typeof p.id === 'string' ? p.id : '',
            name: typeof p.name === 'string' ? p.name : '',
            role: typeof p.role === 'string' ? p.role : '',
            ...(typeof p.icon_key === 'string' ? { icon_key: p.icon_key } : {}),
          };
        })
      : [],
    messages: Array.isArray(d.messages) ? d.messages : [],
    ...(typeof d.scene_kind === 'string' ? { scene_kind: d.scene_kind } : {}),
    ...(d.visual_aid && typeof d.visual_aid === 'object'
      ? { visual_aid: d.visual_aid }
      : {}),
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

function normalizeArticle(data: unknown): any {
  const d = asRecord(data);
  return {
    title: typeof d.title === 'string' ? d.title : '',
    body_paragraphs: normalizeArticleBodyParagraphs(d.body_paragraphs),
    byline: typeof d.byline === 'string' ? d.byline : '',
    published_date: typeof d.published_date === 'string' ? d.published_date : '',
    source: typeof d.source === 'string' ? d.source : '',
  };
}

function normalizeArticleBodyParagraphs(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.flatMap((paragraph) => {
    if (typeof paragraph === 'string') return [paragraph];
    const legacy = asRecord(paragraph);
    return typeof legacy.content === 'string' ? [legacy.content] : [];
  });
}

function normalizeStatistics(data: unknown): any {
  const d = asRecord(data);
  return {
    title: typeof d.title === 'string' ? d.title : '',
    category_label: typeof d.category_label === 'string' ? d.category_label : '',
    data_entries: Array.isArray(d.data_entries) ? d.data_entries : [],
    unit: typeof d.unit === 'string' ? d.unit : '',
    source: typeof d.source === 'string' ? d.source : '',
  };
}

function normalizeIncidentReport(data: unknown): any {
  const d = asRecord(data);
  return {
    title: typeof d.title === 'string' ? d.title : '',
    incident_type: typeof d.incident_type === 'string' ? d.incident_type : '',
    date: typeof d.date === 'string' ? d.date : '',
    location: typeof d.location === 'string' ? d.location : '',
    overview: typeof d.overview === 'string' ? d.overview : '',
    cause: typeof d.cause === 'string' ? d.cause : '',
    damage: typeof d.damage === 'string' ? d.damage : '',
    response: typeof d.response === 'string' ? d.response : '',
    prevention: typeof d.prevention === 'string' ? d.prevention : '',
    timeline: Array.isArray(d.timeline) ? d.timeline : [],
  };
}

function normalizeAnnouncement(data: unknown): any {
  const d = asRecord(data);
  const schedule = asRecord(d.schedule);
  return {
    title: typeof d.title === 'string' ? d.title : '',
    organizer: typeof d.organizer === 'string' ? d.organizer : '',
    schedule: {
      start: typeof schedule.start === 'string' ? schedule.start : '',
      end: typeof schedule.end === 'string' ? schedule.end : '',
    },
    location: typeof d.location === 'string' ? d.location : '',
    target: typeof d.target === 'string' ? d.target : '',
    details: Array.isArray(d.details) ? d.details : [],
    contact: typeof d.contact === 'string' ? d.contact : '',
  };
}

function normalizeReport(data: unknown): any {
  const d = asRecord(data);
  return {
    title: typeof d.title === 'string' ? d.title : '',
    author: typeof d.author === 'string' ? d.author : '',
    date: typeof d.date === 'string' ? d.date : '',
    metadata: Array.isArray(d.metadata) ? d.metadata : [],
    sections: Array.isArray(d.sections) ? d.sections : [],
    conclusion: typeof d.conclusion === 'string' ? d.conclusion : '',
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
  if ('body_paragraphs' in d && 'title' in d) return 'TPL_ARTICLE';
  if ('data_entries' in d && Array.isArray(d.data_entries) && d.data_entries.length > 0) return 'TPL_STATISTICS';
  if ('incident_type' in d && 'overview' in d) return 'TPL_INCIDENT_REPORT';
  if ('organizer' in d && 'details' in d) return 'TPL_ANNOUNCEMENT';
  if ('sections' in d && Array.isArray(d.sections) && d.sections.length > 0) return 'TPL_REPORT';
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
    case 'TPL_ARTICLE':
      return { template: 'TPL_ARTICLE', data: normalizeArticle(data) };
    case 'TPL_STATISTICS':
      return { template: 'TPL_STATISTICS', data: normalizeStatistics(data) };
    case 'TPL_INCIDENT_REPORT':
      return { template: 'TPL_INCIDENT_REPORT', data: normalizeIncidentReport(data) };
    case 'TPL_ANNOUNCEMENT':
      return { template: 'TPL_ANNOUNCEMENT', data: normalizeAnnouncement(data) };
    case 'TPL_REPORT':
      return { template: 'TPL_REPORT', data: normalizeReport(data) };
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
    TPL_ARTICLE: '기사문',
    TPL_STATISTICS: '통계',
    TPL_INCIDENT_REPORT: '사고 보고서',
    TPL_ANNOUNCEMENT: '공고문',
    TPL_REPORT: '보고서',
  };
  return labels[template] ?? template;
}

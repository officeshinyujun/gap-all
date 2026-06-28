import { Logger } from '@nestjs/common';

type TplName =
  | 'TPL_COMPARATIVE_MATRIX'
  | 'TPL_FORMAL_DOCUMENT'
  | 'TPL_CONVERSATIONAL_FLOW'
  | 'TPL_CASE_DIAGNOSTIC_FRAME'
  | 'TPL_SEQUENTIAL_WORKFLOW'
  | 'TPL_INSTRUCTIONAL_SCENE'
  | 'TPL_DIGITAL_FORUM_INTERFACE'
  | 'TPL_QUANTITATIVE_CHART'
  | 'TPL_PROMOTIONAL_CANVAS'
  | 'TPL_PLAIN_TEXT';

const ALL_TPLS: TplName[] = [
  'TPL_COMPARATIVE_MATRIX',
  'TPL_FORMAL_DOCUMENT',
  'TPL_CONVERSATIONAL_FLOW',
  'TPL_CASE_DIAGNOSTIC_FRAME',
  'TPL_SEQUENTIAL_WORKFLOW',
  'TPL_INSTRUCTIONAL_SCENE',
  'TPL_DIGITAL_FORUM_INTERFACE',
  'TPL_QUANTITATIVE_CHART',
  'TPL_PROMOTIONAL_CANVAS',
  'TPL_PLAIN_TEXT',
];

export class StimulusNormalizer {
  private readonly logger = new Logger(StimulusNormalizer.name);

  normalizeItems(items: any[]): any[] {
    return items.map((item, i) => {
      try {
        return this.normalizeItem(item);
      } catch (e) {
        this.logger.warn(`문항 ${i} 정규화 실패, 원본 유지: ${e.message}`);
        return item;
      }
    });
  }

  normalizeItem(item: any): any {
    if (!item) return item;

    const meta = item.metadata ?? {};
    const rr = item.render_ready ?? {};
    const declared = meta.recommended_template ?? '';
    const data = rr.stimulus_data ?? {};

    const detected = this.detectTpl(data);
    const resolved = detected ?? declared;

    if (detected && detected !== declared) {
      this.logger.log(
        `TPL 불일치: declared=${declared}, detected=${detected} → ${detected}로 변경`,
      );
      meta.recommended_template = detected;
    }

    // 알 수 없는 TPL → 강제 PLAIN_TEXT 변환
    const finalTpl = !ALL_TPLS.includes(resolved as TplName) ? 'TPL_PLAIN_TEXT' : resolved;
    if (finalTpl !== declared) {
      meta.recommended_template = finalTpl;
    }

    // 항상 fillDefaults 실행 (pass-through 제거, AI 데이터 신뢰 불가)
    const normalized = this.fillDefaults(data, finalTpl);

    return {
      ...item,
      metadata: meta,
      render_ready: {
        ...rr,
        stimulus_data: normalized,
      },
    };
  }

  private detectTpl(data: any): TplName | null {
    if (!data || typeof data !== 'object') return null;

    if (Array.isArray(data.rows) && Array.isArray(data.headers)) {
      return 'TPL_COMPARATIVE_MATRIX';
    }
    if (
      typeof data.doc_type === 'string' &&
      Array.isArray(data.paragraphs)
    ) {
      return 'TPL_FORMAL_DOCUMENT';
    }
    if (
      Array.isArray(data.participants) &&
      Array.isArray(data.messages)
    ) {
      return 'TPL_CONVERSATIONAL_FLOW';
    }
    if (
      data.case_profile &&
      typeof data.case_profile === 'object' &&
      Array.isArray(data.check_items)
    ) {
      return 'TPL_CASE_DIAGNOSTIC_FRAME';
    }
    if (Array.isArray(data.steps) && data.orientation) {
      return 'TPL_SEQUENTIAL_WORKFLOW';
    }
    if (
      data.instructor &&
      typeof data.instructor === 'object' &&
      data.canvas_content &&
      typeof data.canvas_content === 'object'
    ) {
      return 'TPL_INSTRUCTIONAL_SCENE';
    }
    if (
      typeof data.forum_name === 'string' &&
      data.main_post &&
      typeof data.main_post === 'object' &&
      Array.isArray(data.comments)
    ) {
      return 'TPL_DIGITAL_FORUM_INTERFACE';
    }
    if (
      typeof data.chart_type === 'string' &&
      (Array.isArray(data.axes) || Array.isArray(data.datasets))
    ) {
      return 'TPL_QUANTITATIVE_CHART';
    }
    if (
      typeof data.slogan === 'string' &&
      Array.isArray(data.bullets)
    ) {
      return 'TPL_PROMOTIONAL_CANVAS';
    }
    if (typeof data.data === 'string' || typeof data.content === 'string') {
      return 'TPL_PLAIN_TEXT';
    }
    // 구조는 있지만 알 수 없는 TPL → null (호출부에서 PLAIN_TEXT로 강제)
    if (typeof data === 'object' && data !== null && Object.keys(data).length > 0) {
      return 'TPL_PLAIN_TEXT';
    }
    return null;
  }

  private isValidShape(data: any, tpl: TplName): boolean {
    if (!data || typeof data !== 'object') return false;
    switch (tpl) {
      case 'TPL_COMPARATIVE_MATRIX':
        return (
          Array.isArray(data.headers) &&
          data.headers.length > 0 &&
          Array.isArray(data.rows) &&
          data.rows.length > 0
        );
      case 'TPL_FORMAL_DOCUMENT':
        return (
          typeof data.doc_type === 'string' &&
          data.doc_type.length > 0 &&
          Array.isArray(data.paragraphs) &&
          data.paragraphs.length > 0
        );
      case 'TPL_CONVERSATIONAL_FLOW':
        return (
          Array.isArray(data.participants) &&
          data.participants.length > 0 &&
          Array.isArray(data.messages) &&
          data.messages.length > 0
        );
      case 'TPL_CASE_DIAGNOSTIC_FRAME':
        return (
          data.case_profile &&
          typeof data.case_profile === 'object' &&
          typeof data.case_profile.name === 'string' &&
          Array.isArray(data.check_items)
        );
      case 'TPL_SEQUENTIAL_WORKFLOW':
        return (
          Array.isArray(data.steps) &&
          data.steps.length > 0 &&
          (data.orientation === 'horizontal' || data.orientation === 'vertical')
        );
      case 'TPL_INSTRUCTIONAL_SCENE':
        return (
          data.instructor &&
          typeof data.instructor === 'object' &&
          typeof data.instructor.id === 'string' &&
          data.canvas_content &&
          typeof data.canvas_content === 'object' &&
          typeof data.canvas_content.type === 'string'
        );
      case 'TPL_DIGITAL_FORUM_INTERFACE':
        return (
          typeof data.forum_name === 'string' &&
          data.forum_name.length > 0 &&
          data.main_post &&
          typeof data.main_post === 'object' &&
          Array.isArray(data.comments)
        );
      case 'TPL_QUANTITATIVE_CHART':
        return (
          typeof data.chart_type === 'string' &&
          Array.isArray(data.axes) &&
          data.axes.length > 0 &&
          Array.isArray(data.datasets) &&
          data.datasets.length > 0
        );
      case 'TPL_PROMOTIONAL_CANVAS':
        return (
          typeof data.slogan === 'string' &&
          Array.isArray(data.bullets)
        );
      case 'TPL_PLAIN_TEXT':
        return typeof data.data === 'string' && data.data.length > 0;
      default:
        return false;
    }
  }

  private fillDefaults(data: any, tpl: TplName): any {
    switch (tpl) {
      case 'TPL_COMPARATIVE_MATRIX':
        return {
          headers: Array.isArray(data?.headers)
            ? data.headers.map((h: any) => ({
                id: h.id ?? '',
                label: h.label ?? '',
              }))
            : [],
          rows: Array.isArray(data?.rows)
            ? data.rows.map((r: any) => ({
                id: r.id ?? '',
                cells: Array.isArray(r.cells) ? r.cells : [],
              }))
            : [],
          selection_chips: Array.isArray(data?.selection_chips)
            ? data.selection_chips
            : [],
        };

      case 'TPL_FORMAL_DOCUMENT':
        return {
          doc_type: typeof data?.doc_type === 'string' ? data.doc_type : '',
          header_info:
            data?.header_info && typeof data.header_info === 'object'
              ? {
                  title: data.header_info.title ?? '',
                  date: data.header_info.date ?? '',
                  author: data.header_info.author ?? '',
                }
              : { title: '', date: '', author: '' },
          paragraphs: Array.isArray(data?.paragraphs)
            ? data.paragraphs.map((p: any) => ({
                sub_title: p.sub_title ?? '',
                content: p.content ?? '',
              }))
            : [],
          footnotes: Array.isArray(data?.footnotes) ? data.footnotes : [],
        };

      case 'TPL_CONVERSATIONAL_FLOW':
        return {
          participants: Array.isArray(data?.participants)
            ? data.participants.map((p: any) => ({
                id: p.id ?? '',
                name: p.name ?? '',
                role: p.role ?? '',
              }))
            : [],
          messages: Array.isArray(data?.messages)
            ? data.messages.map((m: any) => ({
                p_id: m.p_id ?? '',
                text: m.text ?? '',
                timestamp: m.timestamp ?? '',
              }))
            : [],
        };

      case 'TPL_CASE_DIAGNOSTIC_FRAME':
        return {
          case_profile:
            data?.case_profile && typeof data.case_profile === 'object'
              ? {
                  name: data.case_profile.name ?? '',
                  context: data.case_profile.context ?? '',
                }
              : { name: '', context: '' },
          narrative:
            typeof data?.narrative === 'string' ? data.narrative : '',
          check_items: Array.isArray(data?.check_items)
            ? data.check_items.map((ci: any) => ({
                id: ci.id ?? '',
                label: ci.label ?? '',
                is_checked: false,
              }))
            : [],
        };

      case 'TPL_SEQUENTIAL_WORKFLOW':
        return {
          orientation:
            data?.orientation === 'vertical' ? 'vertical' : 'horizontal',
          steps: Array.isArray(data?.steps)
            ? data.steps.map((s: any) => ({
                idx: typeof s.idx === 'number' ? s.idx : 0,
                label: s.label ?? '',
                desc: s.desc ?? '',
                is_missing: s.is_missing === true,
              }))
            : [],
        };

      case 'TPL_INSTRUCTIONAL_SCENE':
        return {
          instructor:
            data?.instructor && typeof data.instructor === 'object'
              ? {
                  id: data.instructor.id ?? '',
                  text: data.instructor.text ?? '',
                }
              : { id: '', text: '' },
          canvas_content:
            data?.canvas_content && typeof data.canvas_content === 'object'
              ? {
                  type: data.canvas_content.type ?? 'text',
                  data: data.canvas_content.data ?? '',
                }
              : { type: 'text' as const, data: '' },
          students: Array.isArray(data?.students)
            ? data.students.map((s: any) => ({
                id: s.id ?? '',
                text: s.text ?? '',
              }))
            : [],
        };

      case 'TPL_DIGITAL_FORUM_INTERFACE':
        return {
          forum_name:
            typeof data?.forum_name === 'string' ? data.forum_name : '',
          main_post:
            data?.main_post && typeof data.main_post === 'object'
              ? {
                  author: data.main_post.author ?? '',
                  title: data.main_post.title ?? '',
                  content: data.main_post.content ?? '',
                }
              : { author: '', title: '', content: '' },
          comments: Array.isArray(data?.comments)
            ? data.comments.map((c: any) => ({
                author: c.author ?? '',
                text: c.text ?? c.content ?? '',
              }))
            : [],
        };

      case 'TPL_QUANTITATIVE_CHART':
        return {
          chart_type:
            typeof data?.chart_type === 'string' ? data.chart_type : 'bar',
          axes: Array.isArray(data?.axes)
            ? data.axes.map((a: any) => ({
                key: a.key ?? '',
                label: a.label ?? '',
                max: typeof a.max === 'number' ? a.max : 10,
              }))
            : [],
          datasets: Array.isArray(data?.datasets)
            ? data.datasets.map((ds: any) => ({
                label: ds.label ?? '',
                values: Array.isArray(ds.values) ? ds.values : [],
              }))
            : [],
        };

      case 'TPL_PROMOTIONAL_CANVAS':
        return {
          slogan:
            typeof data?.slogan === 'string' ? data.slogan : '',
          bullets: Array.isArray(data?.bullets) ? data.bullets : [],
          visual_elements: Array.isArray(data?.visual_elements)
            ? data.visual_elements
            : [],
          missing_part:
            typeof data?.missing_part === 'string' ? data.missing_part : '',
        };

      case 'TPL_PLAIN_TEXT':
      default:
        return {
          data:
            typeof data?.data === 'string'
              ? data.data
              : typeof data?.content === 'string'
                ? data.content
                : '',
        };
    }
  }
}

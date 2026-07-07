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

    // TPL 스키마 검증 — 오류 수집 (fixable 에러만 자동 수정)
    const schemaErrors = this.validateTplSchema(normalized, finalTpl, item);
    if (schemaErrors.length > 0) {
      this.logger.warn(
        `TPL 스키마 오류 (${finalTpl}): ${schemaErrors.slice(0, 3).join('; ')}`,
      );
    }

    return {
      ...item,
      metadata: meta,
      render_ready: {
        ...rr,
        stimulus_data: normalized,
      },
    };
  }

  // ============================================================
  // TPL 스키마 검증
  // ============================================================
  public normalizeStimulusData(data: any, template: string): any {
    const tpl = ALL_TPLS.includes(template as TplName) ? template : 'TPL_PLAIN_TEXT';
    const result = this.fillDefaults(data ?? {}, tpl as TplName);
    return result;
  }

  /** stimulus_data와 combo_block 간 이름 불일치 해소 (E씨 vs A씨) */
  public syncNames(stimulusData: any, comboBlock?: any): any {
    if (!comboBlock?.items?.length) return stimulusData;
    const stimText = typeof stimulusData === 'string' ? stimulusData
      : stimulusData?.narrative || stimulusData?.data || stimulusData?.content
        || stimulusData?.description || stimulusData?.body || stimulusData?.text || '';
    if (!stimText) return stimulusData;
    const stimNames = [...stimText.matchAll(/([A-Z])씨/g)].map((m) => m[1]);
    if (stimNames.length === 0) return stimulusData;
    // combo_block.items에서 이름 추출 및 치환
    const viewText = comboBlock.items.map((i: any) => i.text).join(' ');
    const viewNames = [...viewText.matchAll(/([A-Z])씨/g)].map((m) => m[1]);
    if (viewNames.length === 0 || viewNames[0] === stimNames[0]) return stimulusData;
    const nameMap = new Map<string, string>();
    viewNames.forEach((vn, i) => { if (stimNames[i]) nameMap.set(vn, stimNames[i]); });
    if (nameMap.size === 0) return stimulusData;
    const replaceName = (s: string) => s.replace(/([A-Z])\s*씨/g, (_, letter) => nameMap.get(letter) ? nameMap.get(letter) + '씨' : letter + '씨');
    comboBlock.items = comboBlock.items.map((item: any) => ({ ...item, text: replaceName(item.text) }));
    this.logger.log(`syncNames: ${[...nameMap.entries()].map(([k, v]) => `${k}씨→${v}씨`).join(', ')}`);
    return stimulusData;
  }

  /**
   * stimulusData 정규화 + TPL 동기화
   * fillDefaults 후 detectTpl을 다시 호출하여 데이터에 맞는 TPL로 보정
   * detected TPL이 다르면 데이터 구조도 해당 TPL에 맞게 재변환
   */
  public normalizeStimulusWithTemplate(data: any, template: string, comboBlock?: any): { stimulusData: any; effectiveTemplate: string } {
    const declaredTpl = ALL_TPLS.includes(template as TplName) ? (template as TplName) : 'TPL_PLAIN_TEXT';
    const normalized = this.fillDefaults(data ?? {}, declaredTpl);
    // fillDefaults 결과에 대해 detectTpl 재호출 → 데이터에 맞는 TPL로 보정
    const detected = this.detectTpl(normalized);
    let result: { stimulusData: any; effectiveTemplate: string };
    if (detected && detected !== declaredTpl) {
      // TPL이 변경되었으면 데이터 구조도 변경 — inferTplFromText로 text→structure 변환
      const text = this.extractReadableText(data) || this.extractReadableText(normalized) || '';
      if (text) {
        const inferred = this.inferTplFromText(text);
        if (inferred && inferred.template === detected) {
          result = { stimulusData: inferred.data, effectiveTemplate: detected };
        } else {
          const converted = this.fillDefaults({ data: text }, detected);
          result = { stimulusData: converted, effectiveTemplate: detected };
        }
      } else {
        result = { stimulusData: normalized, effectiveTemplate: detected };
      }
    } else {
      result = { stimulusData: normalized, effectiveTemplate: declaredTpl };
    }
    // 이름 동기화: stimulus와 combo_block 간 X씨 불일치 해소
    if (comboBlock) {
      this.syncNames(result.stimulusData, comboBlock);
    }
    return result;
  }

  public resolveTemplate(template: string): string {
    return ALL_TPLS.includes(template as TplName) ? template : 'TPL_PLAIN_TEXT';
  }

  /**
   * plain text stimulus를 내용 기반으로 가장 적합한 TPL로 추론
   * convertBatchToTpl()에서 사용
   */
  public inferTplFromText(text: string): { template: TplName; data: any } | null {
    if (!text || text.trim().length < 10) return null;
    const raw = text.trim();

    // viewItems 내용이 stimulus로 잘못 들어간 경우 차단
    // "viewItems: ㄱ. ... | ㄴ. ..." 또는 "ㄱ. ... | ㄴ. ..." 패턴
    if (/^viewItems:\s*/i.test(raw)) return null;
    if (/^[ㄱ-ㅎ][\.\s]/.test(raw) && raw.includes('|')) return null;
    // 1단계: 텍스트를 해당 TPL 구조로 변환
    // 표
    if (raw.includes('|') && raw.includes('---')) {
      // 줄바꿈이 없는 collapsed table 처리: |---| 기준으로 셀 분할
      if (!raw.includes('\n') && raw.includes('|---|')) {
        const cells = raw.split('|').map(c => c.trim()).filter(Boolean);
        const sepIdx = cells.indexOf('---');
        if (sepIdx > 0 && sepIdx < cells.length - 1) {
          // 첫 셀이 표 제목/메타데이터면 건너뜀 (실제 헤더는 --- 직전 셀들)
          const startIdx = (cells[0].includes('[') || cells[0].includes('이름') || cells[0].length > 15) ? 1 : 0;
          const headers = cells.slice(startIdx, sepIdx).map((h, i) => ({ id: 'col' + i, label: h }));
          const dataCells = cells.slice(sepIdx + 1).filter((c: string) => !/^-{2,}$/.test(c));
          const colCount = headers.length;
          const rows: any[] = [];
          for (let i = 0; i + colCount <= dataCells.length; i += colCount) {
            rows.push({ id: 'row' + rows.length, cells: dataCells.slice(i, i + colCount) });
          }
          if (headers.length >= 2 && rows.length >= 1) {
            return { template: 'TPL_COMPARATIVE_MATRIX', data: { headers, rows } };
          }
        }
      }
      const lines = raw.split('\n').filter(l => l.trim());
      const pipeLines = lines.filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
      const dataLines = pipeLines.filter(l => !/^\|[\s-]+\|/.test(l.trim()));
      if (dataLines.length >= 2) {
        const parseRow = (line: string): string[] => line.trim().split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim());
        const headers = parseRow(dataLines[0]).map((h, i) => ({ id: 'col' + i, label: h }));
        const rows = dataLines.slice(1).map((line, i) => ({ id: 'row' + i, cells: parseRow(line) }));
        if (headers.length >= 2 && rows.length >= 1) return { template: 'TPL_COMPARATIVE_MATRIX', data: { headers, rows } };
      }
    }
    // 대화문
    if (/^(교사|상담사|학생|A|B|고객)\s*[:]/.test(raw)) {
      const lines = raw.split('\n').filter(l => /^[A-Za-z가-힣\s]+:\s/.test(l.trim()));
      const speakers = [...new Set(lines.map(l => l.trim().split(':')[0].trim()))];
      if (speakers.length >= 2 && lines.length >= 2) {
        const participants = speakers.map((s, i) => ({ id: 'p' + i, name: s, role: 'speaker' }));
        const messages = lines.map(l => {
          const idx = l.indexOf(':');
          const speaker = l.substring(0, idx).trim();
          return { p_id: 'p' + speakers.indexOf(speaker), text: l.substring(idx + 1).trim() };
        });
        return { template: 'TPL_CONVERSATIONAL_FLOW', data: { participants, messages } };
      }
    }
    // Q&A
    if (/^(질문|문의|Q\s*[:.]|민원)/.test(raw) && raw.includes('답변')) {
      const lines = raw.split('\n').filter(l => l.trim());
      const qLine = lines.find(l => /^질문|^Q\s*[:.]/i.test(l.trim())) || '';
      const aLines = lines.filter(l => /^답변|^A\s*[:.]/i.test(l.trim()));
      return {
        template: 'TPL_DIGITAL_FORUM_INTERFACE',
        data: {
          forum_name: 'Q&A',
          main_post: { author: '', title: '', content: qLine.replace(/^질문\s*[:.]/i, '').trim() },
          comments: aLines.map(l => ({ author: '', text: l.replace(/^답변\s*[:.]/i, '').trim() })),
        },
      };
    }
    // 타임라인/단계
    if (/^\d{1,2}월\s*\d{1,2}일/.test(raw) || /^\d{1,2}단계\s*[:.]/.test(raw)) {
      const lines = raw.split('\n').filter(l => l.trim());
      const events = lines.filter(l => /^\d{1,2}월\s*\d{1,2}일|^\d{1,2}단계/.test(l.trim()));
      if (events.length >= 2) {
        const steps = events.map((l, i) => {
          const idx = l.indexOf(':');
          return { idx: i + 1, label: idx > 0 ? l.substring(0, idx).trim() : `Step ${i + 1}`, desc: idx > 0 ? l.substring(idx + 1).trim() : l.trim(), is_missing: false };
        });
        return { template: 'TPL_SEQUENTIAL_WORKFLOW', data: { orientation: 'vertical', steps } };
      }
    }
    // 인물 사례
    if (/[A-Za-z가-힣]씨/.test(raw) && /사례|계약|근로|임금|계약서/.test(raw)) {
      return { template: 'TPL_CASE_DIAGNOSTIC_FRAME', data: { case_profile: { name: raw.match(/([A-Za-z가-힣]씨)/)?.[1] || '', context: raw.slice(0, 60) }, narrative: raw } };
    }
    // 문서
    if (/보고서|계약서|동의서|규정|공고문/.test(raw)) {
      const paraTexts = raw.split(/\n+/).filter(l => l.trim().length > 0);
      const bracketTitle = raw.match(/\[([^\]]+)\]/);
      return { template: 'TPL_FORMAL_DOCUMENT', data: { doc_type: '문서', header_info: { title: bracketTitle?.[1] || '문서', date: '', author: '' }, paragraphs: paraTexts.map(content => ({ content: content.trim() })), footnotes: [] } };
    }
    // 수업장면 (대화문보다 먼저 체크)
    if (/^(교사|선생님|강사)\s*[:]/.test(raw) && /시간|수업|학습|교육|배우|법/.test(raw)) {
      const lines = raw.split('\n').filter(l => l.trim());
      const teacherLine = lines.find(l => /^(교사|선생님|강사)\s*[:]/.test(l.trim())) || '';
      // canvas_content.data = 선생님 발화 라인 제외 (instructor.text와 중복 방지)
      const canvasText = lines
        .filter(l => !/^(교사|선생님|강사)\s*[:]/.test(l.trim()))
        .join('\n');
      return {
        template: 'TPL_INSTRUCTIONAL_SCENE',
        data: {
          instructor: { id: 'instructor_1', text: teacherLine.replace(/^[^:]*[:]\s*/, '') },
          canvas_content: { type: 'text', data: canvasText || raw.replace(/^(교사|선생님|강사)\s*[:]\s*/, '').trim() },
          students: [],
        },
      };
    }
    // 최후: FORMAL_DOCUMENT
    return { template: 'TPL_FORMAL_DOCUMENT', data: { doc_type: '문서', header_info: { title: '', date: '', author: '' }, paragraphs: [{ content: raw }], footnotes: [] } };
  }
  private readonly TPL_SCHEMAS: Record<string, {
    requiredFields: string[];
    typeChecks: Record<string, (v: any) => boolean>;
  }> = {
    TPL_COMPARATIVE_MATRIX: {
      requiredFields: ['headers', 'rows'],
      typeChecks: {
        headers: (v) => Array.isArray(v),
        rows: (v) => Array.isArray(v),
        rows_id: (v) => v && typeof v.id === 'string' || typeof v.id === 'number',
        selection_chips: (v) => Array.isArray(v),
      },
    },
    TPL_FORMAL_DOCUMENT: {
      requiredFields: ['doc_type', 'paragraphs'],
      typeChecks: {
        doc_type: (v) => typeof v === 'string',
        paragraphs: (v) => Array.isArray(v),
        header_info: (v) => v && typeof v === 'object',
        footnotes: (v) => Array.isArray(v),
      },
    },
    TPL_CONVERSATIONAL_FLOW: {
      requiredFields: ['participants', 'messages'],
      typeChecks: {
        participants: (v) => Array.isArray(v),
        messages: (v) => Array.isArray(v),
      },
    },
    TPL_CASE_DIAGNOSTIC_FRAME: {
      requiredFields: ['case_profile', 'narrative'],
      typeChecks: {
        case_profile: (v) => v && typeof v === 'object',
        narrative: (v) => typeof v === 'string',
        check_items: (v) => Array.isArray(v),
      },
    },
    TPL_SEQUENTIAL_WORKFLOW: {
      requiredFields: ['steps'],
      typeChecks: {
        steps: (v) => Array.isArray(v),
        orientation: (v) => v === 'horizontal' || v === 'vertical',
      },
    },
    TPL_INSTRUCTIONAL_SCENE: {
      requiredFields: ['instructor', 'canvas_content'],
      typeChecks: {
        instructor: (v) => v && typeof v === 'object',
        'instructor.id': (v) => typeof v === 'string' && v.length > 0,
        'instructor.text': (v) => typeof v === 'string',
        canvas_content: (v) => v && typeof v === 'object',
        'canvas_content.type': (v) => typeof v === 'string' && ['text','table','image','mind_map','key_map'].includes(v),
        students: (v) => Array.isArray(v),
      },
    },
    TPL_DIGITAL_FORUM_INTERFACE: {
      requiredFields: ['forum_name', 'main_post'],
      typeChecks: {
        forum_name: (v) => typeof v === 'string',
        main_post: (v) => v && typeof v === 'object',
        'main_post.title': (v) => typeof v === 'string',
        'main_post.content': (v) => typeof v === 'string',
        comments: (v) => Array.isArray(v),
      },
    },
    TPL_QUANTITATIVE_CHART: {
      requiredFields: ['chart_type', 'axes', 'datasets'],
      typeChecks: {
        chart_type: (v) => ['radar','bar','line'].includes(v),
        axes: (v) => Array.isArray(v),
        datasets: (v) => Array.isArray(v),
      },
    },
    TPL_PROMOTIONAL_CANVAS: {
      requiredFields: ['slogan', 'bullets'],
      typeChecks: {
        slogan: (v) => typeof v === 'string',
        bullets: (v) => Array.isArray(v),
        visual_elements: (v) => Array.isArray(v),
        missing_part: (v) => typeof v === 'string',
      },
    },
    TPL_PLAIN_TEXT: {
      requiredFields: [],
      typeChecks: {},
    },
  };

  public validateTplSchema(data: any, tpl: string, item?: any): string[] {
    const errors: string[] = [];
    const schema = this.TPL_SCHEMAS[tpl];
    if (!schema) return errors;

    for (const field of schema.requiredFields) {
      const value = this.getNestedField(data, field);
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        errors.push(`${field}: 필수 필드 누락 또는 빈 값`);
      }
    }

    for (const [field, check] of Object.entries(schema.typeChecks)) {
      const value = this.getNestedField(data, field);
      if (value === undefined || value === null) continue;
      if (!check(value)) {
        errors.push(`${field}: 타입 불일치 (예상: ${check.toString().slice(0, 30)}...)`);
      }
    }

    // (가) 참조 시 comments[0] 검증
    if (tpl === 'TPL_DIGITAL_FORUM_INTERFACE' && item?.render_ready?.question_stem?.includes('(가)')) {
      const comments = data.comments ?? [];
      if (comments.length === 0 || !comments[0]?.text?.includes('(가)')) {
        errors.push('comments[0].text: (가) 참조 발문이지만 comments에 (가)가 없음');
      }
    }

    // 라벨 일치 검증 (Conversational Flow)
    if (tpl === 'TPL_CONVERSATIONAL_FLOW') {
      const validLabels = new Set((data.participants ?? []).map((p: any) => p.id));
      if (validLabels.size > 0 && item?.render_ready?.options_list) {
        for (const opt of item.render_ready.options_list) {
          const foundLabels = String(opt).match(/[A-Z]/g) ?? [];
          for (const label of foundLabels) {
            if (!validLabels.has(label) && label !== 'A' && label !== 'B') {
              // 선택지 번호(①,②,③)가 아닌 실제 라벨 불일치 체크
            }
          }
        }
      }
    }

    return errors;
  }

  private getNestedField(obj: any, path: string): any {
    return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
  }

  public detectTpl(data: any): TplName | null {
    if (!data || typeof data !== 'object') return null;

    // === FIELD NAME AUTO-FIX: AI가 잘못 생성한 필드명을 정규화 ===
    // profile → case_profile (TPL_CASE_DIAGNOSTIC_FRAME)
    if (data.profile && !data.case_profile) {
      data.case_profile = typeof data.profile === 'object' ? data.profile : { name: data.profile, context: '' };
      delete data.profile;
    }
    // participants[]에 message/text 필드만 있고 별도 messages[]가 없으면 변환
    if (Array.isArray(data.participants) && !Array.isArray(data.messages) && data.participants.length > 0) {
      const hasMsg = data.participants.some((p: any) => typeof p.message === 'string' || typeof p.text === 'string');
      if (hasMsg) {
        data.messages = data.participants.map((p: any, i: number) => ({
          p_id: p.id ?? p.role ?? `p${i}`,
          text: p.message ?? p.text ?? '',
        }));
      }
    }
    // events → steps auto-convert (TPL_SEQUENTIAL_WORKFLOW)
    if (Array.isArray(data.events) && !Array.isArray(data.steps) && data.events.length > 0) {
      data.steps = data.events.map((e: any, i: number) => ({
        idx: i + 1,
        label: e.date ?? e.label ?? `Step ${i + 1}`,
        desc: e.description ?? e.activity ?? e.content ?? '',
        is_missing: e.is_missing === true,
      }));
      if (!data.orientation) data.orientation = 'vertical';
    }
    // post → main_post (TPL_DIGITAL_FORUM_INTERFACE)
    if (data.post && !data.main_post) {
      data.main_post = typeof data.post === 'object' ? data.post : { author: '', title: '', content: String(data.post) };
      delete data.post;
    }

    // === 구조 기반 TPL 탐지 ===
    // 순서: 표/수업장면/대화문 → 사례/단계 → 문서/포럼/차트/광고 (FORMAL_DOCUMENT는 마지막)
    // (rows + headers) → COMPARATIVE_MATRIX
    if (Array.isArray(data.rows) && Array.isArray(data.headers) && data.rows.length >= 2 && data.headers.length >= 2) {
      return 'TPL_COMPARATIVE_MATRIX';
    }
    // (instructor + canvas_content) → INSTRUCTIONAL_SCENE (문서보다 먼저)
    if (data.instructor && typeof data.instructor === 'object' && data.canvas_content && typeof data.canvas_content === 'object') {
      return 'TPL_INSTRUCTIONAL_SCENE';
    }
    // (participants + messages) → CONVERSATIONAL_FLOW (문서보다 먼저)
    if (Array.isArray(data.participants) && Array.isArray(data.messages) && data.messages.length >= 2) {
      return 'TPL_CONVERSATIONAL_FLOW';
    }
    // (case_profile + narrative) → CASE_DIAGNOSTIC_FRAME
    if (data.case_profile && typeof data.case_profile === 'object' && typeof data.narrative === 'string') {
      return 'TPL_CASE_DIAGNOSTIC_FRAME';
    }
    // (steps + orientation) → SEQUENTIAL_WORKFLOW
    if (Array.isArray(data.steps) && data.steps.length >= 2 && data.orientation) {
      return 'TPL_SEQUENTIAL_WORKFLOW';
    }
    // (forum_name + main_post) → DIGITAL_FORUM_INTERFACE
    if (typeof data.forum_name === 'string' && data.main_post && typeof data.main_post === 'object') {
      return 'TPL_DIGITAL_FORUM_INTERFACE';
    }
    // (chart_type + axes + datasets) → QUANTITATIVE_CHART
    if (typeof data.chart_type === 'string' && Array.isArray(data.axes) && Array.isArray(data.datasets)) {
      return 'TPL_QUANTITATIVE_CHART';
    }
    // (slogan + bullets) → PROMOTIONAL_CANVAS
    if (typeof data.slogan === 'string' && Array.isArray(data.bullets)) {
      return 'TPL_PROMOTIONAL_CANVAS';
    }
    // (doc_type + paragraphs) → FORMAL_DOCUMENT (최후: 다른 모든 TPL보다 늦게 체크)
    // paragraphs 내용이 표/순서도/수업장면 패턴이면 FORMAL_DOCUMENT 스킵
    if (typeof data.doc_type === 'string' && Array.isArray(data.paragraphs) && data.paragraphs.length > 0) {
      const paraText = data.paragraphs.map((p: any) => (p.content ?? '') + '\n').join('');
      const hasTable = paraText.includes('|') && /---/.test(paraText);
      const hasDateSequence = /^\d{1,2}월\s*\d{1,2}일/.test(paraText.trim());
      const hasTeacherLine = /^(교사|선생님|강사)\s*[:]/.test(paraText);
      if (!hasTable && !hasDateSequence && !hasTeacherLine) {
        return 'TPL_FORMAL_DOCUMENT';
      }
    }

    // === 내용 기반 TPL 추론 (data / content / body / text 필드의 문자열 분석) ===
    const rawText: string =
      (typeof data.data === 'string' ? data.data
      : typeof data.content === 'string' ? data.content
      : typeof data.body === 'string' ? data.body
      : typeof data.text === 'string' ? data.text
      : typeof data.narrative === 'string' ? data.narrative
      : typeof data.description === 'string' ? data.description
      : typeof data.stimulus === 'string' ? data.stimulus
      : Array.isArray(data.paragraphs) ? data.paragraphs.map((p: any) => p.content ?? '').join('\n')
      : Array.isArray(data.messages) ? data.messages.map((m: any) => `${m.p_id}: ${m.text}`).join('\n')
      : '') || '';

    if (rawText.length >= 30) {
      // 표 마크다운 (|---| 패턴)
      if (/\|.+\|.+\|/.test(rawText) && /---/.test(rawText)) return 'TPL_COMPARATIVE_MATRIX';
      // 수업 장면 — 선생님/교사/강사가 시간/교육/배움/법 관련 내용을 말함 (대화문보다 먼저 체크)
      if (/^(교사|선생님|강사)\s*[:]/.test(rawText) && /시간|수업|학습|교육|배우|법/.test(rawText)) return 'TPL_INSTRUCTIONAL_SCENE';
      // 대화문 (교사/선생님/강사 제외 — 위에서 수업장면으로 이미 처리)
      if (/^(상담사|학생|환자|내담자|직원|고객|A|B)\s*[:]/.test(rawText)) return 'TPL_CONVERSATIONAL_FLOW';
      // Q&A 포럼
      if (/^(질문|문의|Q\s*[:.]|민원|상담)/.test(rawText) && /^(답변|A\s*[:.]|회신)/.test(rawText)) return 'TPL_DIGITAL_FORUM_INTERFACE';
      // 타임라인/일정
      if (/^\d{1,2}월\s*\d{1,2}일/.test(rawText) || /^\d{1,2}단계\s*[:.]/.test(rawText)) return 'TPL_SEQUENTIAL_WORKFLOW';
      // 인물 사례
      if (/[A-Za-z가-힣]씨/.test(rawText) && /사례|계약|근로|임금|계약서/.test(rawText)) return 'TPL_CASE_DIAGNOSTIC_FRAME';
      // 문서/보고서
      if (/보고서|계약서|동의서|규정|공고문/.test(rawText)) return 'TPL_FORMAL_DOCUMENT';
    }

    // events → SEQUENTIAL_WORKFLOW (자동 변환 후)
    if (Array.isArray(data.events) && data.events.length > 0) {
      return 'TPL_SEQUENTIAL_WORKFLOW';
    }

    // === PLAIN_TEXT 직전: 가장 근접한 TPL로 강제 매핑 (내용 분석) ===
    if (rawText.length >= 10) {
      if (rawText.includes('|') && rawText.includes('---')) return 'TPL_COMPARATIVE_MATRIX';
      if (/[:]/.test(rawText) && /^(교사|학생|A|B|상담사|고객)/m.test(rawText)) return 'TPL_CONVERSATIONAL_FLOW';
      if (/[A-Za-z가-힣]씨/.test(rawText)) return 'TPL_CASE_DIAGNOSTIC_FRAME';
      if (/\d{1,2}[월단계]/.test(rawText) && /[:]/.test(rawText)) return 'TPL_SEQUENTIAL_WORKFLOW';
      if (/보고서|계약서|동의서|규정|공고|법령/.test(rawText)) return 'TPL_FORMAL_DOCUMENT';
      if (/질문|문의|Q\.|민원/.test(rawText)) return 'TPL_DIGITAL_FORUM_INTERFACE';
      if (/수업|학습|교육/.test(rawText)) return 'TPL_INSTRUCTIONAL_SCENE';
      if (/차트|그래프|수치|데이터|점수/.test(rawText)) return 'TPL_QUANTITATIVE_CHART';
      if (/광고|홍보|이벤트|할인/.test(rawText)) return 'TPL_PROMOTIONAL_CANVAS';
      // 수업장면 — 시간/교육/배움 키워드 포함 (FORMAL_DOCUMENT보다 먼저 체크)
      if (/^(교사|선생님|강사).*[:]/.test(rawText) && /시간|수업|학습|교육|배우|법/.test(rawText)) return 'TPL_INSTRUCTIONAL_SCENE';
      // 최후의 보루: 아무 패턴도 없으면 FORMAL_DOCUMENT (문서 형태로 fallback)
      if (rawText.length >= 20) return 'TPL_FORMAL_DOCUMENT';
    }

    // 구조는 있지만 내용이 없거나 너무 짧음
    if (typeof data === 'object' && data !== null && Object.keys(data).length > 0) {
      return 'TPL_FORMAL_DOCUMENT';  // 최후의 수단: FORMAL_DOCUMENT
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

  private readonly VALID_CANVAS_TYPES = ['text', 'table', 'image', 'mind_map', 'key_map'] as const;

  private normalizeCanvasType(type: unknown, data: unknown): string {
    if (typeof type === 'string' && (this.VALID_CANVAS_TYPES as readonly string[]).includes(type)) {
      if (type === 'table' && !Array.isArray(data)) return 'text';
      if (type === 'image' && (typeof data !== 'object' || !data || !('src' in (data as any)))) return 'text';
      return type;
    }
    if (Array.isArray(data)) return 'table';
    if (data && typeof data === 'object' && 'src' in (data as any)) return 'image';
    return 'text';
  }

  private normalizeCanvasData(type: string, data: unknown): any {
    if (data === undefined || data === null) return '';
    if (type === 'text') return typeof data === 'string' ? data : JSON.stringify(data);
    if (type === 'table') return Array.isArray(data) ? data : [[String(data)]];
    if (type === 'image') return (data && typeof data === 'object' && 'src' in (data as any)) ? data : { src: String(data) };
    return data;
  }

  // TPL별 최소 내용량 임계치 — 미달 시 PLAIN_TEXT로 downgrade
  private meetsMinThreshold(result: any, tpl: TplName): boolean {
    switch (tpl) {
      case 'TPL_COMPARATIVE_MATRIX':
        return result.headers?.length >= 2 && result.rows?.length >= 2;
      case 'TPL_FORMAL_DOCUMENT':
        return result.paragraphs?.length >= 1 && result.paragraphs.some((p: any) => (p.content?.length ?? 0) > 15);
      case 'TPL_CONVERSATIONAL_FLOW':
        return result.messages?.length >= 2 && result.messages.every((m: any) => m.text?.length > 0);
      case 'TPL_CASE_DIAGNOSTIC_FRAME':
        return (result.narrative?.length ?? 0) >= 30 || (result.case_profile?.name?.length ?? 0) > 0;
      case 'TPL_SEQUENTIAL_WORKFLOW':
        return result.steps?.length >= 2;
      case 'TPL_INSTRUCTIONAL_SCENE':
        return (result.instructor?.text?.length ?? 0) >= 10;
      case 'TPL_DIGITAL_FORUM_INTERFACE':
        return (result.main_post?.content?.length ?? 0) >= 20 || (result.main_post?.title?.length ?? 0) > 0;
      case 'TPL_QUANTITATIVE_CHART':
        return result.datasets?.length >= 1 && result.datasets.some((ds: any) => (ds.values?.length ?? 0) > 0);
      case 'TPL_PROMOTIONAL_CANVAS':
        return (result.slogan?.length ?? 0) > 0 || (result.bullets?.length ?? 0) > 0;
      case 'TPL_PLAIN_TEXT':
        return (result.data?.length ?? 0) > 0;
      default:
        return true;
    }
  }

  // 객체에서 읽을 수 있는 텍스트를 추출 (PLAIN_TEXT downgrade fallback용)
  private extractReadableText(data: any): string {
    if (!data) return '';
    if (typeof data === 'string') return data;
    if (typeof data.data === 'string' && data.data.length > 10) return data.data;
    if (typeof data.content === 'string' && data.content.length > 10) return data.content;
    if (typeof data.body === 'string' && data.body.length > 10) return data.body;
    if (typeof data.narrative === 'string' && data.narrative.length > 10) return data.narrative;
    if (typeof data.description === 'string' && data.description.length > 10) return data.description;
    if (typeof data.text === 'string' && data.text.length > 10) return data.text;
    // 배열에서 연결
    if (Array.isArray(data.paragraphs)) {
      return data.paragraphs.map((p: any) => p.content ?? '').filter(Boolean).join('\n');
    }
    if (Array.isArray(data.messages)) {
      return data.messages.map((m: any) => `${m.p_id}: ${m.text}`).join('\n');
    }
    if (Array.isArray(data.steps)) {
      return data.steps.map((s: any) => `${s.label}: ${s.desc}`).join('\n');
    }
    if (Array.isArray(data.rows)) {
      return data.rows.map((r: any) => (Array.isArray(r.cells) ? r.cells.join(' | ') : '')).join('\n');
    }
    return '';
  }

  public fillDefaults(data: any, tpl: TplName): any {
    let result: any;

    switch (tpl) {
      case 'TPL_COMPARATIVE_MATRIX':
        result = {
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
        break;

      case 'TPL_FORMAL_DOCUMENT':
        result = {
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
            ? data.paragraphs
                .map((p: any) => ({
                  sub_title: p.sub_title ?? '',
                  content: (p.content ?? '').replace(/^viewItems:\s*/i, ''),
                }))
                .filter((p: any) => {
                  // viewItems/combo_block 내용이 paragraphs로 잘못 들어간 경우 제거
                  const c = p.content.trim();
                  if (!c) return false;
                  // "ㄱ. " 또는 "ㄱ," 로 시작하는 combo block pattern
                  if (/^[ㄱ-ㅎ][,.\s]/.test(c) && c.length < 40) return false;
                  // "viewItems:" prefix (위에서 제거했으나 남은 경우)
                  if (/^viewItems/i.test(c)) return false;
                  // pipe로 구분된 viewItems (예: "ㄱ. 내용 | ㄴ. 내용")
                  if (/^[ㄱ-ㅎ]\.\s/.test(c) && c.includes('|')) return false;
                  return true;
                })
            : [],
          footnotes: Array.isArray(data?.footnotes) ? data.footnotes : [],
        };
        break;

      case 'TPL_CONVERSATIONAL_FLOW':
        result = {
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
        break;

      case 'TPL_CASE_DIAGNOSTIC_FRAME':
        result = (() => {
          // profile → case_profile auto-fix (string 또는 object 모두 허용)
          const rawCp = data?.case_profile || data?.profile;
          const caseProfile = rawCp
            ? (typeof rawCp === 'object' ? rawCp : { name: String(rawCp), context: '' })
            : null;
          return {
            case_profile: caseProfile
              ? { name: caseProfile.name ?? '', context: caseProfile.context ?? '' }
              : { name: '', context: '' },
            // narrative가 없으면 profile 텍스트를 fallback
            narrative: typeof data?.narrative === 'string' ? data.narrative
              : (typeof data?.profile === 'string' ? data.profile : ''),
            // string[] check_items → {id, label, is_checked}[] 변환
            check_items: Array.isArray(data?.check_items)
              ? data.check_items.map((ci: any, i: number) => {
                  if (typeof ci === 'string') return { id: String(i + 1), label: ci, is_checked: false };
                  return { id: ci.id ?? String(i + 1), label: ci.label ?? '', is_checked: false };
                })
              : [],
          };
        })();
        break;

      case 'TPL_SEQUENTIAL_WORKFLOW':
        result = {
          orientation:
            typeof data?.orientation === 'string' && ['horizontal', 'vertical'].includes(data.orientation)
              ? data.orientation
              : 'horizontal',
          steps: (() => {
            if (Array.isArray(data?.steps)) {
              return data.steps.map((s: any, si: number) => ({
                idx: typeof s.idx === 'number' ? s.idx : si + 1,
                label: s.label ?? s.date ?? s.title ?? `Step ${si + 1}`,
                desc: s.desc ?? s.description ?? s.activity ?? s.content ?? '',
                is_missing: s.is_missing === true,
              }));
            }
            if (Array.isArray(data?.events)) {
              return data.events.map((e: any, ei: number) => ({
                idx: ei + 1,
                label: e.date ?? '',
                desc: e.description ?? '',
                is_missing: false,
              }));
            }
            return [];
          })(),
        };
        break;

      case 'TPL_INSTRUCTIONAL_SCENE':
        result = {
          instructor: (() => {
            const raw = data?.instructor && typeof data.instructor === 'object'
              ? { id: String(data.instructor.id ?? ''), text: String(data.instructor.text ?? '') }
              : { id: '', text: '' };
            // instructor.text가 너무 짧으면 canvas_content.data에서 첫 발화 추출
            if (raw.text.length < 5) {
              const ccData = data?.canvas_content?.data;
              if (typeof ccData === 'string') {
                const match = ccData.match(/^(?:교사|선생님|강사)\s*[:]\s*(.+?)(?:\s*\[|\s*$)/);
                if (match) raw.text = match[1].trim();
              }
            }
            return raw;
          })(),
          canvas_content: (() => {
            if (data?.canvas_content && typeof data.canvas_content === 'object') {
              const rawType = data.canvas_content.type;
              let rawData = data.canvas_content.data;
              const type = this.normalizeCanvasType(rawType, rawData);
              // instructor 말풍선과 중복 방지: canvas_data에서 teacher prefix 제거
              if (type === 'text' && typeof rawData === 'string') {
                rawData = rawData.replace(/^(교사|선생님|강사)\s*[:]\s*/, '').trim();
              }
              return { type, data: this.normalizeCanvasData(type, rawData) };
            }
            return { type: 'text' as const, data: '' };
          })(),
          students: Array.isArray(data?.students)
            ? data.students.map((s: any) => ({
                id: String(s.id ?? ''),
                text: String(s.text ?? ''),
              }))
            : [],
        };
        break;

      case 'TPL_DIGITAL_FORUM_INTERFACE':
        result = {
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
        break;

      case 'TPL_QUANTITATIVE_CHART':
        result = {
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
        break;

      case 'TPL_PROMOTIONAL_CANVAS':
        result = {
          slogan:
            typeof data?.slogan === 'string' ? data.slogan : '',
          bullets: Array.isArray(data?.bullets) ? data.bullets : [],
          visual_elements: Array.isArray(data?.visual_elements)
            ? data.visual_elements
            : [],
          missing_part:
            typeof data?.missing_part === 'string' ? data.missing_part : '',
        };
        break;

      case 'TPL_PLAIN_TEXT':
      default: {
        if (Array.isArray(data?.events) && data.events.length > 0) {
          return {
            data: data.events
              .map((e: any) => `${e.date ?? ''}: ${e.description ?? ''}`)
              .join('\n'),
          };
        }
        if (!data || typeof data !== 'object') {
          return { data: String(data ?? '') };
        }
        const text =
          typeof data.data === 'string' ? data.data
          : typeof data.content === 'string' ? data.content
          : typeof data.body === 'string' ? data.body
          : typeof data.narrative === 'string' ? data.narrative
          : typeof data.description === 'string' ? data.description
          : typeof data.headline === 'string' ? data.headline
          : typeof data.text === 'string' ? data.text
          : typeof data.stimulus === 'string' ? data.stimulus
          : '';
        if (text) return { data: text };
        const jsonStr = JSON.stringify(data, null, 2);
        if (jsonStr === '{}' || jsonStr === '[]' || jsonStr.length <= 4) {
          return { data: '' };
        }
        if (jsonStr.includes('|') && jsonStr.includes('\n')) {
          return { data: jsonStr };
        }
        return { data: jsonStr };
      }
    }

    // ≫ 최소 내용량 로그만 남기고 TPL 유지 (PLAIN_TEXT 강제 변환 제거)
    if (!this.meetsMinThreshold(result, tpl)) {
      this.logger.warn(`fillDefaults: ${tpl} 최소 내용량 미달 — 구조 유지`);
    }

    return result;
  }
}

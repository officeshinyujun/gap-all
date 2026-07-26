import { Logger } from '@nestjs/common';
import { normalizeConversationVisualMetadata } from './conversation-visual-aid-validator';
import { STRUCTURED_TPL_NAMES } from './tpl-schemas';

type TplName = (typeof STRUCTURED_TPL_NAMES)[number] | 'TPL_PLAIN_TEXT';

const ALL_TPLS: TplName[] = [...STRUCTURED_TPL_NAMES, 'TPL_PLAIN_TEXT'];

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
    const finalTpl = !ALL_TPLS.includes(resolved as TplName)
      ? 'TPL_PLAIN_TEXT'
      : resolved;
    if (finalTpl !== declared) {
      meta.recommended_template = finalTpl;
    }

    // 구조화 TPL은 렌더 가능한 원본 콘텐츠가 있을 때만 유지한다.
    const effectiveTpl =
      finalTpl !== 'TPL_PLAIN_TEXT' && !this.isRenderableTplData(data, finalTpl)
        ? 'TPL_PLAIN_TEXT'
        : finalTpl;
    if (effectiveTpl !== finalTpl) {
      this.logger.warn(
        `TPL 구조 불완전: ${finalTpl} → TPL_PLAIN_TEXT로 원문 보존`,
      );
      meta.recommended_template = effectiveTpl;
    }

    // 항상 fillDefaults 실행 (pass-through 제거, AI 데이터 신뢰 불가)
    const normalized = this.fillDefaults(data, effectiveTpl);

    // TPL 스키마 검증 — 오류 수집 (fixable 에러만 자동 수정)
    const schemaErrors = this.validateTplSchema(normalized, effectiveTpl, item);
    if (schemaErrors.length > 0) {
      this.logger.warn(
        `TPL 스키마 오류 (${effectiveTpl}): ${schemaErrors.slice(0, 3).join('; ')}`,
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
    const tpl = ALL_TPLS.includes(template as TplName)
      ? template
      : 'TPL_PLAIN_TEXT';
    const result = this.fillDefaults(data ?? {}, tpl as TplName);
    return result;
  }

  /** stimulus_data와 combo_block 간 이름 불일치 해소 (E씨 vs A씨) */
  public syncNames(stimulusData: any, comboBlock?: any): any {
    if (!comboBlock?.items?.length) return stimulusData;
    const stimText =
      typeof stimulusData === 'string'
        ? stimulusData
        : stimulusData?.narrative ||
          stimulusData?.data ||
          stimulusData?.content ||
          stimulusData?.description ||
          stimulusData?.body ||
          stimulusData?.text ||
          '';
    if (!stimText) return stimulusData;
    const stimNames = [...stimText.matchAll(/([A-Z])씨/g)].map((m) => m[1]);
    if (stimNames.length === 0) return stimulusData;
    // combo_block.items에서 이름 추출 및 치환
    const viewText = comboBlock.items.map((i: any) => i.text).join(' ');
    const viewNames = [...viewText.matchAll(/([A-Z])씨/g)].map((m) => m[1]);
    if (viewNames.length === 0 || viewNames[0] === stimNames[0])
      return stimulusData;
    const nameMap = new Map<string, string>();
    viewNames.forEach((vn, i) => {
      if (stimNames[i]) nameMap.set(vn, stimNames[i]);
    });
    if (nameMap.size === 0) return stimulusData;
    const replaceName = (s: string) =>
      s.replace(/([A-Z])\s*씨/g, (_, letter) =>
        nameMap.get(letter) ? nameMap.get(letter) + '씨' : letter + '씨',
      );
    comboBlock.items = comboBlock.items.map((item: any) => ({
      ...item,
      text: replaceName(item.text),
    }));
    this.logger.log(
      `syncNames: ${[...nameMap.entries()].map(([k, v]) => `${k}씨→${v}씨`).join(', ')}`,
    );
    return stimulusData;
  }

  /**
   * stimulusData 정규화
   * 저장된 template을 신뢰하고 fillDefaults만 실행 (재탐지/TPL 전환 없음)
   */
  public normalizeStimulusWithTemplate(
    data: any,
    template: string,
    comboBlock?: any,
  ): { stimulusData: any; effectiveTemplate: string } {
    const declaredTpl = ALL_TPLS.includes(template as TplName)
      ? (template as TplName)
      : 'TPL_PLAIN_TEXT';
    const effectiveTpl =
      declaredTpl !== 'TPL_PLAIN_TEXT' &&
      !this.isRenderableTplData(data, declaredTpl)
        ? 'TPL_PLAIN_TEXT'
        : declaredTpl;
    const normalized = this.fillDefaults(data ?? {}, effectiveTpl);
    if (comboBlock) {
      this.syncNames(normalized, comboBlock);
    }
    return { stimulusData: normalized, effectiveTemplate: effectiveTpl };
  }

  public resolveTemplate(template: string): string {
    return ALL_TPLS.includes(template as TplName) ? template : 'TPL_PLAIN_TEXT';
  }

  private readonly TPL_SCHEMAS: Record<
    string,
    {
      requiredFields: string[];
      typeChecks: Record<string, (v: any) => boolean>;
    }
  > = {
    TPL_COMPARATIVE_MATRIX: {
      requiredFields: ['headers', 'rows'],
      typeChecks: {
        headers: (v) => Array.isArray(v),
        rows: (v) => Array.isArray(v),
        rows_id: (v) =>
          (v && typeof v.id === 'string') || typeof v.id === 'number',
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
        'canvas_content.type': (v) =>
          typeof v === 'string' &&
          ['text', 'table', 'image', 'mind_map', 'key_map'].includes(v),
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
        chart_type: (v) => ['radar', 'bar', 'line'].includes(v),
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
    TPL_ARTICLE: {
      requiredFields: ['title', 'body_paragraphs'],
      typeChecks: {
        title: (v) => typeof v === 'string',
        body_paragraphs: (v) => Array.isArray(v),
        byline: (v) => typeof v === 'string',
        published_date: (v) => typeof v === 'string',
        source: (v) => typeof v === 'string',
      },
    },
    TPL_STATISTICS: {
      requiredFields: ['title', 'data_entries'],
      typeChecks: {
        title: (v) => typeof v === 'string',
        data_entries: (v) => Array.isArray(v),
        category_label: (v) => typeof v === 'string',
        unit: (v) => typeof v === 'string',
        source: (v) => typeof v === 'string',
      },
    },
    TPL_INCIDENT_REPORT: {
      requiredFields: ['title', 'incident_type', 'overview', 'cause'],
      typeChecks: {
        title: (v) => typeof v === 'string',
        incident_type: (v) => typeof v === 'string',
        date: (v) => typeof v === 'string',
        location: (v) => typeof v === 'string',
        overview: (v) => typeof v === 'string',
        cause: (v) => typeof v === 'string',
        damage: (v) => typeof v === 'string',
        response: (v) => typeof v === 'string',
        prevention: (v) => typeof v === 'string',
        timeline: (v) => Array.isArray(v),
      },
    },
    TPL_ANNOUNCEMENT: {
      requiredFields: ['title', 'organizer', 'details'],
      typeChecks: {
        title: (v) => typeof v === 'string',
        organizer: (v) => typeof v === 'string',
        schedule: (v) => v && typeof v === 'object',
        location: (v) => typeof v === 'string',
        target: (v) => typeof v === 'string',
        details: (v) => Array.isArray(v),
        contact: (v) => typeof v === 'string',
      },
    },
    TPL_REPORT: {
      requiredFields: ['title', 'sections'],
      typeChecks: {
        title: (v) => typeof v === 'string',
        author: (v) => typeof v === 'string',
        date: (v) => typeof v === 'string',
        metadata: (v) => Array.isArray(v),
        sections: (v) => Array.isArray(v),
        conclusion: (v) => typeof v === 'string',
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
      if (
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      ) {
        errors.push(`${field}: 필수 필드 누락 또는 빈 값`);
      }
    }

    for (const [field, check] of Object.entries(schema.typeChecks)) {
      const value = this.getNestedField(data, field);
      if (value === undefined || value === null) continue;
      if (!check(value)) {
        errors.push(
          `${field}: 타입 불일치 (예상: ${check.toString().slice(0, 30)}...)`,
        );
      }
    }

    // (가) 참조 시 comments[0] 검증
    if (
      tpl === 'TPL_DIGITAL_FORUM_INTERFACE' &&
      item?.render_ready?.question_stem?.includes('(가)')
    ) {
      const comments = data.comments ?? [];
      if (comments.length === 0 || !comments[0]?.text?.includes('(가)')) {
        errors.push(
          'comments[0].text: (가) 참조 발문이지만 comments에 (가)가 없음',
        );
      }
    }

    // 라벨 일치 검증 (Conversational Flow)
    if (tpl === 'TPL_CONVERSATIONAL_FLOW') {
      const validLabels = new Set(
        (data.participants ?? []).map((p: any) => p.id),
      );
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

    const hasText = (value: unknown) =>
      typeof value === 'string' && value.trim().length > 0;
    switch (tpl) {
      case 'TPL_COMPARATIVE_MATRIX':
        if (
          !(data.headers ?? []).some((header: any) => hasText(header?.label))
        ) {
          errors.push('headers: 표시할 헤더 텍스트가 없음');
        }
        if (
          !(data.rows ?? []).some((row: any) =>
            (row?.cells ?? []).some((cell: unknown) => hasText(cell)),
          )
        ) {
          errors.push('rows: 표시할 셀 텍스트가 없음');
        }
        break;
      case 'TPL_FORMAL_DOCUMENT':
        if (
          !(data.paragraphs ?? []).some((paragraph: any) =>
            hasText(paragraph?.content),
          )
        ) {
          errors.push('paragraphs: 표시할 본문이 없음');
        }
        break;
      case 'TPL_CONVERSATIONAL_FLOW': {
        const participantIds = new Set(
          (data.participants ?? []).map((participant: any) => participant?.id),
        );
        if (
          !(data.messages ?? []).some((message: any) => hasText(message?.text))
        ) {
          errors.push('messages: 표시할 발화가 없음');
        }
        if (
          (data.messages ?? []).some(
            (message: any) => !participantIds.has(message?.p_id),
          )
        ) {
          errors.push('messages: p_id가 participants와 연결되지 않음');
        }
        const hasVisualFields =
          data.scene_kind !== undefined ||
          data.visual_aid !== undefined ||
          (data.participants ?? []).some(
            (participant: any) => participant?.icon_key !== undefined,
          );
        if (hasVisualFields) {
          const normalized = normalizeConversationVisualMetadata(
            data,
            (data.participants ?? []).map((participant: any) => ({
              id: participant?.id ?? '',
              role: participant?.role ?? '',
              icon_key: participant?.icon_key,
            })),
          );
          const visualMatches =
            normalized.scene_kind === data.scene_kind &&
            JSON.stringify(normalized.visual_aid) ===
              JSON.stringify(data.visual_aid) &&
            (data.participants ?? []).every(
              (participant: any, index: number) =>
                participant?.icon_key ===
                normalized.participant_icon_keys[index],
            );
          if (!visualMatches) {
            errors.push(
              'conversation visual aid: 유효하지 않은 아이콘 또는 관계 데이터',
            );
          }
        }
        break;
      }
      case 'TPL_CASE_DIAGNOSTIC_FRAME':
        if (!hasText(data.narrative))
          errors.push('narrative: 표시할 사례 서술이 없음');
        break;
      case 'TPL_SEQUENTIAL_WORKFLOW':
        if (
          !(data.steps ?? []).some(
            (step: any) => hasText(step?.label) || hasText(step?.desc),
          )
        ) {
          errors.push('steps: 표시할 단계가 없음');
        }
        break;
      case 'TPL_INSTRUCTIONAL_SCENE':
        if (
          !hasText(data.instructor?.text) &&
          !hasText(data.canvas_content?.data)
        ) {
          errors.push(
            'instructional scene: 표시할 강사 또는 캔버스 내용이 없음',
          );
        }
        break;
      case 'TPL_DIGITAL_FORUM_INTERFACE':
        if (!hasText(data.main_post?.content)) {
          errors.push('main_post.content: 표시할 게시글 본문이 없음');
        }
        break;
      case 'TPL_QUANTITATIVE_CHART':
        if (!(data.axes ?? []).every((axis: any) => hasText(axis?.label))) {
          errors.push('axes: 표시할 축 레이블이 없음');
        }
        if (
          !(data.datasets ?? []).every(
            (dataset: any) =>
              hasText(dataset?.label) &&
              Array.isArray(dataset?.values) &&
              dataset.values.length === (data.axes ?? []).length &&
              dataset.values.every(
                (value: unknown) => typeof value === 'number',
              ),
          )
        ) {
          errors.push('datasets: 축과 일치하는 숫자 데이터가 없음');
        }
        break;
      case 'TPL_PROMOTIONAL_CANVAS':
        if (
          !hasText(data.slogan) &&
          !(data.bullets ?? []).some((bullet: unknown) => hasText(bullet))
        ) {
          errors.push('promotional canvas: 표시할 슬로건 또는 항목이 없음');
        }
        break;
      case 'TPL_ARTICLE':
        if (!(data.body_paragraphs ?? []).some((p: unknown) => hasText(p))) {
          errors.push('body_paragraphs: 표시할 본문이 없음');
        }
        break;
      case 'TPL_STATISTICS':
        if (
          !(data.data_entries ?? []).some(
            (e: any) =>
              e &&
              typeof e === 'object' &&
              (hasText(e?.label) || hasText(e?.value)),
          )
        ) {
          errors.push('data_entries: 표시할 통계 항목이 없음');
        }
        break;
      case 'TPL_INCIDENT_REPORT':
        if (!hasText(data.overview)) {
          errors.push('overview: 표시할 사고 개요가 없음');
        }
        break;
      case 'TPL_ANNOUNCEMENT':
        if (!hasText(data.title)) {
          errors.push('title: 표시할 공고 제목이 없음');
        }
        break;
      case 'TPL_REPORT':
        if (
          !(data.sections ?? []).some(
            (s: any) => hasText(s?.heading) || hasText(s?.content),
          )
        ) {
          errors.push('sections: 표시할 섹션이 없음');
        }
        break;
    }

    return errors;
  }

  public isRenderableTplData(data: any, template: string): boolean {
    const tpl = ALL_TPLS.includes(template as TplName)
      ? (template as TplName)
      : 'TPL_PLAIN_TEXT';
    if (tpl === 'TPL_PLAIN_TEXT') {
      return typeof data === 'string'
        ? data.trim().length > 0
        : typeof data?.data === 'string' && data.data.trim().length > 0;
    }
    return this.validateTplSchema(data, tpl).length === 0;
  }

  private getNestedField(obj: any, path: string): any {
    return path
      .split('.')
      .reduce((acc, key) => (acc ? acc[key] : undefined), obj);
  }

  public detectTpl(data: any): TplName | null {
    if (!data || typeof data !== 'object') return null;

    // === FIELD NAME AUTO-FIX: 유지 (저장 시 AI 데이터 정규화) ===
    if (data.profile && !data.case_profile) {
      data.case_profile =
        typeof data.profile === 'object'
          ? data.profile
          : { name: data.profile, context: '' };
      delete data.profile;
    }
    if (
      Array.isArray(data.participants) &&
      !Array.isArray(data.messages) &&
      data.participants.length > 0
    ) {
      const hasMsg = data.participants.some(
        (p: any) => typeof p.message === 'string' || typeof p.text === 'string',
      );
      if (hasMsg) {
        data.messages = data.participants.map((p: any, i: number) => ({
          p_id: p.id ?? p.role ?? `p${i}`,
          text: p.message ?? p.text ?? '',
        }));
      }
    }
    if (
      Array.isArray(data.events) &&
      !Array.isArray(data.steps) &&
      data.events.length > 0
    ) {
      data.steps = data.events.map((e: any, i: number) => ({
        idx: i + 1,
        label: e.date ?? e.label ?? `Step ${i + 1}`,
        desc: e.description ?? e.activity ?? e.content ?? '',
        is_missing: e.is_missing === true,
      }));
      if (!data.orientation) data.orientation = 'vertical';
    }
    if (data.post && !data.main_post) {
      data.main_post =
        typeof data.post === 'object'
          ? data.post
          : { author: '', title: '', content: String(data.post) };
      delete data.post;
    }

    // === 구조 기반 탐지 ===
    if (
      typeof data.title === 'string' &&
      Array.isArray(data.sections) &&
      data.sections.length > 0 &&
      typeof data.sections[0]?.heading === 'string'
    )
      return 'TPL_REPORT';
    if (
      typeof data.title === 'string' &&
      Array.isArray(data.body_paragraphs) &&
      data.body_paragraphs.length > 0
    )
      return 'TPL_ARTICLE';
    if (
      typeof data.incident_type === 'string' &&
      typeof data.overview === 'string' &&
      typeof data.cause === 'string'
    )
      return 'TPL_INCIDENT_REPORT';
    if (
      typeof data.title === 'string' &&
      typeof data.organizer === 'string' &&
      Array.isArray(data.details)
    )
      return 'TPL_ANNOUNCEMENT';
    if (
      typeof data.category_label === 'string' &&
      Array.isArray(data.data_entries) &&
      data.data_entries.length > 0
    )
      return 'TPL_STATISTICS';
    if (
      Array.isArray(data.rows) &&
      Array.isArray(data.headers) &&
      data.rows.length > 0
    )
      return 'TPL_COMPARATIVE_MATRIX';
    if (
      data.instructor &&
      typeof data.instructor === 'object' &&
      data.canvas_content &&
      typeof data.canvas_content === 'object'
    )
      return 'TPL_INSTRUCTIONAL_SCENE';
    if (Array.isArray(data.participants) && Array.isArray(data.messages))
      return 'TPL_CONVERSATIONAL_FLOW';
    if (
      data.case_profile &&
      typeof data.case_profile === 'object' &&
      typeof data.narrative === 'string'
    )
      return 'TPL_CASE_DIAGNOSTIC_FRAME';
    if (Array.isArray(data.steps) && data.orientation)
      return 'TPL_SEQUENTIAL_WORKFLOW';
    if (
      typeof data.forum_name === 'string' &&
      data.main_post &&
      typeof data.main_post === 'object'
    )
      return 'TPL_DIGITAL_FORUM_INTERFACE';
    if (
      typeof data.chart_type === 'string' &&
      Array.isArray(data.axes) &&
      Array.isArray(data.datasets)
    )
      return 'TPL_QUANTITATIVE_CHART';
    if (typeof data.slogan === 'string' && Array.isArray(data.bullets))
      return 'TPL_PROMOTIONAL_CANVAS';
    if (
      typeof data.doc_type === 'string' &&
      Array.isArray(data.paragraphs) &&
      data.paragraphs.length > 0
    )
      return 'TPL_FORMAL_DOCUMENT';

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
          (typeof data.case_profile.name === 'string' ||
            (Array.isArray(data.case_profile) &&
              data.case_profile.length > 0 &&
              data.case_profile.every(
                (c: any) =>
                  c && typeof c === 'object' && typeof c.name === 'string',
              ))) &&
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
        return typeof data.slogan === 'string' && Array.isArray(data.bullets);
      case 'TPL_ARTICLE':
        return (
          typeof data.title === 'string' &&
          Array.isArray(data.body_paragraphs) &&
          data.body_paragraphs.length > 0
        );
      case 'TPL_STATISTICS':
        return (
          typeof data.title === 'string' &&
          Array.isArray(data.data_entries) &&
          data.data_entries.length > 0
        );
      case 'TPL_INCIDENT_REPORT':
        return (
          typeof data.incident_type === 'string' &&
          typeof data.overview === 'string' &&
          typeof data.cause === 'string'
        );
      case 'TPL_ANNOUNCEMENT':
        return (
          typeof data.title === 'string' &&
          typeof data.organizer === 'string' &&
          Array.isArray(data.details)
        );
      case 'TPL_REPORT':
        return (
          typeof data.title === 'string' &&
          Array.isArray(data.sections) &&
          data.sections.length > 0
        );
      case 'TPL_PLAIN_TEXT':
        return typeof data.data === 'string' && data.data.length > 0;
      default:
        return false;
    }
  }

  private readonly VALID_CANVAS_TYPES = [
    'text',
    'table',
    'image',
    'mind_map',
    'key_map',
  ] as const;

  private normalizeCanvasType(type: unknown, data: unknown): string {
    if (
      typeof type === 'string' &&
      (this.VALID_CANVAS_TYPES as readonly string[]).includes(type)
    ) {
      if (type === 'table' && !Array.isArray(data)) return 'text';
      if (
        type === 'image' &&
        (typeof data !== 'object' || !data || !('src' in (data as any)))
      )
        return 'text';
      return type;
    }
    if (Array.isArray(data)) return 'table';
    if (data && typeof data === 'object' && 'src' in (data as any))
      return 'image';
    return 'text';
  }

  private normalizeCanvasData(type: string, data: unknown): any {
    if (data === undefined || data === null) return '';
    if (type === 'text')
      return typeof data === 'string' ? data : JSON.stringify(data);
    if (type === 'table')
      return Array.isArray(data) ? data : [[JSON.stringify(data) ?? '']];
    if (type === 'image')
      return data && typeof data === 'object' && 'src' in (data as any)
        ? data
        : { src: JSON.stringify(data) ?? '' };
    return data;
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
        if (result.headers.length === 0) {
          result.headers = [{ id: '_h1', label: '' }];
        }
        if (result.rows.length === 0) {
          result.rows = [{ id: '_r1', cells: [''] }];
        }
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
        if (result.paragraphs.length === 0) {
          result.paragraphs = [];
        }
        break;

      case 'TPL_CONVERSATIONAL_FLOW': {
        const rawParticipants = Array.isArray(data?.participants)
          ? data.participants.map((participant: any) => ({
              id: participant?.id ?? '',
              name: participant?.name ?? '',
              role: participant?.role ?? '',
              icon_key: participant?.icon_key,
            }))
          : [];
        const sourceData: Record<string, unknown> =
          data && typeof data === 'object' ? data : {};
        const visual = normalizeConversationVisualMetadata(
          sourceData,
          rawParticipants,
        );
        result = {
          participants: rawParticipants.map(
            (participant: any, index: number) => ({
              id: participant.id,
              name: participant.name,
              role: participant.role,
              icon_key: visual.participant_icon_keys[index],
            }),
          ),
          messages: Array.isArray(data?.messages)
            ? data.messages.map((m: any) => ({
                p_id: m.p_id ?? '',
                text: m.text ?? '',
                timestamp: m.timestamp ?? '',
              }))
            : [],
          scene_kind: visual.scene_kind,
          visual_aid: visual.visual_aid,
        };
        if (result.messages.length === 0) {
          result.participants = [
            { id: 'p1', name: '', role: '', icon_key: 'person' },
          ];
          result.messages = [{ p_id: 'p1', text: '', timestamp: '' }];
        }
        break;
      }

      case 'TPL_CASE_DIAGNOSTIC_FRAME':
        result = (() => {
          // profile → case_profile auto-fix (string 또는 object 모두 허용)
          const rawCp = data?.case_profile || data?.profile;
          const caseProfile = rawCp
            ? typeof rawCp === 'object'
              ? rawCp
              : { name: String(rawCp), context: '' }
            : null;
          return {
            case_profile: caseProfile
              ? {
                  name: caseProfile.name ?? '',
                  context: caseProfile.context ?? '',
                }
              : { name: '', context: '' },
            // narrative가 없으면 profile 텍스트를 fallback
            narrative:
              typeof data?.narrative === 'string'
                ? data.narrative
                : typeof data?.profile === 'string'
                  ? data.profile
                  : '',
            // string[] check_items → {id, label, is_checked}[] 변환
            check_items: Array.isArray(data?.check_items)
              ? data.check_items.map((ci: any, i: number) => {
                  if (typeof ci === 'string')
                    return { id: String(i + 1), label: ci, is_checked: false };
                  return {
                    id: ci.id ?? String(i + 1),
                    label: ci.label ?? '',
                    is_checked: false,
                  };
                })
              : [],
          };
        })();
        if (!result.narrative && result.case_profile?.context) {
          result.narrative = result.case_profile.context;
        }
        if (
          !result.case_profile?.name &&
          !result.case_profile?.context &&
          !result.narrative
        ) {
          result.narrative = '';
        }
        break;

      case 'TPL_SEQUENTIAL_WORKFLOW':
        result = {
          orientation:
            typeof data?.orientation === 'string' &&
            ['horizontal', 'vertical'].includes(data.orientation)
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
        if (result.steps.length === 0) {
          result.steps = [{ idx: 1, label: '', desc: '', is_missing: false }];
        }
        break;

      case 'TPL_INSTRUCTIONAL_SCENE':
        result = {
          instructor: (() => {
            const raw =
              data?.instructor && typeof data.instructor === 'object'
                ? {
                    id: String(data.instructor.id ?? ''),
                    text: String(data.instructor.text ?? ''),
                  }
                : { id: '', text: '' };
            // instructor.text가 너무 짧으면 canvas_content.data에서 첫 발화 추출
            if (raw.text.length < 5) {
              const ccData = data?.canvas_content?.data;
              if (typeof ccData === 'string') {
                const match = ccData.match(
                  /^(?:교사|선생님|강사)\s*[:]\s*(.+?)(?:\s*\[|\s*$)/,
                );
                if (match) raw.text = match[1].trim();
              }
            }
            return raw;
          })(),
          canvas_content: (() => {
            if (
              data?.canvas_content &&
              typeof data.canvas_content === 'object'
            ) {
              const rawType = data.canvas_content.type;
              let rawData = data.canvas_content.data;
              const type = this.normalizeCanvasType(rawType, rawData);
              // instructor 말풍선과 중복 방지: canvas_data에서 teacher prefix 제거
              if (type === 'text' && typeof rawData === 'string') {
                rawData = rawData
                  .replace(/^(교사|선생님|강사)\s*[:]\s*/, '')
                  .trim();
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
        if (!result.instructor?.text && result.canvas_content?.data) {
          result.instructor = {
            id: result.instructor?.id ?? '',
            text: String(result.canvas_content.data).slice(0, 50),
          };
        }
        if (!result.instructor?.text && !result.canvas_content?.data) {
          result.canvas_content = { type: 'text', data: '' };
        }
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
        if (!result.main_post?.content) {
          result.main_post.content = result.forum_name || '';
        }
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
        if (result.datasets.length === 0) {
          result.datasets = [{ label: '', values: [] }];
        }
        if (result.axes.length === 0) {
          result.axes = [{ key: '', label: '', max: 10 }];
        }
        break;

      case 'TPL_PROMOTIONAL_CANVAS':
        result = {
          slogan: typeof data?.slogan === 'string' ? data.slogan : '',
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
          typeof data.data === 'string'
            ? data.data
            : typeof data.content === 'string'
              ? data.content
              : typeof data.body === 'string'
                ? data.body
                : typeof data.narrative === 'string'
                  ? data.narrative
                  : typeof data.description === 'string'
                    ? data.description
                    : typeof data.headline === 'string'
                      ? data.headline
                      : typeof data.text === 'string'
                        ? data.text
                        : typeof data.stimulus === 'string'
                          ? data.stimulus
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

    return result;
  }
}

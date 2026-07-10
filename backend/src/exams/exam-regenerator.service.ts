import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { Difficulty } from '../entities/exam-record.entity';
import { ExamGenerationProgressReporter, FALLBACK_KEYWORDS, TEXTBOOK_BASE } from './exam-generation.utils';

const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 180_000;

@Injectable()
export class ExamRegeneratorService {
  private readonly logger = new Logger(ExamRegeneratorService.name);

  async regenerateBatch(
    client: OpenAI,
    batchPrompt: string,
    selected: any[],
    result: any[],
    difficulty: Difficulty,
    startUnitNum: number,
    reportProgress?: ExamGenerationProgressReporter,
    attempt = 1,
  ): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

      const response = await client.chat.completions.create({
        model: process.env.OPENAI_STEP1_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a Korean CSAT question generator for 전문 교과 (성공적인 직업생활, 공업 일반).\nGiven reference questions, create NEW questions with DIFFERENT scenarios but EQUAL complexity.\nCRITICAL: Your generated stimulus must be as DETAILED and RICH as the reference stimulus.\nInclude specific names (A씨, B씨), numbers (periods, amounts, counts, years), locations, and causally connected narratives.\nAvoid generic descriptions — every sentence should add concrete information.\nOutput valid JSON array.' },
          { role: 'user', content: batchPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
      });
      clearTimeout(timeoutId);

      const content2 = response.choices[0]?.message?.content;
      if (!content2) {
        if (attempt < 2) {
          await this.regenerateBatch(client, batchPrompt, selected, result, difficulty, startUnitNum, reportProgress, attempt + 1);
        }
        return;
      }

      const parsed = JSON.parse(content2);
      let items: any[] = parsed.questions || parsed.items || (Array.isArray(parsed) ? parsed : []);
      if (!Array.isArray(items) || (items.length === 0 && parsed.stem)) {
        items = [parsed];
      }
      if (items.length === 0) {
        this.logger.warn('[REGEN] no items in response');
        return;
      }

      this.logger.log('[REGEN] batch returned ' + items.length + ' items (requested ' + selected.length + ')');

      for (let i = 0; i < items.length && i < selected.length; i++) {
        const gen = items[i];
        const ref = selected[i];
        const unitNum = ref.source?.unitNumber || startUnitNum;

        let rawChoices = gen.choices;
        if (!rawChoices || !Array.isArray(rawChoices) || rawChoices.length !== 5) {
          rawChoices = ref.choices || [];
        }
        if (rawChoices.length > 0 && typeof rawChoices[0] === 'string' && !rawChoices[0].startsWith('①')) {
          rawChoices = ref.choices || [];
        }

        const rawAnswer = gen.correctAnswer ?? gen.correct_answer ?? (i + 1);

        const viewItems: string[] = (Array.isArray(gen.viewItems) && gen.viewItems.length > 0)
          ? gen.viewItems
          : (ref.viewItems || []);

        const comboBlock = viewItems.length > 0
          ? { title: '<보기>', items: viewItems.map((v: string) => {
              const m = v.match(/^([ㄱ-ㅎ])\.\s*(.*)$/);
              return { key: m ? m[1] : 'ㄱ', text: m ? m[2] : v };
            })}
          : null;

        let stimulusText = gen.stimulus || ref.stimulus || '';

        const boViewMatch = stimulusText.match(/<보\s*기>\s*\n?([\s\S]*)$/);
        if (boViewMatch) {
          stimulusText = stimulusText.substring(0, stimulusText.indexOf('<보')).trim();
        }

        let stemText = (gen.stem || ref.stem || '').replace(/^\[\d+~\d+\]\s*/, '').replace(/^\d+\.\s*/, '').replace(/\s*\[3점\]/g, '');

        stemText = stemText.replace(/^위\s*(사례|자료|표|보고서|강의|글)/, '다음 $1');
        stemText = stemText.replace(/^위\s+(.+?)(에서|을|를)/, '다음 $1$2');

        const genTemplateType = gen.templateType || gen.template_type || '';

        // Use string stimulus always — convertBatchToTpl handles structured conversion with isEmptyContent validation
        let finalStimulusData: any = stimulusText;
        let finalTemplate = genTemplateType && genTemplateType !== 'TPL_PLAIN_TEXT'
          ? genTemplateType
          : 'TPL_EXAM_REFERENCE';

        // Safety: empty object → string fallback
        if (typeof finalStimulusData === 'object' && !Array.isArray(finalStimulusData) &&
            Object.keys(finalStimulusData).length === 0) {
          finalStimulusData = stimulusText || '';
          finalTemplate = 'TPL_PLAIN_TEXT';
        }

        if (typeof finalStimulusData === 'string') {
          const clean = finalStimulusData.replace(/^viewItems:\s*/i, '');
          if (/^[ㄱ-ㅎ][\.\s]/.test(clean) && clean.includes('|')) {
            this.logger.warn(`[REGEN] viewItems 내용이 stimulus로 잘못 들어감, 제거: targetConcept=${gen.targetConcept || ref.targetConcepts?.join(',')}`);
            finalStimulusData = '';
          }
        }

        const targetDomain = gen.targetConcept || (ref.targetConcepts || []).join(' ');
        const optText = rawChoices.join(' ');
        const stemDomain = (stemText + ' ' + (typeof finalStimulusData === 'string' ? finalStimulusData : '')).toLowerCase();
        const hasLabor = /노동|근로|임금|고용|퇴직|연장|야간|휴게|휴가|산재/.test(stemDomain);
        const hasEdu = /학습|교육|학교|수업|교사|학생/.test(stemDomain);
        const optHasLabor = /노동|근로|임금|고용|퇴직|연장|야간|휴게|휴가|산재/.test(optText);
        const optHasEdu = /학습|교육|학교|수업|교사|학생/.test(optText);
        if (hasEdu && !hasLabor && optHasLabor && !optHasEdu) {
          this.logger.warn(`[REGEN] 선택지-개념 도메인 불일치: stem=교육, options=노동법 — targetConcept=${targetDomain}`);
        }

        let stimText = '';
        if (typeof finalStimulusData === 'string') {
          stimText = finalStimulusData;
        } else if (finalStimulusData && typeof finalStimulusData === 'object') {
          stimText = finalStimulusData.narrative || finalStimulusData.data
            || finalStimulusData.content || finalStimulusData.description
            || finalStimulusData.body || finalStimulusData.text
            || '';
        }
        if (stimText && comboBlock && comboBlock.items.length > 0) {
          const stimNames = [...stimText.matchAll(/([A-Z])씨/g)].map((m) => m[1]);
          const viewText = comboBlock.items.map((i: any) => i.text).join(' ');
          const viewNames = [...viewText.matchAll(/([A-Z])씨/g)].map((m) => m[1]);
          if (stimNames.length > 0 && viewNames.length > 0 && stimNames[0] !== viewNames[0]) {
            const nameMap = new Map<string, string>();
            viewNames.forEach((vn, i) => { if (stimNames[i]) nameMap.set(vn, stimNames[i]); });
            const replaceName = (s: string) => s.replace(/([A-Z])\s*씨/g, (_, letter) => nameMap.get(letter) ? nameMap.get(letter) + '씨' : letter + '씨');
            comboBlock.items = comboBlock.items.map((item: any) => ({ ...item, text: replaceName(item.text) }));
            rawChoices = rawChoices.map((opt: string) => replaceName(opt));
            this.logger.log(`[REGEN] 이름 동기화: ${[...nameMap.entries()].map(([k, v]) => `${k}씨→${v}씨`).join(', ')}`);
          }
        }

        result.push({
          metadata: {
            unit_name: unitNum + '단원',
            target_concept: gen.targetConcept || gen.target_concept || ref.targetConcepts?.join(', ') || '일반',
            item_type: 'reference_variant',
            difficulty: gen.difficulty || difficulty,
            recommended_template: finalTemplate,
          },
          render_ready: {
            question_stem: stemText,
            stimulus_data: finalStimulusData,
            options_list: rawChoices,
            combo_block: comboBlock,
          },
          explanation: { judgment: gen.explanation || '생성형 문항' },
          correct_answer: rawAnswer,
        });
      }

      if (reportProgress) {
        await reportProgress({
          stage: 'regenerating',
          progress: 70,
          message: result.length + '/' + selected.length + ' 문항 재생성 완료',
        });
      }
    } catch (e: any) {
      const code = e.code || e.status || 'unknown';
      const message = e?.message || String(e);
      const cause = e?.cause ? String(e.cause).slice(0, 200) : '';
      this.logger.error('[REGEN] batch failed (attempt ' + attempt + '): code=' + code + ', message=' + message + (cause ? ', cause=' + cause : ''));
      if (attempt < 2) {
        await this.regenerateBatch(client, batchPrompt, selected, result, difficulty, startUnitNum, reportProgress, attempt + 1);
      }
    }
  }

  async verifyBatch(client: OpenAI, items: any[]): Promise<number[]> {
    if (items.length === 0) return [];

    const promptLines = items.map((item, i) => {
      const stem = item.render_ready?.question_stem || '';
      const stimRaw = item.render_ready?.stimulus_data;
      const stim = typeof stimRaw === 'string' ? stimRaw : JSON.stringify(stimRaw || '');
      const choices = (item.render_ready?.options_list || []).join(' | ');
      const viewItems = item.render_ready?.combo_block?.items || [];
      const viewText = viewItems.map((v: any) => v.key + '. ' + v.text).join(' | ');
      const answer = item.correct_answer || '';
      return `[Item ${i}]\nstem: ${stem.slice(0, 200)}\nstimulus: ${stim.slice(0, 500)}\nchoices: ${choices.slice(0, 300)}\nviewItems: ${viewText.slice(0, 200)}\nanswer: ${answer}`;
    }).join('\n\n');

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You verify Korean CSAT questions. Focus on these CRITICAL issues only:\n\nFAIL (reject the item):\n1. stimulus is empty ({} or "")\n2. stem topic and viewItems topic are COMPLETELY DIFFERENT — e.g., stem is about bank loans but viewItems are about labor law\n3. Person names in viewItems (A, B, C, D) do NOT match person names in the stimulus — e.g., stimulus talks about C,D but viewItems reference A,B\n4. correctAnswer is out of 1-5 range\n5. The STEM topic is from a COMPLETELY DIFFERENT SUBJECT than the reference — e.g., reference concepts are about labor law (근로기준법, 임금) but generated stem is about environmental law (환경보호법)\n6. stimulus contains "viewItems:" text or combo block items (ㄱ. ㄴ. patterns separated by |) in a document field — the stimulus should have actual content, not viewItems/combo_block text\n7. stimulus_data is a structured object (not empty) but all content fields are empty/null — e.g., {case_profile: {}, narrative: ""} — this is a FAIL, should fall back to plain text\n\nPASS everything else, even if there are minor issues.\nReturn JSON array: [{itemIndex, passed: true/false, reason: "..."}]' },
        { role: 'user', content: 'Verify:\n\n' + promptLines },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    try {
      const parsed = JSON.parse(content);
      const results = parsed.results || parsed.verifications || parsed.items || (Array.isArray(parsed) ? parsed : [parsed]);
      const arr = Array.isArray(results) ? results : [results];
      const failed: number[] = [];

      for (const r of arr) {
        if (r.itemIndex === undefined) continue;
        if (!r.passed) {
          failed.push(r.itemIndex);
          this.logger.warn('[VERIFY] item ' + r.itemIndex + ' FAIL: ' + (r.reason || '').slice(0, 150));
        }
      }

      return failed;
    } catch (e: any) {
      this.logger.warn('[VERIFY] parse failed: ' + e.message);
      return [];
    }
  }

  /** 규칙 기반 TPL 변환 — 틀에 맞으면 LLM 없이 직접 구조체 생성 */
  private preProcessTpl(stimulus: string): { templateType: string; stimulusData: any } | null {
    const lines = stimulus.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return null;

    // Rule 1: Table (most specific — pipe-delimited rows)
    const pipeLines = lines.filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
    if (pipeLines.length >= 2) {
      const headerCells = pipeLines[0].split('|').filter(c => c.trim()).map(c => c.trim());
      const headers = headerCells.map((h, i) => ({ id: `h${i + 1}`, label: h }));
      const rows = pipeLines.slice(1)
        .filter(l => !/^[\|\s\-]+$/.test(l))
        .map((l, i) => ({
          id: `r${i + 1}`,
          cells: l.split('|').filter(c => c.trim()).map(c => c.trim()),
        }));
      if (headers.length >= 2 && rows.length >= 1) {
        return { templateType: 'TPL_COMPARATIVE_MATRIX', stimulusData: { headers, rows } };
      }
    }

    // Rule 2: Legal text (법률/조문 → FORMAL_DOCUMENT)
    if (/제\s*\d+\s*조|법률|법\s*제|근로기준법/.test(stimulus)) {
      return {
        templateType: 'TPL_FORMAL_DOCUMENT',
        stimulusData: {
          doc_type: '법률',
          header_info: { title: '', date: '', author: '' },
          paragraphs: [{ sub_title: '', content: stimulus }],
          footnotes: [],
        },
      };
    }

    // Rule 3: Q&A Forum (질문 + 답변 pattern → DIGITAL_FORUM_INTERFACE)
    if (/질문\s*[:]/.test(stimulus) && /답변\s*[:]/.test(stimulus)) {
      return {
        templateType: 'TPL_DIGITAL_FORUM_INTERFACE',
        stimulusData: {
          forum_name: '',
          main_post: { author: '질문자', title: '', content: stimulus },
          comments: [],
        },
      };
    }

    // Rule 4: Steps/procedure (numbered items)
    const stepPattern = /^\s*(?:(\d+)\s*[\.\)]|①|②|③|④|⑤)\s*/;
    const stepLines = lines.filter(l => stepPattern.test(l.trim()));
    if (stepLines.length >= 2) {
      const steps = stepLines.map((line, i) => ({
        idx: i + 1,
        label: `Step ${i + 1}`,
        desc: line.trim().replace(stepPattern, '').trim(),
        is_missing: false,
      }));
      return { templateType: 'TPL_SEQUENTIAL_WORKFLOW', stimulusData: { steps, orientation: 'vertical' } };
    }

    // Rule 5: Lecture (teacher speaker → INSTRUCTIONAL_SCENE)
    if (/^(교사|강사|선생님)\s*[:]/m.test(stimulus)) {
      const teacherMatch = stimulus.match(/^(교사|강사|선생님)\s*[:]\s*(.+?)$/m);
      return {
        templateType: 'TPL_INSTRUCTIONAL_SCENE',
        stimulusData: {
          instructor: { id: 'teacher', text: teacherMatch?.[2]?.slice(0, 100) ?? '' },
          canvas_content: { type: 'text', data: stimulus },
          students: [],
        },
      };
    }

    // Rule 6: Dialogue (short speaker labels like "A: ", "B: " — 1~2 chars)
    const shortSpeakerPattern = /^([A-Za-z]{1,2})\s*[:]\s*/;
    const speakerLines = lines.filter(l => shortSpeakerPattern.test(l.trim()));
    if (speakerLines.length >= 2) {
      const participants: { id: string; name: string; role: string }[] = [];
      const messages: { p_id: string; text: string }[] = [];
      const seen = new Set<string>();
      for (const line of speakerLines) {
        const m = line.trim().match(shortSpeakerPattern);
        if (m) {
          const id = m[1].trim();
          const text = line.trim().slice(m[0].length).trim();
          if (!seen.has(id)) { seen.add(id); participants.push({ id, name: id, role: '' }); }
          messages.push({ p_id: id, text });
        }
      }
      if (messages.length >= 2) {
        return { templateType: 'TPL_CONVERSATIONAL_FLOW', stimulusData: { participants, messages } };
      }
    }

    // Rule 7: Person case (A씨/B씨 — most generic, last)
    if (/[A-Z]씨/.test(stimulus) && stimulus.length >= 60) {
      const nameMatch = stimulus.match(/([A-Z])씨/);
      return {
        templateType: 'TPL_CASE_DIAGNOSTIC_FRAME',
        stimulusData: {
          case_profile: { name: nameMatch ? `${nameMatch[1]}씨` : '', context: stimulus.slice(0, 120) },
          narrative: stimulus,
        },
      };
    }

    return null;
  }

  async convertBatchToTpl(client: OpenAI, items: any[]): Promise<void> {
    if (items.length === 0) return;

    const preConvertStimuli = items.map((item) => item.render_ready?.stimulus_data);

    // Phase 1: Rule-based preprocessing
    for (let i = 0; i < items.length; i++) {
      const s = typeof items[i].render_ready?.stimulus_data === 'string'
        ? items[i].render_ready.stimulus_data.trim() : '';
      if (s.length < 10) continue;
      const ruleResult = this.preProcessTpl(s);
      if (ruleResult) {
        items[i].render_ready.stimulus_data = ruleResult.stimulusData;
        items[i].metadata.recommended_template = ruleResult.templateType;
        this.logger.log(`[TPL] Rule match: item ${i} → ${ruleResult.templateType}`);
      }
    }

    // Phase 2: LLM for items rules didn't match (still have string stimulus_data)
    const indices: number[] = [];
    const inputs: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const s = typeof items[i].render_ready?.stimulus_data === 'string'
        ? items[i].render_ready.stimulus_data.trim() : '';
      if (s.length < 10) continue;
      indices.push(i);
      inputs.push('[Item ' + i + '] stem: ' + (items[i].render_ready?.question_stem || '').slice(0, 200) + '\nstimulus: ' + s.slice(0, 1500));
    }
    if (inputs.length === 0) return;

    try {
      const response = await client.chat.completions.create({
        model: process.env.OPENAI_STEP1_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: 'Convert Korean CSAT stimuli to TPL-structured JSON. Return array of {itemIndex, templateType, stimulusData, confidence(1-5)}.\n\nValid templateType values (use ONLY these — NO PLAIN_TEXT):\n- TPL_CONVERSATIONAL_FLOW: dialogue/interview with participants and messages\n- TPL_CASE_DIAGNOSTIC_FRAME: case narrative with profile and check_items\n- TPL_FORMAL_DOCUMENT: document with doc_type, header_info, paragraphs\n- TPL_COMPARATIVE_MATRIX: table with headers and rows\n- TPL_SEQUENTIAL_WORKFLOW: steps with orientation\n- TPL_DIGITAL_FORUM_INTERFACE: forum with main_post and comments\n- TPL_INSTRUCTIONAL_SCENE: lecture with instructor and canvas\n- TPL_PROMOTIONAL_CANVAS: ad with slogan and bullets\n- TPL_QUANTITATIVE_CHART: chart with chart_type, axes, datasets\n\nCRITICAL: Extract ALL content from the input stimulus into the template fields. Never leave fields empty.\nFor each template type, map content as follows:\n- CASE_DIAGNOSTIC_FRAME: narrative = FULL original text verbatim, case_profile = person/business name extracted\n- CONVERSATIONAL_FLOW: messages = EVERY dialogue line with full text, participants = speaker names\n- COMPARATIVE_MATRIX: rows = ALL data rows with full cell values, headers = ALL column labels\n- FORMAL_DOCUMENT: paragraphs = ALL paragraphs with full text, header_info = document metadata\n- INSTRUCTIONAL_SCENE: canvas_content.data = FULL lecture content, instructor = speaker name\n- QUANTITATIVE_CHART: datasets = ALL data groups with labels and values, axes = complete axis info\n- SEQUENTIAL_WORKFLOW: steps = ALL steps with full descriptions\n- DIGITAL_FORUM_INTERFACE: main_post.content = full post, comments = ALL comment text\n- PROMOTIONAL_CANVAS: bullets = ALL bullet/feature descriptions\n\nconfidence=5: perfect template match, all content preserved\nconfidence=3: partial match, some content adapted\nconfidence=1: content would be lost — prefer PLAIN_TEXT instead\n\nBe proactive when the stimulus CLEARLY matches: dialogue markers (" :") → CONVERSATIONAL_FLOW, tables → COMPARATIVE_MATRIX, case narratives → CASE_DIAGNOSTIC_FRAME, documents → FORMAL_DOCUMENT.' },
          { role: 'user', content: 'Convert:\n\n' + inputs.join('\n\n') },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      });

      const content3 = response.choices[0]?.message?.content;
      if (!content3) return;

      const parsed = JSON.parse(content3);
      const arr = parsed.conversions || parsed.items || parsed.results || (Array.isArray(parsed) ? parsed : [parsed]);
      const convs = Array.isArray(arr) ? arr : [arr];

      const PLACEHOLDER_PATTERNS = ['(내용 없음)', '내용 없음', '값을 입력', '여기에 ', '{{', 'TEXT', 'BLANK'];
      const SCHEMA_KEYS = new Set(['type', 'chart_type', 'orientation', 'idx', 'is_missing', 'id', 'role', 'p_id', 'order', 'max', 'min', 'key']);
      const CONTENT_FIELDS = ['narrative', 'data', 'content', 'description', 'body', 'text',
                               'messages', 'rows', 'paragraphs', 'canvas_content', 'case_profile',
                               'main_post', 'steps', 'header_info', 'label', 'name',
                               'slogan', 'bullets', 'forum_name'];
      const hasRealContent = (val: any): boolean => {
        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (!trimmed) return false;
          if (PLACEHOLDER_PATTERNS.some(p => trimmed.includes(p))) return false;
          return trimmed.length > 0;
        }
        if (Array.isArray(val)) {
          if (val.length === 0) return false;
          return val.some(v => hasRealContent(v));
        }
        if (typeof val === 'object' && val) {
          if (Object.keys(val).length === 0) return false;
          return Object.entries(val).some(([k, v]) => {
            if (SCHEMA_KEYS.has(k)) return false;
            return hasRealContent(v);
          });
        }
        return val != null;
      };
      const isEmptyContent = (obj: any): boolean => {
        if (typeof obj !== 'object' || Array.isArray(obj)) return false;
        return !CONTENT_FIELDS.some(k => {
          const v = obj[k];
          if (v === undefined) return false;
          return hasRealContent(v);
        });
      };

      for (const conv of convs) {
        const idx = conv.itemIndex;
        if (idx === undefined || idx < 0 || idx >= items.length) continue;
        if (!conv.stimulusData) continue;
        const item = items[idx];
        const confidence = conv.confidence ?? 0;

        if (confidence < 2 || (typeof conv.stimulusData === 'object' && !Array.isArray(conv.stimulusData) &&
            (Object.keys(conv.stimulusData).length === 0 || isEmptyContent(conv.stimulusData)))) {
          item.metadata.recommended_template = 'TPL_PLAIN_TEXT';
          const orig = preConvertStimuli[idx];
          if (typeof orig === 'string' && orig.trim()) {
            item.render_ready.stimulus_data = orig;
          }
          continue;
        }

        item.render_ready.stimulus_data = conv.stimulusData;
        item.metadata.recommended_template = conv.templateType || 'TPL_PLAIN_TEXT';
      }

      for (const item of items) {
        if (item.metadata?.recommended_template === 'TPL_EXAM_REFERENCE') {
          item.metadata.recommended_template = 'TPL_PLAIN_TEXT';
        }
      }
    } catch {}
  }

  buildBatchRegenPrompt(refs: any[], difficulty: Difficulty, patterns: string, customPrompt?: string): string {
    const count = refs.length;
    let prompt = 'Create ' + count + ' NEW Korean CSAT questions. Must output EXACTLY ' + count + '.\n';
    prompt += 'For EACH reference output exactly one new question.\n';
    prompt += 'Keep same structure (same number of view items, 5 choices).\n';
    prompt += '[중요] 개념 도메인을 절대 변경하지 마라.\n';
    prompt += '  reference concepts가 "근로기준법, 임금, 근로계약"이면 생성된 question도 근로기준법/노동법 영역을 유지하라.\n';
    prompt += '  "소비자보호법", "환경보호법", "교육기준법" 등 전혀 다른 법률 영역으로 변경하는 것은 금지한다.\n';
    prompt += '  같은 개념을 유지하되 새로운 사례/상황/시나리오로 문제를 다시 구성하라.\n';
    prompt += '  개념 자체를 다른 법률로 대체하지 말고, 같은 개념 안에서 세부 내용(근로시간 유형, 임금 계산 조건, 해고 사유 등)을 바꿔라.\n';
    prompt += 'NAMING CONSISTENCY: Use the SAME character names throughout the entire question. If stimulus uses "A씨, B씨", then viewItems and choices must also use "A씨, B씨" — NOT different letters. The first mentioned character is always A씨, second is B씨, etc. Never mix letter assignments between stimulus and viewItems.\n';
    prompt += 'Every question MUST have: stem (with \\n line breaks), stimulus (plain text), viewItems, choices (5 with ①②③④⑤), correctAnswer (1-5).\n';
    prompt += 'Choices must have ①~⑤ prefix. Do NOT use (가)(나)(다) placeholders.\n';
    prompt += 'Do NOT include original exam number prefixes like [6~7].\n';
    prompt += 'Determine correctAnswer by evaluating each view item (ㄱㄴㄷㄹ) as TRUE/FALSE.\n';
    prompt += '\n';
    prompt += 'DIFFICULTY VARIETY: Include a mix of difficulty levels. If ' + difficulty + ' is INTERGRATE, at least 40% should require multi-concept reasoning. Vary the question patterns.\n';
    prompt += '\n';
    prompt += 'TEMPLATE TYPES: TPL_CONVERSATIONAL_FLOW, TPL_CASE_DIAGNOSTIC_FRAME, TPL_FORMAL_DOCUMENT, TPL_COMPARATIVE_MATRIX, TPL_INSTRUCTIONAL_SCENE, TPL_DIGITAL_FORUM_INTERFACE, TPL_SEQUENTIAL_WORKFLOW, TPL_QUANTITATIVE_CHART, TPL_PROMOTIONAL_CANVAS\n';
    prompt += '\n';
    prompt += '[Writing Style & Question Logic]\n';
    prompt += 'Tone: formal, objective, fact-based — like textbook/exam.\n';
    prompt += '- Connectors: ~에 따라, ~을 통해, ~에 대해, ~도록, ~에 해당하는\n';
    prompt += '- Endings: ~이다/~한다 (declarative), ~했다 (past narrative)\n';
    prompt += '- Names: ○○기업/××× (anonymous), A씨/B씨 (people), A기업/B기업 (comparison)\n';
    prompt += '- Vocabulary: ~에 대한/대하여, ~에 해당하는, ~에 관한, ~을 위한, ~에 따른\n';
    prompt += '- Composition: structured tables, procedural steps, case narratives, dialogues with specific numbers/dates/amounts\n';
    prompt += '\n';
    prompt += 'Answer logic (each question must satisfy):\n';
    prompt += '1. Stimulus → concrete scenario with specific facts.\n';
    prompt += '2. Each viewItem (ㄱ/ㄴ/ㄷ/ㄹ) → one factual claim applying a concept to the scenario.\n';
    prompt += '3. Every viewItem must be directly verifiable from the stimulus (clear TRUE/FALSE).\n';
    prompt += '4. ViewItems must test distinct concepts (no overlap between items).\n';
    prompt += '5. Correct answer = combination of TRUE items, matching exactly one of the 5 choices.\n';
    prompt += '\n';
    prompt += 'Stimulus length: 150~500 characters. ViewItems: 3 or 4 items.\n';
    prompt += 'Choice format: 5 options with ①~⑤ prefix.\n';
    prompt += '\n';
    prompt += 'Output format per question:\n';
    prompt += '{stem, stimulus, viewItems, choices, correctAnswer, templateType}\n';

    if (patterns) {
      prompt += '\n' + patterns + '\n';
    }

    if (customPrompt) {
      prompt += '\nUser request: ' + customPrompt + '\n';
    }

    prompt += '\nReturn JSON array of ' + count + ' objects.\n\n';

    for (let i = 0; i < refs.length; i++) {
      const r = refs[i];
      prompt += '[Reference ' + (i + 1) + ']\n';
      prompt += 'stem: ' + (r.stem || '').replace(/\n/g, ' ') + '\n';
      prompt += 'stimulus: ' + (r.stimulus || '').replace(/\n/g, ' ').slice(0, 1000) + '\n';
      if (r.viewItems && r.viewItems.length > 0)
        prompt += 'viewItems: ' + r.viewItems.join(' | ').replace(/\n/g, ' ') + '\n';
      prompt += 'choices: ' + (r.choices || []).join(' | ').replace(/\n/g, ' ') + '\n';
      prompt += 'concepts: ' + (r.targetConcepts || []).join(', ') + '\n\n';
    }

    prompt += 'Return JSON array of ' + count + ' objects.';
    return prompt;
  }

  filterDomainMismatch(items: any[], subjectSlug: string, startUnitNum: number, endUnitNum: number): number[] {
    const kwSet = new Set<string>();

    for (let u = startUnitNum; u <= endUnitNum; u++) {
      const unitKw = this.getUnitKeywords(subjectSlug, u);
      this.splitIntoKeywords(unitKw).forEach((kw) => kwSet.add(kw));
    }

    const fallback = FALLBACK_KEYWORDS[subjectSlug] ?? [];
    fallback.forEach((kw) => kwSet.add(kw));

    const keywords = [...kwSet];
    if (keywords.length === 0) return [];
    const failed: number[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const stem = item.render_ready?.question_stem ?? '';
      const stim = typeof item.render_ready?.stimulus_data === 'string'
        ? item.render_ready.stimulus_data
        : JSON.stringify(item.render_ready?.stimulus_data ?? '');
      const text = stem + ' ' + stim;
      const hasKeyword = keywords.some((kw) => text.includes(kw));
      if (!hasKeyword) {
        this.logger.warn(`[REGEN] 도메인 불일치 필터링: item ${i} — stem=${stem.slice(0, 60)}...`);
        failed.push(i);
      }
    }
    return failed;
  }

  private getUnitKeywords(subjectSlug: string, unitNum: number): string[] {
    const folder = subjectSlug === 'success' ? 'sungjik' : 'kongil';
    const fp = path.join(TEXTBOOK_BASE, 'concepts', folder, `Unit_${String(unitNum).padStart(2, '0')}.json`);
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.concepts)) return data.concepts;
      return [];
    } catch {
      return [];
    }
  }

  private splitIntoKeywords(concepts: string[]): string[] {
    const tokens = new Set<string>();
    for (const c of concepts) {
      const parts = c.split(/\s+|\s*vs\s*|\//);
      for (const p of parts) {
        const trimmed = p.trim().replace(/[^가-힣a-zA-Z0-9]/g, '');
        if (trimmed.length >= 2) tokens.add(trimmed);
      }
    }
    return [...tokens];
  }
}

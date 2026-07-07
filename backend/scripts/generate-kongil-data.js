const fs = require('fs');
const path = require('path');

const TEXTBOOK_DIR = path.resolve(__dirname, '..', '..', 'textbook');
const SUMMATION_DIR = path.join(TEXTBOOK_DIR, 'kongil_summation');
const FREQUENCY_DIR = path.join(TEXTBOOK_DIR, 'kongil_frequency');
const OUTPUT_V2_DIR = path.join(TEXTBOOK_DIR, 'kongil_summation_v2');
const OUTPUT_CARDS_DIR = path.join(TEXTBOOK_DIR, 'kongil_cards_moi');
const OUTPUT_MINDMAP_DIR = path.join(TEXTBOOK_DIR, 'kongil_mindmaps');

// ============================================================
// 1. summation → summation_v2 변환
// ============================================================
function convertSummationToV2() {
  console.log('=== Converting summation to summation_v2 ===');
  if (!fs.existsSync(SUMMATION_DIR)) {
    console.error('ERROR: kongil_summation directory not found');
    return;
  }
  fs.mkdirSync(OUTPUT_V2_DIR, { recursive: true });

  const files = fs.readdirSync(SUMMATION_DIR).filter(f => f.endsWith('.md'));
  let count = 0;

  for (const file of files) {
    const content = fs.readFileSync(path.join(SUMMATION_DIR, file), 'utf-8');
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      console.warn(`  SKIP ${file}: no JSON block found`);
      continue;
    }

    try {
      const data = JSON.parse(jsonMatch[1]);
      const unitNumber = parseInt(file.replace(/[^0-9]/g, ''), 10);
      const unitTitle = data.subject ?? `${unitNumber}단원`;

      const cards = (data.cards ?? []).map((card) => {
        const c = card.content ?? {};
        const bulletPoints = c.bullet_points ?? [];
        const trapPoints = c.trap_points ?? [];

        const integrated = c.integrated_data ?? {};
        const bodyParts = [c.description ?? ''];
        if (integrated.table) bodyParts.push('[표]\n' + integrated.table);
        if (integrated.visual_analysis) bodyParts.push('[분석]\n' + integrated.visual_analysis);
        if (integrated.logic_flow) bodyParts.push('[논리 흐름]\n' + integrated.logic_flow);

        const tags = c.tags ?? [];
        const keyConcepts = tags.length > 0
          ? tags.map((tag, ti) => ({
              name: tag,
              definition: (bulletPoints[ti] || c.description || tag).slice(0, 100),
              key_points: bulletPoints.filter(bp => bp.includes(tag)).length > 0
                ? bulletPoints.filter(bp => bp.includes(tag))
                : [bulletPoints[ti] || c.description || tag].filter(Boolean),
              caution: trapPoints.filter(tp => tp.includes(tag))[0] || (trapPoints[0] ?? ''),
            })).filter(kc => kc.name)
          : bulletPoints.map((bp, bi) => ({
              name: bp.length > 30 ? bp.slice(0, 30) + '...' : bp,
              definition: c.description ?? bp,
              key_points: [bp],
              caution: trapPoints[bi] ?? (trapPoints[0] ?? ''),
            }));

        return {
          content: {
            title: c.title ?? '',
            body: bodyParts.filter(Boolean).join('\n\n'),
            key_concepts: keyConcepts.length > 0 ? keyConcepts : [{ name: c.title ?? '', definition: c.description ?? '', key_points: [], caution: '' }],
            exam_tips: c.exam_tips ?? [],
            trap_points: trapPoints,
          },
        };
      });

      const output = { unit: unitNumber, unitTitle, cards };
      fs.writeFileSync(path.join(OUTPUT_V2_DIR, file.replace('.md', '.json')), JSON.stringify(output, null, 2), 'utf-8');
      count++;
      console.log(`  OK ${file} → ${unitNumber}단원.json (${cards.length} cards)`);
    } catch (e) {
      console.warn(`  ERROR ${file}: ${e.message}`);
    }
  }
  console.log(`  Done: ${count}/${files.length} files\n`);
}

// ============================================================
// 2. frequency → cards_moi 변환
// ============================================================
function extractReadableText(stimulusData, template) {
  if (!stimulusData || typeof stimulusData !== 'object') return '';
  if (template === 'TPL_COMPARATIVE_MATRIX' && Array.isArray(stimulusData.rows)) {
    const headers = (stimulusData.headers ?? []).map(h => h.label);
    const headerLine = headers.join(' | ');
    const sepLine = headers.map(() => '---').join(' | ');
    const rows = stimulusData.rows.map(r => (r.cells ?? []).join(' | ')).join('\n');
    return headerLine + '\n' + sepLine + '\n' + rows;
  }
  if (template === 'TPL_FORMAL_DOCUMENT' && Array.isArray(stimulusData.paragraphs)) {
    return stimulusData.paragraphs.map(p => p.content ?? '').join('\n');
  }
  if (template === 'TPL_CONVERSATIONAL_FLOW' && Array.isArray(stimulusData.messages)) {
    return stimulusData.messages.map(m => (m.p_id ?? '') + ': ' + (m.text ?? '')).join('\n');
  }
  if (template === 'TPL_CASE_DIAGNOSTIC_FRAME') {
    const profile = stimulusData.case_profile;
    return (profile?.context ?? '') + '\n' + (stimulusData.narrative ?? '');
  }
  if (template === 'TPL_INSTRUCTIONAL_SCENE') {
    const parts = [];
    if (stimulusData.instructor?.text) parts.push('[교사] ' + stimulusData.instructor.text);
    if (stimulusData.canvas_content?.data && typeof stimulusData.canvas_content.data === 'string') {
      parts.push(stimulusData.canvas_content.data);
    }
    if (Array.isArray(stimulusData.students)) {
      stimulusData.students.forEach(st => {
        if (st.text) parts.push('[학생] ' + st.text);
      });
    }
    return parts.join('\n');
  }
  if (template === 'TPL_DIGITAL_FORUM_INTERFACE') {
    const parts = [stimulusData.forum_name ?? ''];
    if (stimulusData.main_post?.content) parts.push(stimulusData.main_post.content);
    if (Array.isArray(stimulusData.comments)) {
      stimulusData.comments.forEach(c => { if (c.text) parts.push(c.text); });
    }
    return parts.join('\n');
  }
  if (template === 'TPL_SEQUENTIAL_WORKFLOW' && Array.isArray(stimulusData.steps)) {
    return stimulusData.steps.map(s => (s.label ?? '') + ': ' + (s.desc ?? '')).join(' → ');
  }
  if (template === 'TPL_QUANTITATIVE_CHART' && Array.isArray(stimulusData.datasets)) {
    return stimulusData.datasets.map(ds => ds.label + ': ' + (ds.values ?? []).join(', ')).join('\n');
  }
  return JSON.stringify(stimulusData, null, 2);
}

function convertFrequencyToCardsMoi() {
  console.log('=== Converting frequency to cards_moi ===');
  if (!fs.existsSync(FREQUENCY_DIR)) {
    console.error('ERROR: kongil_frequency directory not found');
    return;
  }
  fs.mkdirSync(OUTPUT_CARDS_DIR, { recursive: true });

  const files = fs.readdirSync(FREQUENCY_DIR).filter(f => f.endsWith('.json'));
  let count = 0;

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(FREQUENCY_DIR, file), 'utf-8'));
      const unitNumber = data.unit ?? parseInt(file.replace(/[^0-9]/g, ''), 10);
      const unitTitle = data.unitTitle ?? `${unitNumber}단원`;

      const concepts = (data.concepts ?? []).map((concept, idx) => {
        const sampleQ = concept.sampleQuestion ?? {};
        const hasSample = sampleQ.render_ready && sampleQ.render_ready.question_stem;
        const renderReady = sampleQ.render_ready ?? {};
        const meta = sampleQ.metadata ?? {};

        const realQuestion = {
          questionData: hasSample ? {
            number: 0,
            source_exam: (concept.sources ?? [])[0] ?? '',
            stimulus: renderReady.stimulus_data ? extractReadableText(renderReady.stimulus_data, meta.recommended_template) : '',
            stem: renderReady.question_stem ?? '',
            box_items: (renderReady.combo_block?.items ?? []).map(i => i.text),
            options: renderReady.options_list ?? [],
            answer: String(sampleQ.correct_answer ?? ''),
            full_text: renderReady.question_stem ?? '',
            render_ready: renderReady,
            metadata: {
              recommended_template: meta.recommended_template ?? '',
              source_exam: (concept.sources ?? [])[0] ?? '',
              question_number: 0,
            },
          } : null,
          conceptUsage: concept.description ?? '',
          conceptHighlight: { inStimulus: '', inOptions: null, reason: '' },
          conceptHighlightV2: {
            stimulusClues: [],
            optionAnalysis: [],
            solvingFlow: (concept.keyPoints ?? []).slice(0, 4).map((kp, si) => ({
              step: si + 1,
              action: kp,
            })),
            takeaway: concept.description ?? '',
          },
        };

        return {
          id: `kongil_${unitNumber}_${String(idx + 1).padStart(2, '0')}`,
          rank: concept.rank ?? idx + 1,
          name: concept.name ?? '',
          frequency: typeof concept.frequency === 'number' ? concept.frequency / 100 : 0,
          sources: concept.sources ?? [],
          card: {
            definition: concept.description ?? '',
            keyPoints: concept.keyPoints ?? [],
            textbookExcerpt: concept.conceptContent ?? '',
            importantNumbers: [],
            comparisonTable: '',
            enrichedDefinition: concept.conceptContent ?? '',
          },
          realQuestion,
          caution: (concept.examTips ?? []).join('; '),
          quiz: [
            {
              question: `다음 중 ${concept.name ?? ''}에 대한 설명으로 옳은 것은?`,
              options: [
                (concept.keyPoints ?? [])[0] ?? '설명 A',
                (concept.keyPoints ?? [])[1] ?? '설명 B',
                (concept.keyPoints ?? [])[2] ?? '설명 C',
                (concept.keyPoints ?? [])[3] ?? '설명 D',
                '위 내용 중 옳은 것은 없다.',
              ],
              answer: 0,
              explanation: concept.description ?? '',
            },
            {
              question: `${concept.name ?? ''}의 특징으로 가장 적절한 것은?`,
              options: [
                (concept.examTips ?? [])[0] ?? '특징 A',
                (concept.examTips ?? [])[1] ?? '특징 B',
                (concept.keyPoints ?? [])[0] ?? '특징 C',
                (concept.keyPoints ?? [])[1] ?? '특징 D',
                '모두 부적절하다.',
              ],
              answer: 2,
              explanation: (concept.examTips ?? []).join(' | ') || ((concept.keyPoints ?? [])[0] || ''),
            },
          ],
        };
      });

      const output = { unit: unitNumber, unitTitle, concepts };
      fs.writeFileSync(path.join(OUTPUT_CARDS_DIR, file), JSON.stringify(output, null, 2), 'utf-8');
      count++;
      console.log(`  OK ${file} (${concepts.length} concepts)`);
    } catch (e) {
      console.warn(`  ERROR ${file}: ${e.message}`);
    }
  }
  console.log(`  Done: ${count}/${files.length} files\n`);
}

// ============================================================
// Main
// ============================================================
convertSummationToV2();
convertFrequencyToCardsMoi();

console.log('=== ALL DONE ===');

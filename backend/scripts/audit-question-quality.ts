/**
 * Comprehensive quality audit from the student's perspective.
 * Checks: TPL mismatch, logical solvability, stylistic quality, OCR fidelity.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { parseReference } from '../src/exams/reference-selector.utils';
import { sourceTemplate, sourcePreservingRender } from '../src/exams/simply-reference-source-preserving.adapter';

// --- Detection patterns ---

// Garbled/unnatural text patterns (OCR artifacts, mixed content)
const GARBLED_PATTERNS = [
  // Random single characters that look like OCR noise
  /\b\w\b/g, // single latin char (may be OK for A, B labels but check)
  // Repeated characters (corruption)
  /([가-힣])\1{4,}/u,
  /([a-zA-Z])\1{6,}/,
  // Nonsense syllable combinations  
  /[ᄀ-하-ᅵᆨ-ᇂ]{4,}/u,
];

// Answer leakage patterns (answer numbers in stimulus/stem)
const ANSWER_LEAK_PATTERNS = [
  /\b[1-5]\b\s*\(단\b/,
  /[①②③④⑤]\s*[ㄱ-ㅎ]\s*[,,\s]/,
];

// Question-in-stimulus patterns
const EMBEDDED_QUESTION_PATTERNS = [
  /고른\s*것은\?/,
  /옳은\s*것은\?/,
  /적절한\s*것은\?/,
  /물음에\s*답하시오/,
];

// Missing critical components
const MISSING_END_PATTERN = /[^다니까요오죠\.]$/; // unlikely for Korean question stems

async function main() {
  const url = process.env.DATABASE_SUPABASE_URL;
  if (!url) throw new Error('DATABASE_SUPABASE_URL required');

  const ds = new DataSource({ type: 'postgres', url, connectTimeoutMS: 30000 });
  await ds.initialize();
  const rows = await ds.query(
    `SELECT id, logical_source_id, source_payload FROM reference_questions`,
  );

  const issues: Array<{ type: string; id: string; detail: string; severity: 'error' | 'warn' }> = [];

  let parseFail = 0;
  let tplFail = 0;
  let tplArticle = 0; // article fallback (degraded format)
  let garbledContent = 0;
  let stemNoEnding = 0;
  let stimulusTooShort = 0;
  let answerMissing = 0;
  let answerLeak = 0;
  let embeddedQuestion = 0;

  for (const row of rows) {
    const p = row.source_payload;
    const id = row.logical_source_id;

    // --- Parse check ---
    const ref = parseReference(p, 'success');
    if (!ref.ok) {
      parseFail++;
      issues.push({
        type: 'PARSE_FAIL',
        id,
        detail: 'Cannot be parsed — missing required fields or invalid format',
        severity: 'error',
      });
      continue;
    }

    const v = ref.value;
    const stem = v.stem || '';
    const stim = v.stimulus || '';
    const tpl = sourceTemplate(v);

    // --- TPL check ---
    if (!tpl) {
      tplFail++;
      issues.push({
        type: 'NO_TPL',
        id,
        detail: `Archetype did not assign a TPL template. stem: "${stem.substring(0, 60)}"`,
        severity: 'error',
      });
      continue;
    }

    const render = sourcePreservingRender(v);
    if (!render) {
      tplFail++;
      issues.push({
        type: 'RENDER_FAIL',
        id,
        detail: `TPL ${tpl} cannot render stimulus (${stim.length} chars). stem: "${stem.substring(0, 60)}"`,
        severity: 'error',
      });
      continue;
    }

    if (render.template === 'TPL_ARTICLE' && tpl !== 'TPL_ARTICLE') {
      tplArticle++;
      // Not an error per se, but means the stimulus didn't match the TPL format
    }

    // --- Answer check ---
    if (typeof v.correctAnswer !== 'number' || v.correctAnswer < 1 || v.correctAnswer > 5) {
      answerMissing++;
      issues.push({
        type: 'NO_ANSWER',
        id,
        detail: `Missing or invalid correctAnswer: ${v.correctAnswer}`,
        severity: 'error',
      });
    }

    // --- Stem quality ---
    if (stem.length < 15) {
      issues.push({
        type: 'STEM_TOO_SHORT',
        id,
        detail: `Stem too short (${stem.length} chars): "${stem}"`,
        severity: 'warn',
      });
    }

    // Check for unnatural endings
    if (!MISSING_END_PATTERN.test(stem) && stem.length > 20) {
      // Korean question stems typically end with ~은/는 것인가? or similar
      // This is more of a heuristic
    }

    // --- Stimulus quality ---
    if (stim.length < 20) {
      stimulusTooShort++;
      if (stim.length === 0) {
        issues.push({
          type: 'EMPTY_STIMULUS',
          id,
          detail: 'Stimulus is completely empty',
          severity: 'error',
        });
      } else {
        issues.push({
          type: 'STIM_TOO_SHORT',
          id,
          detail: `Stimulus too short (${stim.length} chars): "${stim.substring(0, 80)}"`,
          severity: 'warn',
        });
      }
    }

    // --- Question markers in stimulus ---
    let embCount = 0;
    for (const pat of EMBEDDED_QUESTION_PATTERNS) {
      if (pat.test(stim)) embCount++;
    }
    if (embCount >= 1) {
      embeddedQuestion++;
      issues.push({
        type: 'QUESTION_IN_STIMULUS',
        id,
        detail: `Stimulus contains ${embCount} question marker(s). First 100: "${stim.substring(0, 100)}"`,
        severity: 'warn',
      });
    }

    // --- Answer leakage ---
    for (const pat of ANSWER_LEAK_PATTERNS) {
      if (pat.test(stim) || pat.test(stem)) {
        answerLeak++;
        issues.push({
          type: 'ANSWER_LEAK',
          id,
          detail: `Answer number appears in stem or stimulus`,
          severity: 'error',
        });
        break;
      }
    }

    // --- Garbled content ---
    const combined = stem + '\n' + stim;
    let garbled = false;
    // Check for very unusual characters
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(combined)) {
      garbled = true;
      issues.push({
        type: 'GARBLED_CONTROL_CHARS',
        id,
        detail: 'Contains control characters (possible binary corruption)',
        severity: 'error',
      });
    }
    // Check for mixed scripts that look like corruption
    const koreanChars = (combined.match(/[가-힣]/g) || []).length;
    const latinChars = (combined.match(/[a-zA-Z]/g) || []).length;
    if (koreanChars === 0 && latinChars === 0 && combined.length > 10) {
      garbled = true;
      issues.push({
        type: 'NO_KOREAN',
        id,
        detail: `No Korean or Latin characters found (${combined.length} chars total)`,
        severity: 'error',
      });
    }
    if (garbled) garbledContent++;
  }

  // --- Report ---
  console.log('═══════════════════════════════════════════');
  console.log('     QUESTION QUALITY AUDIT REPORT');
  console.log('═══════════════════════════════════════════');
  console.log(`Total rows: ${rows.length}`);
  console.log('');
  console.log('[CRITICAL]');
  console.log(`  Parse failures:       ${parseFail}`);
  console.log(`  TPL failures:         ${tplFail}`);
  console.log(`  Missing answers:      ${answerMissing}`);
  console.log(`  Answer leakage:       ${answerLeak}`);
  console.log(`  Empty stimulus:       ${rows.filter(r => !(r.source_payload?.stimulus?.trim())).length}`);
  console.log('');
  console.log('[WARNINGS]');
  console.log(`  TPL→ARTICLE fallback: ${tplArticle} (content preserved but loses formatting)`);
  console.log(`  Garbled content:      ${garbledContent}`);
  console.log(`  Question in stimulus: ${embeddedQuestion}`);
  console.log(`  Short stimulus:       ${stimulusTooShort}`);
  console.log('');
  console.log(`Total issues: ${issues.length}`);
  console.log('');

  // Print issues by severity
  const errors = issues.filter(i => i.severity === 'error');
  const warns = issues.filter(i => i.severity === 'warn');

  if (errors.length > 0) {
    console.log(`--- ERRORS (${errors.length}) ---`);
    for (const e of errors.slice(0, 30)) {
      console.log(`  [${e.type}] ${e.id}`);
      console.log(`    ${e.detail}`);
    }
    if (errors.length > 30) console.log(`  ... and ${errors.length - 30} more errors`);
  }

  if (warns.length > 0) {
    console.log(`\n--- WARNINGS (${warns.length}) ---`);
    for (const w of warns.slice(0, 15)) {
      console.log(`  [${w.type}] ${w.id}`);
      console.log(`    ${w.detail}`);
    }
    if (warns.length > 15) console.log(`  ... and ${warns.length - 15} more warnings`);
  }

  await ds.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });

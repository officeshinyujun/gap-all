const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/yjshin/projects/product/gap/backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SUCCESS_DIR = '/Users/yjshin/projects/product/gap/textbook/success_cards_moi';
const KONGIL_DIR = '/Users/yjshin/projects/product/gap/textbook/kongil_cards_moi';

function trimName(name) {
  return name.replace(/\(.*\)/, '').trim();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getDisplayName(name) {
  let n = name.replace(/\s*\(.*?\)\s*/g, '').trim();
  n = n.replace(/^[•\-\*\s]+/, '').replace(/[\s•\-\*]+$/, '');
  return n;
}

function createBlankQuestions(concepts) {
  const names = concepts.map(c => getDisplayName(c.name));
  const nameSet = new Set(names);
  
  const questions = [];
  const usedNames = new Set();
  const conceptsByDisplayName = {};
  
  for (const c of concepts) {
    const dn = getDisplayName(c.name);
    if (!conceptsByDisplayName[dn]) {
      conceptsByDisplayName[dn] = c;
    }
  }

  for (const concept of concepts) {
    if (questions.length >= 10) break;

    const conceptName = getDisplayName(concept.name);
    if (usedNames.has(conceptName)) continue;
    if (!conceptName || conceptName.length < 2) continue;

    const definition = (concept.card && concept.card.definition) || '';
    const enrichedDef = (concept.card && concept.card.enrichedDefinition) || '';
    const keyPoints = (concept.card && concept.card.keyPoints) || [];
    const explanation = definition || enrichedDef || (keyPoints.length > 0 ? keyPoints[0] : concept.name);
    const searchText = `${definition} ${enrichedDef}`;

    let sentenceTemplate = '';

    if (searchText.includes(conceptName)) {
      sentenceTemplate = (definition || enrichedDef).replace(new RegExp(conceptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[blank]');
      if (!sentenceTemplate || !sentenceTemplate.includes('[blank]')) {
        sentenceTemplate = `[blank]은/는 ${definition || enrichedDef || keyPoints[0] || ''}`;
      }
    } else if (concept.name !== conceptName && searchText.includes(concept.name)) {
      sentenceTemplate = (definition || enrichedDef).replace(new RegExp(concept.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '[blank]');
      if (!sentenceTemplate || !sentenceTemplate.includes('[blank]')) {
        sentenceTemplate = `[blank]은/는 ${definition || enrichedDef || keyPoints[0] || ''}`;
      }
    } else if (definition) {
      sentenceTemplate = `[blank]은/는 ${definition}`;
    } else if (keyPoints.length > 0) {
      sentenceTemplate = `[blank]은/는 ${keyPoints[0]}`;
    } else {
      sentenceTemplate = `[blank]은/는 ${concept.name}에 관한 개념이다`;
    }

    if (!sentenceTemplate.includes('[blank]')) {
      sentenceTemplate = `[blank]은/는 ${definition || keyPoints[0] || concept.name}`;
    }

    // Also check that the original conceptName (full) doesn't remain
    // If conceptName appears as-is in the template, it could serve as a hint
    // But we only care about [blank] presence for now

    const otherNames = names.filter(n => n !== conceptName && n.length >= 2);
    const shuffledOthers = shuffle(otherNames);
    const distractorCount = Math.min(3, shuffledOthers.length);
    
    if (distractorCount < 3 && distractorCount < otherNames.length) {
      // Not enough unique names but still try
    }
    if (distractorCount < 1) continue;

    const distractors = shuffledOthers.slice(0, distractorCount);
    const options = shuffle([conceptName, ...distractors]);

    questions.push({
      id: questions.length + 1,
      sentence_template: sentenceTemplate,
      correct_answer: conceptName,
      options: options,
      explanation: explanation
    });

    usedNames.add(conceptName);
  }

  return questions;
}

function getUnitNumber(filename) {
  const match = filename.match(/(\d+)단원/);
  return match ? parseInt(match[1]) : null;
}

async function processDirectory(dir, subject) {
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && /^\d+단원\.json$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/^(\d+)/)[1]);
      const nb = parseInt(b.match(/^(\d+)/)[1]);
      return na - nb;
    });
  
  let totalQuestions = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const unitNumber = data.unit || getUnitNumber(file);
    const concepts = data.concepts || [];

    if (!unitNumber || concepts.length === 0) {
      console.log(`  SKIP ${file}: unit=${unitNumber}, concepts=${concepts.length}`);
      continue;
    }

    const questions = createBlankQuestions(concepts, unitNumber);
    
    if (questions.length === 0) {
      console.log(`  SKIP ${file}: no questions generated`);
      continue;
    }

    // Validate
    let allValid = true;
    const errors = [];
    for (const q of questions) {
      if (!q.sentence_template.includes('[blank]')) {
        errors.push(`Q${q.id}: missing [blank]`);
        allValid = false;
      }
      if (!q.options.includes(q.correct_answer)) {
        errors.push(`Q${q.id}: correct_answer "${q.correct_answer}" not in options [${q.options.join(', ')}]`);
        allValid = false;
      }
      const uniqueOpts = new Set(q.options);
      if (uniqueOpts.size !== 4) {
        errors.push(`Q${q.id}: options not unique (${uniqueOpts.size})`);
        allValid = false;
      }
    }

    if (!allValid) {
      console.log(`  VALIDATION FAILED for ${subject} unit ${unitNumber}:`);
      errors.forEach(e => console.log(`    ${e}`));
      continue;
    }

    // Delete existing rows, then insert
    const { error: delErr } = await supabase
      .from('quiz_cache')
      .delete()
      .eq('subject', subject)
      .eq('unit_number', unitNumber)
      .eq('cache_type', 'blank');

    if (delErr) {
      console.error(`  DELETE ERROR for ${subject} unit ${unitNumber}: ${delErr.message}`);
      continue;
    }

    const { error: insErr } = await supabase
      .from('quiz_cache')
      .insert({
        subject: subject,
        unit_number: unitNumber,
        cache_type: 'blank',
        quiz_count: questions.length,
        data: questions
      });

    if (insErr) {
      console.error(`  INSERT ERROR for ${subject} unit ${unitNumber}: ${insErr.message}`);
      continue;
    }

    totalQuestions += questions.length;
    console.log(`  ${subject} ${unitNumber}단원: ${questions.length} questions ✓`);
  }

  return totalQuestions;
}

async function main() {
  console.log('=== Generating Blank-Fill Quizzes ===\n');

  // Delete ALL existing blank quiz data first
  console.log('Clearing existing blank quizzes...');
  const { error: clearErr } = await supabase
    .from('quiz_cache')
    .delete()
    .eq('cache_type', 'blank');
  if (clearErr) {
    console.error(`Clear error: ${clearErr.message}`);
  } else {
    console.log('Cleared all existing blank quizzes.');
  }

  console.log('\n--- 성공적인 직업생활 (sungjik) ---');
  const sungjikTotal = await processDirectory(SUCCESS_DIR, 'sungjik');
  
  console.log('\n--- 공업 일반 (kongil) ---');
  const kongilTotal = await processDirectory(KONGIL_DIR, 'kongil');

  const grandTotal = sungjikTotal + kongilTotal;
  console.log(`\n=== TOTAL: ${grandTotal} questions across 40 units ===`);

  // Verify first 3 questions from unit 1
  console.log('\n=== Verification: Unit 1 ===');
  for (const { subject } of [
    { subject: 'sungjik' },
    { subject: 'kongil' }
  ]) {
    const { data, error } = await supabase
      .from('quiz_cache')
      .select('data')
      .eq('subject', subject)
      .eq('unit_number', 1)
      .eq('cache_type', 'blank')
      .single();

    if (error) {
      console.log(`  ${subject} unit 1: ERROR - ${error.message}`);
      continue;
    }
    if (data && data.data) {
      const qs = data.data;
      console.log(`\n[${subject}] unit 1: ${qs.length} questions`);
      for (let i = 0; i < Math.min(3, qs.length); i++) {
        const q = qs[i];
        console.log(`  Q${q.id}: [blank]=${q.sentence_template.includes('[blank]')}, correct="${q.correct_answer}", opts=${q.options.length}, unique=${new Set(q.options).size}`);
        console.log(`    ${q.sentence_template.substring(0, 100)}...`);
      }
    }
  }

  console.log('\n=== DONE ===');
}

main().catch(console.error);

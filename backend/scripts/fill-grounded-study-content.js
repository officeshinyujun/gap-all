const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', 'textbook', '_v2', 'study-rebuild');

for (const subject of ['success', 'industry']) {
  for (let unit = 1; unit <= 20; unit += 1) {
    const file = path.join(ROOT, subject, `unit-${String(unit).padStart(2, '0')}.json`);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    let changed = 0;
    for (const card of data.cards) {
      const evidence = card.conceptContent || {};
      const sections = (evidence.structuredEvidence || []).flatMap((section) => [section, ...(section.subsections || [])]);
      const points = [...new Set(sections.flatMap((section) => section.keyPoints || []).filter(Boolean))];
      const summary = sections.map((section) => section.summary || section.explanation).find(Boolean);
      const excerpt = evidence.rawEvidence?.map((item) => item.lines).filter(Boolean).join('\n\n');
      if (card.contentStatus !== 'needs_review' || (!summary && !points.length && !excerpt)) continue;

      // ponytail: reuse grounded evidence instead of inventing another content-generation layer.
      card.description ||= summary || excerpt;
      card.keyPoints = card.keyPoints?.length ? card.keyPoints : points.slice(0, 8);
      evidence.definition ||= summary || excerpt;
      evidence.enrichedDefinition ||= summary || excerpt;
      evidence.textbookExcerpt ||= excerpt || summary;
      card.conceptContent = evidence;
      card.validationErrors = (card.validationErrors || []).filter((error) => !error.startsWith('missing source definition') && !error.startsWith('missing source keyPoints') && !error.startsWith('missing source excerpt') && !error.startsWith('missing matched structured/raw evidence'));
      if (!card.description || !card.conceptContent.definition) card.validationErrors.push('근거 데이터가 충분하지 않아 개념 내용 검수 필요');
      if (!card.sampleQuestion || !card.problemApplication) card.validationErrors.push('실제 문제 적용 데이터 검수 필요');
      changed += 1;
    }
    if (changed) {
      const temp = `${file}.tmp-${process.pid}`;
      fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`);
      JSON.parse(fs.readFileSync(temp, 'utf8'));
      fs.renameSync(temp, file);
      console.log(`${subject} unit-${String(unit).padStart(2, '0')}: ${changed} cards grounded`);
    }
  }
}

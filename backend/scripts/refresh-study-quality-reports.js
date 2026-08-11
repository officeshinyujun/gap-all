const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', 'textbook', '_v2', 'study-rebuild');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function report(subject) {
  const units = [];
  for (let unit = 1; unit <= 20; unit += 1) {
    const data = readJson(path.join(ROOT, subject, `unit-${String(unit).padStart(2, '0')}.json`));
    const cards = data.cards || [];
    const reviewCards = cards.filter((card) => card.contentStatus === 'needs_review');
    units.push({
      subject,
      unit: data.unit,
      unitName: data.unitName,
      tagCount: data.canonicalTags.length,
      cardCount: cards.length,
      completeCards: cards.length - reviewCards.length,
      needsReviewCards: reviewCards.length,
      issues: reviewCards.flatMap((card) => (card.validationErrors || []).map((error) => ({ card: card.name, error }))),
    });
  }
  return { subject, generatedAt: new Date().toISOString(), units };
}

for (const subject of ['success', 'industry']) {
  const target = path.join(ROOT, subject, 'quality-report.json');
  const temp = `${target}.tmp-${process.pid}`;
  const value = report(subject);
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  readJson(temp);
  fs.renameSync(temp, target);
  const cards = value.units.reduce((sum, unit) => sum + unit.cardCount, 0);
  const review = value.units.reduce((sum, unit) => sum + unit.needsReviewCards, 0);
  console.log(JSON.stringify({ subject, units: value.units.length, cards, completeCards: cards - review, needsReviewCards: review }));
}

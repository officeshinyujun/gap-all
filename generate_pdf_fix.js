const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = '/Users/yjshin/projects/gap/textbook/pdf';

async function captureConceptCard(page, subject, unitNum, conceptIndex) {
  const url = `${BASE_URL}/study/${subject}/unit-${unitNum}/concept`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const tabs = await page.$$('button');
  for (const tab of tabs) {
    const text = await tab.textContent();
    if (text && text.includes('카드')) {
      await tab.click();
      await page.waitForTimeout(500);
      break;
    }
  }

  for (let i = 0; i < conceptIndex; i++) {
    const nextBtns = await page.$$('button');
    for (const btn of nextBtns) {
      const text = await btn.textContent();
      if (text && text.includes('다음')) {
        await btn.click();
        await page.waitForTimeout(300);
        break;
      }
    }
  }
  await page.waitForTimeout(500);

  const slideArea = await page.$('[class*="slideArea"]');
  if (slideArea) return await slideArea.screenshot({ type: 'png' });
  return await page.screenshot({ type: 'png', fullPage: false });
}

async function generatePDF(subjectSlug, subjectFolder, subjectName, unitNum, conceptCount) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  const screenshots = [];

  for (let i = 0; i < conceptCount; i++) {
    console.log(`  Capturing ${subjectName} ${unitNum}단원 concept ${i + 1}/${conceptCount}`);
    try {
      const shot = await captureConceptCard(page, subjectSlug, unitNum, i);
      screenshots.push(shot);
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
    }
  }
  await browser.close();

  if (screenshots.length === 0) return;

  // Convert screenshots to base64 and embed directly in HTML
  const browser2 = await chromium.launch({ headless: true });
  const page2 = await browser2.newPage();

  let html = `<html><head><style>
    @page { size: A4; margin: 20px; }
    body { margin: 0; padding: 0; font-family: 'Noto Sans KR', sans-serif; }
    .page { page-break-after: always; display: flex; flex-direction: column; gap: 10px; padding: 20px; height: calc(297mm - 40px); box-sizing: border-box; }
    .page:last-child { page-break-after: auto; }
    .card { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .card img { width: 100%; height: auto; max-height: 100%; object-fit: contain; }
    .title { text-align: center; font-size: 12px; color: #666; margin: 4px 0; }
  </style></head><body>`;

  for (let i = 0; i < screenshots.length; i += 2) {
    html += '<div class="page">';
    html += `<div class="title">${subjectName} ${unitNum}단원 - 개념 ${i + 1}</div>`;
    const b64_1 = screenshots[i].toString('base64');
    html += `<div class="card"><img src="data:image/png;base64,${b64_1}" /></div>`;
    if (i + 1 < screenshots.length) {
      html += `<div class="title">${subjectName} ${unitNum}단원 - 개념 ${i + 2}</div>`;
      const b64_2 = screenshots[i + 1].toString('base64');
      html += `<div class="card"><img src="data:image/png;base64,${b64_2}" /></div>`;
    }
    html += '</div>';
  }
  html += '</body></html>';

  await page2.setContent(html, { waitUntil: 'load' });
  await page2.waitForTimeout(1000);

  const pdfPath = path.join(OUTPUT_DIR, `${subjectFolder}_${unitNum}단원.pdf`);
  await page2.pdf({ path: pdfPath, format: 'A4', printBackground: true });
  console.log(`  ✓ ${pdfPath}`);
  await browser2.close();
}

async function main() {
  // Test with kongil 1단원 only
  const jsonPath = '/Users/yjshin/projects/gap/textbook/kongil_frequency/1단원.json';
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`공일 1단원 (${data.concepts.length} concepts)`);
  await generatePDF('industry', 'kongil', '공일', 1, data.concepts.length);
  console.log('Done!');
}

main().catch(console.error);

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const GRAPH_KEYWORDS = ['그림', '그래프', '차트', '도표', '사진', '이미지'];

function hasGraph(stem: string, stimulus: string, views: string[]): boolean {
  return GRAPH_KEYWORDS.some(kw => (stem + ' ' + stimulus + ' ' + views.join(' ')).includes(kw));
}

async function extractAllPages(pdfPath: string): Promise<string> {
  const tmpDir = `/tmp/pdf_vision_${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  execSync(`pdftoppm -png -r 200 "${pdfPath}" "${tmpDir}/page"`, { timeout: 60000 });

  const pageFiles = fs.readdirSync(tmpDir)
    .filter(f => f.endsWith('.png'))
    .sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0));

  if (pageFiles.length === 0) { fs.rmSync(tmpDir, { recursive: true, force: true }); return ''; }

  const content: any[] = [{
    type: 'text' as const,
    text: 'This is a Korean CSAT exam PDF. Find and extract ALL visual/graphical content: graphs, charts, tables, diagrams, images. For each one, describe in complete detail: ALL data points, labels, numbers, axes, relationships. If a table, preserve EVERY cell value. Return ONLY the extracted data as text, grouped by page. Do NOT describe non-visual text content. If no visual content exists, return "NONE".'
  }];

  for (const pf of pageFiles) {
    const b64 = fs.readFileSync(path.join(tmpDir, pf)).toString('base64');
    content.push({ type: 'image_url' as const, image_url: { url: `data:image/png;base64,${b64}`, detail: 'low' } });
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content }],
    temperature: 0,
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return response.choices[0]?.message?.content || '';
}

async function main() {
  const baseDir = '/Users/yjshin/projects/gap/textbook/parsed';

  for (const subject of ['sungjik', 'kongil']) {
    const suteckDir = path.join(baseDir, subject, 'suteck');
    const pdfPrefix = subject === 'sungjik' ? '성직' : '공일';

    for (let unit = 1; unit <= 20; unit++) {
      const fp = path.join(suteckDir, `${unit}단원.json`);
      if (!fs.existsSync(fp)) continue;

      const questions = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      const targets = questions.filter((q: any) => hasGraph(q.stem || '', q.stimulus || '', q.viewItems || []));

      if (targets.length === 0) continue;

      const pdfPath = `/Users/yjshin/projects/gap/question/suteck/${pdfPrefix}_${unit}단원_문제.pdf`;
      if (!fs.existsSync(pdfPath)) continue;

      process.stdout.write(`${subject} ${unit}단원 (${targets.length}개 그래프)... `);

      const visionData = await extractAllPages(pdfPath);
      if (!visionData || visionData === 'NONE') {
        console.log('시각 데이터 없음');
        continue;
      }

      for (const q of targets) {
        q.stimulus += '\n\n[그래프/표 데이터]\n' + visionData;
      }

      fs.writeFileSync(fp, JSON.stringify(questions, null, 2));
      console.log('보강 완료');
    }
  }

  console.log('\n✅ ALL DONE');
}

main().catch(console.error);

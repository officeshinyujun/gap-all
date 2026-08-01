import * as fs from 'fs';
import * as path from 'path';

const TEXTBOOK_BASE = path.resolve(__dirname, '..', '..', 'textbook');

function stimulusDataToPlainText(sd: any): string {
  if (!sd) return '';
  if (typeof sd === 'string') return sd;
  if (sd.content && typeof sd.content === 'string') return sd.content;
  if (sd.instructor?.dialogue) {
    const items = (sd.canvas_content?.items || []).map((it: any) => it.text || '').join('\n');
    const rows = sd.canvas_content?.rows || [];
    const headers = sd.canvas_content?.headers || [];
    const rowText = rows.length > 0
      ? '\n' + headers.join(' | ') + '\n' + rows.map((r: any) => (Array.isArray(r) ? r.join(' | ') : '')).join('\n')
      : '';
    return sd.instructor.dialogue + '\n' + items + rowText;
  }
  if (sd.messages) return sd.messages.map((m: any) => m.text || '').join('\n');
  if (sd.paragraphs) return sd.paragraphs.map((p: any) => (typeof p === 'string' ? p : p.text || '')).join('\n');
  if (sd.rows) {
    const h = (sd.headers || []).join(' | ');
    const r = (sd.rows || []).map((row: any) => (Array.isArray(row) ? row.join(' | ') : '')).join('\n');
    return h + '\n' + r;
  }
  return '';
}

const folders = ['success_cards_moi', 'kongil_cards_moi'];

for (const folder of folders) {
  const dirPath = path.join(TEXTBOOK_BASE, folder);
  if (!fs.existsSync(dirPath)) continue;

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  let filled = 0;

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let modified = false;

    for (const c of data.concepts || []) {
      const qd = c.realQuestion?.questionData;
      if (!qd) continue;

      const existingStimulus = qd.stimulus || qd.rawStimulus || '';
      if (existingStimulus.trim()) continue; // already has plain text

      const sd = qd.render_ready?.stimulus_data;
      if (!sd) continue;

      const plain = stimulusDataToPlainText(sd);
      if (!plain.trim()) continue;

      qd.stimulus = plain;
      qd.rawStimulus = plain;
      modified = true;
      filled++;
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`  ${folder}/${file}: 백필 완료`);
    }
  }

  console.log(`${folder}: ${filled}개 백필`);
}

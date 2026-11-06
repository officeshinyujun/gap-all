import { NextResponse } from 'next/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

// 원문 인증 결과(artifacts/reference-certification-v2.json)를 읽어 감사 화면에 넘긴다.
// 인증 스크립트가 남긴 파일을 그대로 읽으므로, 별도 DB 조회가 없다.

const ARTIFACT = path.join(process.cwd(), '..', 'artifacts', 'reference-certification-v2.json');

type Blocked = { sourceKey: string; questionNumber: number; reasons: string[] };

function parseKey(key: string) {
  // 예) kongil:2021:6월_모의평가:03 직업탐구영역_공업 일반_문제.pdf:9
  const parts = key.split(':');
  const [subject, year, exam] = parts;
  const file = parts.slice(3, -1).join(':');
  return {
    subject: subject === 'kongil' ? '공업 일반' : subject === 'success' ? '성공적인 직업생활' : subject,
    year,
    exam: (exam ?? '').replace(/_/g, ' '),
    file,
  };
}

export async function GET() {
  try {
    const raw = fs.readFileSync(ARTIFACT, 'utf8');
    const data = JSON.parse(raw) as {
      version?: string;
      counts: { total: number; certified: number; blocked: number };
      blocked: Blocked[];
    };

    const reasonCount: Record<string, number> = {};
    for (const b of data.blocked) {
      for (const r of b.reasons) reasonCount[r] = (reasonCount[r] ?? 0) + 1;
    }

    const items = data.blocked.map((b) => ({ ...b, ...parseKey(b.sourceKey) }));

    return NextResponse.json({
      version: data.version ?? null,
      counts: data.counts,
      reasonCount,
      totalReasons: Object.values(reasonCount).reduce((a, b) => a + b, 0),
      items,
      artifact: 'artifacts/reference-certification-v2.json',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '인증 결과 파일을 읽지 못했습니다.' },
      { status: 500 },
    );
  }
}

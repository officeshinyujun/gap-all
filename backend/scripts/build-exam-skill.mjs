#!/usr/bin/env node
/**
 * 출제 엔진(결정론적 부분)을 에이전트 스킬 폴더로 빌드한다.
 *   out: <repo>/.claude/skills/exam-question-generator/scripts/engine
 * 엔진은 Node 18+ 표준 라이브러리만 쓴다(DB·Nest·OpenAI 의존이 섞이면 빌드를 실패시킨다).
 * 빌드는 옆 폴더(engine.next)에 한 뒤 이름만 바꿔 교체한다: 출제 에이전트가 check를 돌리는 중에 다시 빌드해도
 * 엔진 폴더가 비는 순간이 없다(예전에는 출제 중인 에이전트가 모두 끝날 때까지 기다려야 했다).
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(backend, '..', '.claude', 'skills', 'exam-question-generator');
const liveDir = join(skillDir, 'scripts', 'engine');
const engineDir = `${liveDir}.next`;
const oldDir = `${liveDir}.old`;

rmSync(engineDir, { recursive: true, force: true });
rmSync(oldDir, { recursive: true, force: true });
execFileSync(join(backend, 'node_modules', '.bin', 'tsc'), ['-p', join(backend, 'tsconfig.skill.json'), '--outDir', engineDir], { stdio: 'inherit' });

const dataSource = join(backend, 'src', 'exams', 'generative', 'data');
const dataTarget = join(engineDir, 'exams', 'generative', 'data');
mkdirSync(dataTarget, { recursive: true });
cpSync(dataSource, dataTarget, { recursive: true });

const forbidden = /require\("(typeorm|@nestjs\/[^"]+|openai|pg|class-validator|class-transformer)"\)/u;
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.js')) files.push(path);
  }
};
walk(engineDir);
const offenders = files.filter((file) => forbidden.test(readFileSync(file, 'utf8')));
if (offenders.length > 0) {
  console.error('엔진 번들에 서버 의존이 섞였습니다:', offenders.map((file) => relative(engineDir, file)));
  process.exit(1);
}
if (!existsSync(join(engineDir, 'exams', 'generative', 'skill', 'skill-engine.js'))) {
  console.error('skill-engine.js가 생성되지 않았습니다.');
  process.exit(1);
}
writeFileSync(join(engineDir, 'BUILD.json'), `${JSON.stringify({ builtAt: new Date().toISOString(), files: files.length }, null, 2)}\n`);
// 교체: 이름 바꾸기 두 번이라 엔진이 없는 시간은 사실상 없다.
if (existsSync(liveDir)) renameSync(liveDir, oldDir);
renameSync(engineDir, liveDir);
rmSync(oldDir, { recursive: true, force: true });
console.log(`built ${files.length} engine files → ${relative(join(backend, '..'), liveDir)}`);

// Claude.ai·API에 올릴 수 있는 zip(스킬 폴더 통째). zip 명령이 없으면 건너뛴다.
const zipDir = join(backend, 'dist-skill');
const zipFile = join(zipDir, 'exam-question-generator.zip');
mkdirSync(zipDir, { recursive: true });
rmSync(zipFile, { force: true });
try {
  execFileSync('zip', ['-qr', zipFile, 'exam-question-generator', '-x', '*.DS_Store'], { cwd: dirname(skillDir), stdio: 'inherit' });
  console.log(`packed → ${relative(join(backend, '..'), zipFile)}`);
} catch {
  console.log('zip 명령이 없어 패키징을 건너뜁니다(스킬 폴더를 그대로 복사해 쓰면 됩니다).');
}

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseOfficialAnswerKeyText } from '../src/exams/question-parser.service';

const ROOT = path.resolve(__dirname, '../..');
const PARSED_ROOT = path.join(ROOT, 'textbook', 'parsed');
const QUESTION_ROOT = path.join(ROOT, 'question', 'moi');
const SUBJECTS = ['sungjik', 'kongil'] as const;
const PARSED_DIRECTORIES = ['all', 'moi', 'moi_by_unit'] as const;
const write = process.argv.includes('--write');

type ParsedQuestion = Record<string, unknown> & {
  source?: Record<string, unknown>;
  questionNumber?: unknown;
  correctAnswer?: unknown;
};

type AnswerKey = ReadonlyMap<number, number>;

function main(): void {
  const answerKeys = loadAnswerKeys();
  let updatedQuestionCount = 0;
  let unresolvedMoiQuestionCount = 0;
  const updatedFiles: string[] = [];

  for (const subject of SUBJECTS) {
    for (const directory of PARSED_DIRECTORIES) {
      const parsedDirectory = path.join(PARSED_ROOT, subject, directory);
      if (!fs.existsSync(parsedDirectory)) continue;
      for (const name of fs.readdirSync(parsedDirectory).sort()) {
        if (!name.endsWith('.json')) continue;
        const filePath = path.join(parsedDirectory, name);
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
        if (!Array.isArray(parsed)) continue;
        let changed = false;
        for (const question of parsed) {
          if (!isParsedQuestion(question) || question.source?.type !== 'moi') {
            continue;
          }
          const answer = answerFor(question, answerKeys);
          if (answer === undefined) {
            unresolvedMoiQuestionCount += 1;
            continue;
          }
          if (question.correctAnswer !== answer) {
            question.correctAnswer = answer;
            updatedQuestionCount += 1;
            changed = true;
          }
        }
        if (!changed) continue;
        updatedFiles.push(path.relative(ROOT, filePath));
        if (write) {
          fs.writeFileSync(
            filePath,
            `${JSON.stringify(parsed, null, 2)}\n`,
            'utf8',
          );
        }
      }
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        mode: write ? 'write' : 'dry-run',
        answerKeyCount: answerKeys.size,
        updatedQuestionCount,
        unresolvedMoiQuestionCount,
        updatedFiles,
      },
      null,
      2,
    )}\n`,
  );
  if (!write && updatedQuestionCount > 0) process.exitCode = 2;
}

function loadAnswerKeys(): ReadonlyMap<string, AnswerKey> {
  const keys = new Map<string, AnswerKey>();
  for (const subject of SUBJECTS) {
    const subjectDirectory = path.join(QUESTION_ROOT, subject);
    if (!fs.existsSync(subjectDirectory)) continue;
    for (const year of fs.readdirSync(subjectDirectory).sort()) {
      const yearDirectory = path.join(subjectDirectory, year);
      if (!fs.statSync(yearDirectory).isDirectory()) continue;
      for (const examType of fs.readdirSync(yearDirectory).sort()) {
        const examDirectory = path.join(yearDirectory, examType);
        if (!fs.statSync(examDirectory).isDirectory()) continue;
        const answerFile = fs
          .readdirSync(examDirectory)
          .find((name) => name.includes('정답') && name.endsWith('.pdf'));
        if (answerFile === undefined) continue;
        const text = execFileSync(
          'pdftotext',
          ['-raw', path.join(examDirectory, answerFile), '-'],
          { encoding: 'utf8' },
        );
        keys.set(
          answerKeyId(subject, Number(year), examType.normalize('NFC')),
          parseOfficialAnswerKeyText(text),
        );
      }
    }
  }
  return keys;
}

function answerFor(
  question: ParsedQuestion,
  answerKeys: ReadonlyMap<string, AnswerKey>,
): number | undefined {
  const source = question.source;
  if (
    source === undefined ||
    typeof source.year !== 'number' ||
    typeof source.examType !== 'string' ||
    typeof question.questionNumber !== 'number'
  ) {
    return undefined;
  }
  return answerKeys
    .get(answerKeyId(String(source.subject), source.year, source.examType))
    ?.get(question.questionNumber);
}

function answerKeyId(subject: string, year: number, examType: string): string {
  return `${subject}:${year}:${examType}`;
}

function isParsedQuestion(value: unknown): value is ParsedQuestion {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

main();

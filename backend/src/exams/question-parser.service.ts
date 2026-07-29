import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getOpenAIClient } from '../lib/openai-keys';

export interface ParsedQuestionSource {
  type: 'suteck' | 'moi';
  subject: string;
  subjectKor: string;
  unitNumber?: number;
  year?: number;
  examType?: string;
  filename: string;
}

export interface ParsedQuestion {
  source: ParsedQuestionSource;
  questionNumber: number;
  stem: string;
  stimulus: string;
  viewItems: string[];
  choices: string[];
  correctAnswer: number | null;
  difficulty: string;
  targetConcepts: string[];
  hasStimulus: boolean;
}

export function parseOfficialAnswerKeyText(text: string): Map<number, number> {
  const answers = new Map<number, number>();
  const numeralToAnswer = new Map([
    ['①', 1],
    ['②', 2],
    ['③', 3],
    ['④', 4],
    ['⑤', 5],
  ]);

  // Evaluation-service answer sheets place several `question answer score`
  // triplets on one line, not one answer per line.
  for (const match of text.matchAll(
    /(?:^|\s)([1-9]|1\d|20)\s+([①②③④⑤])\s+\d+(?=\s|$)/gu,
  )) {
    const questionNumber = Number(match[1]);
    const answer = numeralToAnswer.get(match[2] ?? '');
    if (answer !== undefined) answers.set(questionNumber, answer);
  }

  // Retain support for compact one-answer-per-line keys without scores.
  for (const line of text.split('\n')) {
    const match = line.trim().match(/^(\d{1,2})\s*[.．]?\s*([①②③④⑤])$/u);
    if (match === null) continue;
    const questionNumber = Number(match[1]);
    const answer = numeralToAnswer.get(match[2] ?? '');
    if (answer !== undefined) answers.set(questionNumber, answer);
  }
  return answers;
}

@Injectable()
export class QuestionParserService {
  private readonly logger = new Logger(QuestionParserService.name);
  private readonly PARSED_DIR = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'textbook',
    'parsed',
  );

  async parseSuteckPdf(
    filePath: string,
    subject: string,
    subjectKor: string,
    unitNumber: number,
  ): Promise<ParsedQuestion[]> {
    this.logger.log('Parsing suteck PDF: ' + filePath);
    const rawText = this.extractText(filePath);

    // Single LLM call — send full text, get all questions
    const response = await getOpenAIClient().chat.completions.create({
      model: process.env.OPENAI_STEP1_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'Extract all Korean CSAT exam questions from PDF text. Return JSON array of {questionNumber, stem, stimulus, viewItems, choices, hasStimulus, targetConcepts}. Ignore markers, annotations, and answer keys.',
        },
        {
          role: 'user',
          content:
            'Extract all questions from this Korean CSAT PDF text. Return JSON array with ALL questions:\n\n' +
            rawText.slice(0, 15000),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    let parsedQuestions: any[] = [];
    try {
      const parsed = JSON.parse(content);
      parsedQuestions =
        parsed.questions ||
        parsed.items ||
        (Array.isArray(parsed) ? parsed : [parsed]);
      if (!Array.isArray(parsedQuestions)) parsedQuestions = [parsedQuestions];
    } catch {
      this.logger.warn('Failed to parse LLM response');
      return [];
    }

    const results: ParsedQuestion[] = [];
    for (const q of parsedQuestions) {
      if (!q.questionNumber) continue;
      results.push({
        source: {
          type: 'suteck',
          subject,
          subjectKor,
          unitNumber,
          filename: path.basename(filePath),
        },
        questionNumber: q.questionNumber,
        stem: q.stem || '',
        stimulus: q.stimulus || '',
        viewItems: (q.viewItems || []).map((v: string) => v.trim()),
        choices: (q.choices || []).map((c: string) => c.trim()),
        correctAnswer: null,
        difficulty: 'MIDDLE',
        targetConcepts: q.targetConcepts || [],
        hasStimulus: q.hasStimulus ?? (q.stimulus && q.stimulus.length > 10),
      });
    }

    this.logger.log(
      'Parsed ' + results.length + ' questions from ' + path.basename(filePath),
    );
    return results;
  }

  async parseMoiPdf(
    filePath: string,
    answerPdfPath: string | null,
    subject: string,
    subjectKor: string,
    year: number,
    examType: string,
  ): Promise<ParsedQuestion[]> {
    this.logger.log('Parsing moi PDF: ' + filePath);
    const rawText = this.extractText(filePath);

    const response = await getOpenAIClient().chat.completions.create({
      model: process.env.OPENAI_STEP1_MODEL || 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'Extract all Korean CSAT exam questions from this PDF text. Return JSON array. Each question: {questionNumber, stem, stimulus, viewItems, choices, hasStimulus, targetConcepts}. Ignore markers and annotations.',
        },
        {
          role: 'user',
          content: 'Extract all questions:\n' + rawText.slice(0, 15000),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    let parsedQuestions: any[] = [];
    try {
      const parsed = JSON.parse(content);
      parsedQuestions =
        parsed.questions ||
        parsed.items ||
        (Array.isArray(parsed) ? parsed : [parsed]);
      if (!Array.isArray(parsedQuestions)) parsedQuestions = [parsedQuestions];
    } catch {
      return [];
    }

    const results: ParsedQuestion[] = [];
    for (const q of parsedQuestions) {
      if (!q.questionNumber) continue;
      results.push({
        source: {
          type: 'moi',
          subject,
          subjectKor,
          year,
          examType,
          filename: path.basename(filePath),
        },
        questionNumber: q.questionNumber,
        stem: q.stem || '',
        stimulus: q.stimulus || '',
        viewItems: (q.viewItems || []).map((v: string) => v.trim()),
        choices: (q.choices || []).map((c: string) => c.trim()),
        correctAnswer: null,
        difficulty: 'HIGH',
        targetConcepts: q.targetConcepts || [],
        hasStimulus: q.hasStimulus ?? (q.stimulus && q.stimulus.length > 10),
      });
    }

    if (answerPdfPath && fs.existsSync(answerPdfPath)) {
      const answers = this.parseAnswerPdf(answerPdfPath);
      for (const q of results) {
        if (answers.has(q.questionNumber)) {
          q.correctAnswer = answers.get(q.questionNumber)!;
        }
      }
    }

    this.logger.log('Parsed ' + results.length + ' questions from moi PDF');
    return results;
  }

  saveParsedQuestions(
    questions: ParsedQuestion[],
    subDir: string,
    filename: string,
  ): string {
    const dir = path.join(this.PARSED_DIR, subDir);
    fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, filename);
    fs.writeFileSync(outPath, JSON.stringify(questions, null, 2), 'utf-8');
    this.logger.log('Saved ' + questions.length + ' questions to ' + outPath);
    return outPath;
  }

  loadParsedQuestions(subDir: string, filename: string): ParsedQuestion[] {
    const fp = path.join(this.PARSED_DIR, subDir, filename);
    if (!fs.existsSync(fp)) return [];
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  }

  private extractText(filePath: string): string {
    return execSync('pdftotext -raw "' + filePath + '" - 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 30000,
    });
  }

  private parseAnswerPdf(answerPdfPath: string): Map<number, number> {
    return parseOfficialAnswerKeyText(this.extractText(answerPdfPath));
  }

  async parseAllSuteck(): Promise<void> {
    const baseDir = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'question',
      'suteck',
    );
    for (const subject of ['성직', '공일']) {
      const en = subject === '성직' ? 'sungjik' : 'kongil';
      const kor = subject === '성직' ? '성공적인 직업생활' : '공업 일반';
      for (let unit = 1; unit <= 20; unit++) {
        const fp = path.join(baseDir, subject + '_' + unit + '단원_문제.pdf');
        if (!fs.existsSync(fp)) continue;
        try {
          const questions = await this.parseSuteckPdf(fp, en, kor, unit);
          this.saveParsedQuestions(
            questions,
            en + '/suteck',
            unit + '단원.json',
          );
        } catch (e: any) {
          this.logger.error('Failed ' + fp + ': ' + e.message);
        }
      }
    }
  }

  async parseAllMoi(): Promise<void> {
    const baseDir = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'question',
      'moi',
    );
    const subjects: [string, string, string][] = [
      ['sungjik', 'sungjik', '성공적인 직업생활'],
      ['kongil', 'kongil', '공업 일반'],
    ];
    for (const [, en, kor] of subjects) {
      for (const year of [2021, 2022, 2023, 2024, 2025]) {
        for (const examType of ['6월_모의평가', '9월_모의평가', '수능']) {
          const dir = path.join(baseDir, en, String(year), examType);
          if (!fs.existsSync(dir)) continue;
          const probFile = fs
            .readdirSync(dir)
            .find((f) => f.endsWith('문제.pdf') || f.endsWith('문제지.pdf'));
          const ansFile = fs.readdirSync(dir).find((f) => f.includes('정답'));
          if (!probFile) continue;
          try {
            const questions = await this.parseMoiPdf(
              path.join(dir, probFile),
              ansFile ? path.join(dir, ansFile) : null,
              en,
              kor,
              year,
              examType,
            );
            this.saveParsedQuestions(
              questions,
              en + '/moi',
              year + '_' + examType + '.json',
            );
          } catch (e: any) {
            this.logger.error('Failed ' + probFile + ': ' + e.message);
          }
        }
      }
    }
  }
}

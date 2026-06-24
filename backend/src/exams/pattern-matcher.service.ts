import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface PatternSkeleton {
  itemFamily: string;
  stimulusTPL: string | null;
  blankCount: number;
  boCount: number;
  choiceType: string;
  choiceCount: number;
  hasComboBlock: boolean;
}

export interface QuestionPattern {
  assessmentIntent: string;
  judgmentAxis: string;
  skeletonStructure: PatternSkeleton;
  distractorBlueprint: string[];
  difficultyDriver: string;
  stemPattern: string;
}

export interface PatternEntry {
  conceptId: string;
  targetConcept: string;
  frequency: number;
  sourceExam: string;
  questionNumber: number;
  pattern: QuestionPattern;
}

export interface UnitPatterns {
  unit: number;
  unitTitle: string;
  subject: string;
  totalQuestions: number;
  patterns: PatternEntry[];
}

@Injectable()
export class PatternMatcherService {
  private readonly logger = new Logger(PatternMatcherService.name);
  private readonly patternsBasePath: string;
  private cache: Map<string, UnitPatterns> = new Map();

  constructor() {
    this.patternsBasePath =
      process.env.PATTERNS_BASE_PATH ??
      path.resolve(__dirname, '..', '..', '..', 'textbook', 'question-patterns');
  }

  private loadUnitPatterns(subjectSlug: string, unitNumber: number): UnitPatterns | null {
    const cacheKey = `${subjectSlug}_${unitNumber}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const folder = subjectSlug === 'success' ? 'success' : subjectSlug;
    const filePath = path.join(
      this.patternsBasePath,
      folder,
      `${unitNumber}단원.json`,
    );

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data: UnitPatterns = JSON.parse(raw);
      this.cache.set(cacheKey, data);
      return data;
    } catch (err) {
      this.logger.warn(`Failed to load pattern file: ${filePath}`);
      return null;
    }
  }

  findPatterns(
    subjectSlug: string,
    startUnit: number,
    endUnit: number,
    targetConcepts?: string[],
    maxPatterns: number = 4,
  ): PatternEntry[] {
    const allPatterns: PatternEntry[] = [];

    for (let unit = startUnit; unit <= endUnit; unit++) {
      const unitData = this.loadUnitPatterns(subjectSlug, unit);
      if (!unitData) continue;

      for (const entry of unitData.patterns) {
        if (
          targetConcepts &&
          targetConcepts.length > 0 &&
          !targetConcepts.some((tc) =>
            entry.targetConcept.includes(tc) || tc.includes(entry.targetConcept),
          )
        ) {
          continue;
        }
        allPatterns.push(entry);
      }
    }

    // Shuffle and pick up to maxPatterns for diversity
    const shuffled = [...allPatterns].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, maxPatterns);
  }

  formatPatternContext(
    subjectSlug: string,
    startUnit: number,
    endUnit: number,
    targetConcepts?: string[],
  ): string {
    const patterns = this.findPatterns(
      subjectSlug,
      startUnit,
      endUnit,
      targetConcepts,
    );

    if (patterns.length === 0) {
      return '';
    }

    const lines: string[] = [
      '# [참고: 해당 단원 실제 기출 패턴 분석]',
      '아래는 이 단원의 실제 기출문항들에서 추출한 패턴 정보이다.',
      '출제 의도, 판단 축, 문항 골격 구조는 반드시 따르되,',
      '구체적인 자료 내용과 문장은 완전히 새롭게 창작하라.',
      '기존 문제의 특정 표현, 수치, 사례명, 인물명을 재사용하지 마라.',
      '',
      JSON.stringify(
        patterns.map((p) => ({
          targetConcept: p.targetConcept,
          sourceExam: p.sourceExam,
          pattern: p.pattern,
        })),
        null,
        2,
      ),
      '',
      '# [패턴 활용 규칙]',
      '1. assessmentIntent(출제 의도)는 반드시 유지하라.',
      '2. judgmentAxis(판단 축)는 반드시 유지하라.',
      '3. skeletonStructure(골격 구조: itemFamily, blankCount, boCount, choiceType)는 반드시 유지하라.',
      '4. distractorBlueprint(오답 전략)은 동일한 방식을 사용하라.',
      '5. stimulusTPL(자료 형식)은 같거나 다른 것을 사용해도 무방하다.',
      '6. stemPattern(발문 패턴)은 참고만 하고, 구체적 표현은 다르게 구성하라.',
      '7. [금지] 구체적인 stimulus_data 내용, 수치, 이름, 장소를 기출문제와 동일하게 사용하지 마라.',
      '8. [금지] 실제 기출문제의 특정 문장을 그대로 또는 유사하게 재사용하지 마라.',
    ];

    return lines.join('\n');
  }

  /** 패턴 캐시 초기화 (메모리 절약용) */
  clearCache(): void {
    this.cache.clear();
  }
}

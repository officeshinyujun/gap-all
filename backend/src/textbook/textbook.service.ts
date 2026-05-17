import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface UnitPayload {
  unit_name: string;
  text_payload: string;
}

export interface UnitConcepts {
  unitName: string;
  concepts: string[];
}

export interface BlankQuestion {
  id: number;
  sentence_template: string;
  correct_answer: string;
  options: string[];
  explanation: string;
}

export interface ConceptPair {
  id: number;
  concept: string;
  definition: string;
  hidden_field: 'concept' | 'definition';
  correct_value: string;
  explanation: string;
}

// 과목 slug → 텍스트북 폴더명 매핑
const SUBJECT_FOLDER_MAP: Record<string, string> = {
  success: 'sungjik',
  industry: 'kongil',
};

@Injectable()
export class TextbookService {
  private readonly textbookBasePath: string;

  constructor() {
    this.textbookBasePath =
      process.env.TEXTBOOK_BASE_PATH ??
      path.resolve(__dirname, '..', '..', '..', 'textbook');
  }

  /**
   * concepts/ 폴더의 JSON 파일에서 단원별 핵심 개념 목록을 반환합니다.
   */
  getConcepts(
    subjectSlug: string,
    startUnit: number,
    endUnit: number,
  ): UnitConcepts[] {
    const folder = SUBJECT_FOLDER_MAP[subjectSlug];
    if (!folder) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }

    const result: UnitConcepts[] = [];

    for (let unitNum = startUnit; unitNum <= endUnit; unitNum++) {
      const paddedNum = String(unitNum).padStart(2, '0');
      const jsonPath = path.join(
        this.textbookBasePath,
        'concepts',
        folder,
        `Unit_${paddedNum}.json`,
      );

      if (!fs.existsSync(jsonPath)) {
        continue;
      }

      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const data: UnitConcepts = JSON.parse(raw);

      if (data.concepts.length > 0) {
        result.push(data);
      }
    }

    return result;
  }

  /**
   * 과목 slug와 단원 범위를 받아 텍스트 페이로드 배열을 반환합니다.
   */
  getUnits(
    subjectSlug: string,
    startUnit: number,
    endUnit: number,
  ): UnitPayload[] {
    const folder = SUBJECT_FOLDER_MAP[subjectSlug];
    if (!folder) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }

    const units: UnitPayload[] = [];

    for (let unitNum = startUnit; unitNum <= endUnit; unitNum++) {
      const paddedNum = String(unitNum).padStart(2, '0');
      const filePath = path.join(
        this.textbookBasePath,
        folder,
        `Unit_${paddedNum}.txt`,
      );

      if (!fs.existsSync(filePath)) {
        continue;
      }

      const text = fs.readFileSync(filePath, 'utf-8');
      units.push({
        unit_name: `${unitNum}단원`,
        text_payload: text,
      });
    }

    if (units.length === 0) {
      throw new NotFoundException(
        `${subjectSlug} 과목의 ${startUnit}~${endUnit}단원 텍스트를 찾을 수 없습니다.`,
      );
    }

    return units;
  }

  /**
   * summation MD 파일을 읽어 반환합니다. (AI 생성 서비스에서 사용)
   */
  getSummationMd(subjectSlug: string, unitNumber: number): string {
    const folder = SUBJECT_FOLDER_MAP[subjectSlug];
    if (!folder) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }

    const filePath = path.join(
      this.textbookBasePath,
      `${folder}_summation`,
      `${unitNumber}단원.md`,
    );

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(
        `${subjectSlug} 과목의 ${unitNumber}단원 summation 파일을 찾을 수 없습니다.`,
      );
    }

    return fs.readFileSync(filePath, 'utf-8');
  }
}

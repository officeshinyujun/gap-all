import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Difficulty } from '../entities/exam-record.entity';

// difficulty → 파일명 suffix 매핑
const DIFFICULTY_FILE_MAP: Record<Difficulty, string> = {
  [Difficulty.LOW]: 'middle',
  [Difficulty.MIDDLE]: 'high',
  [Difficulty.HIGH]: 'super',
  [Difficulty.INTERGRATE]: 'intergrate',
};

@Injectable()
export class PromptsService {
  private readonly promptsBasePath: string;

  constructor() {
    // gap/backend/ 기준으로 ../../prompts = gap/prompts/
    this.promptsBasePath =
      process.env.PROMPTS_BASE_PATH ??
      path.resolve(__dirname, '..', '..', '..', 'prompts');
  }

  /**
   * 모델 페르소나 (system message)를 반환합니다.
   */
  getPersona(): string {
    return '너는 EBS 수능특강 실전문항 집필 전문위원이다. 10년 이상 공업 일반(공일)과 성공적인 직업생활(성직) 과목의 문항을 집필해 왔으며, 실제 EBS 문제집의 톤과 구조를 정확히 재현하는 것이 너의 핵심 역량이다. 너의 목표는 교과서 텍스트를 바탕으로 코퍼스에 충실한 스타일의 문항을 설계하는 것이다. 교과 표준 용어는 자연스럽게 사용하되, 단순 정의 확인이 아닌 자료 해석과 개념 적용을 통해 정답에 도달하도록 설계한다. 공일은 산업현장·기술·보고서체로, 성직은 상담·생활상황·안내문체로 작성한다. 난이도는 어휘 난해화가 아니라 정보 분산, 유사 개념 변별, 다중 조건 적용 등 구조적 복잡성에서 만든다. 너의 모든 문항은 원문(text_payload)에 근거한 폐쇄적 논리 체계 안에서만 작동해야 한다.';
  }

  /**
   * Step 1 프롬프트를 반환합니다.
   * - questionCount == 1 → single/{difficulty}.txt
   * - questionCount >= 2 → multi/multi_{difficulty}.txt
   * 공통 부분(_shared/)을 플레이스홀더로 치환합니다.
   */
  getStep1Prompt(
    questionCount: number,
    difficulty: Difficulty,
    subjectSlug?: string,
  ): string {
    const diffSuffix = DIFFICULTY_FILE_MAP[difficulty];

    // INTERGRATE는 multi 전용 — single 요청 시 multi_intergrate 사용
    const filePath =
      questionCount === 1 && difficulty !== Difficulty.INTERGRATE
        ? path.join(
            this.promptsBasePath,
            'step1',
            'single',
            `single_${diffSuffix}.txt`,
          )
        : path.join(
            this.promptsBasePath,
            'step1',
            'multi',
            `multi_${diffSuffix}.txt`,
          );

    const template = this.readFile(filePath);
    const tplLibrary = this.readFile(
      path.join(this.promptsBasePath, '_shared', 'tpl_library.txt'),
    );
    const implRules = this.readFile(
      path.join(this.promptsBasePath, '_shared', 'implementation_rules.txt'),
    );

    let result = template
      .replace('{{TPL_LIBRARY}}', tplLibrary)
      .replace('{{IMPLEMENTATION_RULES}}', implRules);

    const outputContract = this.tryReadFile(
      path.join(this.promptsBasePath, '_shared', 'output_contract.txt'),
    );
    result = result.replace('{{OUTPUT_CONTRACT}}', outputContract);

    if (subjectSlug) {
      const subjectProfile = this.getSubjectProfile(subjectSlug);
      const distractorRules = this.getDistractorRules(subjectSlug);
      const stemPatterns = this.getStemPatterns(subjectSlug);

      result = result
        .replace('{{SUBJECT_PROFILE}}', subjectProfile)
        .replace('{{DISTRACTOR_RULES}}', distractorRules)
        .replace('{{STEM_PATTERNS}}', stemPatterns);
    } else {
      result = result
        .replace('{{SUBJECT_PROFILE}}', '')
        .replace('{{DISTRACTOR_RULES}}', '')
        .replace('{{STEM_PATTERNS}}', '');
    }

    return result;
  }

  /**
   * Step 2 프롬프트를 반환합니다.
   */
  getStep2Prompt(subjectSlug?: string): string {
    let filePath: string | undefined;

    if (subjectSlug) {
      const subjectSpecific = path.join(
        this.promptsBasePath,
        'step2',
        `${subjectSlug}.txt`,
      );
      if (fs.existsSync(subjectSpecific)) {
        filePath = subjectSpecific;
      }
    }

    if (!filePath) {
      filePath = path.join(this.promptsBasePath, 'step2', 'intergrate.txt');
    }

    return this.readFile(filePath);
  }

  getStep2PromotionalCanvasPrompt(): string {
    const filePath = path.join(
      this.promptsBasePath,
      'step2',
      'promotional_canvas.txt',
    );
    return this.readFile(filePath);
  }

  private readFile(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      throw new InternalServerErrorException(
        `프롬프트 파일을 찾을 수 없습니다: ${filePath}`,
      );
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  private tryReadFile(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      return '';
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  private getSubjectProfile(slug: string): string {
    return this.tryReadFile(
      path.join(
        this.promptsBasePath,
        '_shared',
        'subject_profiles',
        `${slug}.txt`,
      ),
    );
  }

  private getDistractorRules(slug: string): string {
    return this.tryReadFile(
      path.join(
        this.promptsBasePath,
        '_shared',
        'distractor_rules',
        `${slug}.txt`,
      ),
    );
  }

  private getStemPatterns(slug: string): string {
    return this.tryReadFile(
      path.join(
        this.promptsBasePath,
        '_shared',
        'stem_patterns',
        `${slug}.txt`,
      ),
    );
  }
}

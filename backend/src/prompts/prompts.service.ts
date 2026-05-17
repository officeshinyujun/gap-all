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
    return "너는 한국 교육과정평가원(KICE)에서 15년 이상 근무한 전공 서적 기반 수능 출제 전문위원이다. 너의 목표는 단순히 정보를 전달하는 것이 아니라, 지문의 텍스트를 고도로 추상화하여 '매력적인 오답'과 '다단계 추론'을 설계하는 것이다. 너는 지문의 단어를 그대로 사용하는 것을 수치로 여기며, 모든 핵심 개념을 유의어로 치환(Paraphrasing)하여 수험생의 인지 부하를 극대화한다. 너의 모든 문항은 원문에 근거한 폐쇄적 논리 체계 안에서만 작동해야 한다.";
  }

  /**
   * Step 1 프롬프트를 반환합니다.
   * - questionCount == 1 → single/{difficulty}.txt
   * - questionCount >= 2 → multi/multi_{difficulty}.txt
   * 공통 부분(_shared/)을 플레이스홀더로 치환합니다.
   */
  getStep1Prompt(questionCount: number, difficulty: Difficulty): string {
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

    return template
      .replace('{{TPL_LIBRARY}}', tplLibrary)
      .replace('{{IMPLEMENTATION_RULES}}', implRules);
  }

  /**
   * Step 2 프롬프트를 반환합니다.
   */
  getStep2Prompt(): string {
    const filePath = path.join(this.promptsBasePath, 'step2', 'intergrate.txt');
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
}

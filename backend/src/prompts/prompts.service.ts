import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Difficulty } from '../entities/exam-record.entity';

// difficulty → step1 variant suffix 매핑
const DIFFICULTY_VARIANT_MAP: Record<Difficulty, string> = {
  [Difficulty.LOW]: 'single_middle',
  [Difficulty.MIDDLE]: 'single_high',
  [Difficulty.HIGH]: 'single_super',
  [Difficulty.INTERGRATE]: 'multi_intergrate',
};

@Injectable()
export class PromptsService {
  private readonly cache = new Map<string, string>();

  constructor(private readonly supabase: SupabaseService) {}

  getPersona(): string {
    return '너는 EBS 수능특강 실전문항 집필 전문위원이다. 10년 이상 공업 일반(공일)과 성공적인 직업생활(성직) 과목의 문항을 집필해 왔으며, 실제 EBS 문제집의 톤과 구조를 정확히 재현하는 것이 너의 핵심 역량이다. 너의 목표는 교과서 텍스트를 바탕으로 코퍼스에 충실한 스타일의 문항을 설계하는 것이다. 교과 표준 용어는 자연스럽게 사용하되, 단순 정의 확인이 아닌 자료 해석과 개념 적용을 통해 정답에 도달하도록 설계한다. 공일은 산업현장·기술·보고서체로, 성직은 상담·생활상황·안내문체로 작성한다. 난이도는 어휘 난해화가 아니라 정보 분산, 유사 개념 변별, 다중 조건 적용 등 구조적 복잡성에서 만든다. 너의 모든 문항은 원문(text_payload)에 근거한 폐쇄적 논리 체계 안에서만 작동해야 한다.';
  }

  async getStep1Prompt(
    questionCount: number,
    difficulty: Difficulty,
    subjectSlug?: string,
  ): Promise<string> {
    // variant 결정
    let variant: string;
    if (difficulty === Difficulty.INTERGRATE || questionCount >= 2) {
      if (difficulty === Difficulty.INTERGRATE) variant = 'multi_intergrate';
      else if (difficulty === Difficulty.LOW) variant = 'multi_middle';
      else if (difficulty === Difficulty.MIDDLE) variant = 'multi_high';
      else variant = 'multi_super';
    } else {
      variant = DIFFICULTY_VARIANT_MAP[difficulty];
    }

    const template = await this.loadPrompt('step1', variant);
    const tplLibrary = await this.loadFragment('tpl_library');
    const implRules = await this.loadFragment('implementation_rules');
    const outputContract = await this.loadFragment('output_contract');
    const stimulusFormatGuide = await this.loadFragment('stimulus_format_guide');
    const setQuestionRules = await this.loadFragment('set_question_rules');

    let result = template
      .replace('{{TPL_LIBRARY}}', tplLibrary)
      .replace('{{IMPLEMENTATION_RULES}}', implRules)
      .replace('{{OUTPUT_CONTRACT}}', outputContract)
      .replace('{{STIMULUS_FORMAT_GUIDE}}', stimulusFormatGuide)
      .replace('{{SET_QUESTION_RULES}}', setQuestionRules);

    // subject-specific (없으면 빈 값)
    result = result
      .replace('{{SUBJECT_PROFILE}}', '')
      .replace('{{DISTRACTOR_RULES}}', '')
      .replace('{{STEM_PATTERNS}}', '');

    return result;
  }

  async getStep2Prompt(subjectSlug?: string): Promise<string> {
    // subject-specific 먼저 시도, 없으면 intergrate
    let variant = 'intergrate';
    if (subjectSlug) {
      const exists = await this.promptExists('step2', subjectSlug);
      if (exists) variant = subjectSlug;
    }

    const result = await this.loadPrompt('step2', variant);

    return result
      .replace('{{SUBJECT_PROFILE}}', '')
      .replace('{{DISTRACTOR_RULES}}', '')
      .replace('{{STEM_PATTERNS}}', '');
  }

  async getStep2PromotionalCanvasPrompt(): Promise<string> {
    return this.loadPrompt('step2', 'promotional_canvas');
  }

  // ========== private helpers ==========

  private async loadPrompt(step: string, variant: string): Promise<string> {
    const cacheKey = `prompt:${step}:${variant}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const { data, error } = await this.supabase.client
      .from('prompts')
      .select('prompt_template')
      .eq('step', step)
      .eq('variant', variant)
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        `프롬프트를 찾을 수 없습니다: ${step}/${variant}`,
      );
    }

    this.cache.set(cacheKey, data.prompt_template);
    return data.prompt_template;
  }

  private async loadFragment(key: string): Promise<string> {
    const cacheKey = `fragment:${key}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const { data, error } = await this.supabase.client
      .from('prompt_fragments')
      .select('content')
      .eq('fragment_key', key)
      .single();

    if (error || !data) return ''; // optional fragments

    this.cache.set(cacheKey, data.content);
    return data.content;
  }

  private async promptExists(step: string, variant: string): Promise<boolean> {
    const { count, error } = await this.supabase.client
      .from('prompts')
      .select('id', { count: 'exact', head: true })
      .eq('step', step)
      .eq('variant', variant);

    return !error && (count ?? 0) > 0;
  }
}

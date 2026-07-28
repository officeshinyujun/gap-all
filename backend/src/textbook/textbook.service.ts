import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

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

// 과목 slug → DB subject 컬럼값 매핑
const SUBJECT_MAP: Record<string, string> = {
  success: 'sungjik',
  industry: 'kongil',
};

@Injectable()
export class TextbookService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * concepts 테이블에서 단원별 핵심 개념 목록을 반환합니다.
   */
  async getConcepts(
    subjectSlug: string,
    startUnit: number,
    endUnit: number,
  ): Promise<UnitConcepts[]> {
    const subject = SUBJECT_MAP[subjectSlug];
    if (!subject) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }

    // unit_id 조회
    const { data: units } = await this.supabase.client
      .from('textbook_units')
      .select('id, unit_number')
      .eq('subject', subject)
      .gte('unit_number', startUnit)
      .lte('unit_number', endUnit);

    if (!units?.length) return [];

    const unitIds = units.map((u) => u.id);

    const { data: concepts } = await this.supabase.client
      .from('textbook_concepts')
      .select('unit_id, concept_name')
      .in('unit_id', unitIds)
      .order('sort_order', { ascending: true });

    if (!concepts?.length) return [];

    // unit별로 그룹화
    const grouped = new Map<string, string[]>();
    for (const c of concepts) {
      const list = grouped.get(c.unit_id) ?? [];
      list.push(c.concept_name);
      grouped.set(c.unit_id, list);
    }

    return units.map((u) => ({
      unitName: `${u.unit_number}단원`,
      concepts: grouped.get(u.id) ?? [],
    }));
  }

  /**
   * 과목 slug와 단원 범위를 받아 텍스트 페이로드 배열을 반환합니다.
   */
  async getUnits(
    subjectSlug: string,
    startUnit: number,
    endUnit: number,
  ): Promise<UnitPayload[]> {
    const subject = SUBJECT_MAP[subjectSlug];
    if (!subject) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }

    const { data: units } = await this.supabase.client
      .from('textbook_units')
      .select('unit_number, text_payload')
      .eq('subject', subject)
      .gte('unit_number', startUnit)
      .lte('unit_number', endUnit)
      .order('unit_number');

    if (!units?.length) {
      throw new NotFoundException(
        `${subjectSlug} 과목의 ${startUnit}~${endUnit}단원 텍스트를 찾을 수 없습니다.`,
      );
    }

    return units.map((u) => ({
      unit_name: `${u.unit_number}단원`,
      text_payload: u.text_payload,
    }));
  }

  /**
   * summation 카드 데이터를 읽어 raw JSON 문자열로 반환합니다.
   * (AI 생성 서비스에서 사용 - 기존과 동일한 인터페이스 유지)
   */
  async getSummationMd(subjectSlug: string, unitNumber: number): Promise<string> {
    const subject = SUBJECT_MAP[subjectSlug];
    if (!subject) {
      throw new NotFoundException(`지원하지 않는 과목입니다: ${subjectSlug}`);
    }

    // unit 조회
    const { data: unit } = await this.supabase.client
      .from('textbook_units')
      .select('id')
      .eq('subject', subject)
      .eq('unit_number', unitNumber)
      .single();

    if (!unit) {
      throw new NotFoundException(
        `${subjectSlug} 과목의 ${unitNumber}단원 summation을 찾을 수 없습니다.`,
      );
    }

    // summation cards 조회
    const { data: cards } = await this.supabase.client
      .from('textbook_summation_cards')
      .select('title, body, key_concepts')
      .eq('unit_id', unit.id)
      .order('card_index');

    if (!cards?.length) {
      throw new NotFoundException(
        `${subjectSlug} 과목의 ${unitNumber}단원 summation을 찾을 수 없습니다.`,
      );
    }

    // 기존 JSON 형식으로 재구성
    return JSON.stringify({ cards: cards.map((c) => ({ content: c })) });
  }

  extractTextFromSummation(raw: string): string {
    const jsonStr = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    const data = JSON.parse(jsonStr);
    const cards: any[] = data.cards ?? [];
    const sections: string[] = [];

    for (const card of cards) {
      const c = card.content;
      if (!c) continue;

      const parts: string[] = [];
      if (c.title) parts.push(`## ${c.title}`);
      if (c.description) parts.push(c.description);
      if (c.body) parts.push(c.body);
      if (c.integrated_data?.table) parts.push(c.integrated_data.table);
      if (c.integrated_data?.logic_flow)
        parts.push(c.integrated_data.logic_flow);
      if (c.integrated_data?.visual_analysis)
        parts.push(c.integrated_data.visual_analysis);
      if (Array.isArray(c.bullet_points) && c.bullet_points.length > 0) {
        parts.push(c.bullet_points.map((bp: string) => `- ${bp}`).join('\n'));
      }
      if (Array.isArray(c.trap_points) && c.trap_points.length > 0) {
        parts.push(`주의: ${c.trap_points.join(', ')}`);
      }
      // key_concepts가 배열이면 텍스트로 변환
      if (Array.isArray(c.key_concepts)) {
        for (const kc of c.key_concepts) {
          if (kc.name) parts.push(`### ${kc.name}`);
          if (kc.definition) parts.push(kc.definition);
          if (Array.isArray(kc.key_points))
            parts.push(kc.key_points.map((kp: string) => `- ${kp}`).join('\n'));
        }
      }

      if (parts.length > 0) sections.push(parts.join('\n'));
    }

    return sections.join('\n\n');
  }
}

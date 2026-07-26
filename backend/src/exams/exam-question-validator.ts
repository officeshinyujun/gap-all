import { Logger, InternalServerErrorException } from '@nestjs/common';
import { Difficulty } from '../entities/exam-record.entity';
import { GeneratedQuestion } from './exam-generation.utils';
import { StimulusNormalizer } from './stimulus-normalizer';

/** raw item → GeneratedQuestion 검증 + 변환 */
export function validateItems(
  rawItems: any[],
  logger: Logger,
  normalizer: StimulusNormalizer,
): GeneratedQuestion[] {
  const valid: GeneratedQuestion[] = [];

  for (const item of rawItems) {
    try {
      const meta = item.metadata ?? {};
      const rr = item.render_ready ?? {};
      const exp = item.explanation ?? {};

      const optionsList: string[] =
        rr.options_list ??
        (rr.options ?? []).map((o: any) => o.text ?? String(o));

      const rawAnswer = item.correct_answer ?? rr.correct_answer;
      if (rawAnswer == null) {
        logger.warn(`correct_answer 누락, 스킵`);
        continue;
      }
      const correctAnswer = Number(rawAnswer);

      if (!Array.isArray(optionsList) || optionsList.length !== 5) {
        logger.warn(`선택지 5개 아님 (${optionsList.length}개), 스킵`);
        continue;
      }
      if (correctAnswer < 1 || correctAnswer > 5) {
        logger.warn(`정답 범위 오류 (${correctAnswer}), 스킵`);
        continue;
      }

      const combCheck = validateCombinationEncoding(item);
      if (!combCheck.valid) {
        logger.warn(`조합형 검증 실패: ${combCheck.reason}, 스킵`);
        continue;
      }

      const stemCheck = validateStemPattern(item);
      if (!stemCheck.valid) {
        logger.warn(`줄기 패턴 검증 실패: ${stemCheck.reason}, 스킵`);
        continue;
      }

      const logicCheck = validateItemLogic(item);
      if (!logicCheck.valid) {
        logger.warn(`논리 정합성 검증 실패: ${logicCheck.reason}, 스킵`);
        continue;
      }

      // TPL 스키마 검증 (non-blocking — 로그만 남기고 통과)
      const tplErrors = normalizer.validateTplSchema(
        rr.stimulus_data ?? {},
        meta.recommended_template ?? '',
        item,
      );
      if (tplErrors.length > 0) {
        logger.warn(
          `TPL 스키마 오류 (${meta.recommended_template}): ${tplErrors.join('; ')}`,
        );
      }

      const dnaContract = item.dna_contract;
      if (dnaContract?.materialContract?.requiredTemplate) {
        const requiredTemplate = dnaContract.materialContract.requiredTemplate;
        if (meta.recommended_template !== requiredTemplate) {
          logger.warn(
            `DNA TPL 불일치: required=${requiredTemplate}, actual=${meta.recommended_template}, 스킵`,
          );
          continue;
        }
        if (
          !normalizer.isRenderableTplData(rr.stimulus_data, requiredTemplate)
        ) {
          logger.warn(`DNA TPL 렌더 불가: ${requiredTemplate}, 스킵`);
          continue;
        }
      }

      // ── 콘텐츠 품질 검증: 빈/플레이스홀더 문항 차단 ──
      const PLACEHOLDER_PATTERNS = [
        '(내용 없음)',
        '내용 없음',
        '값을 입력',
        '여기에 ',
        '{{',
        'TEXT',
        'BLANK',
      ];
      const stimJson = JSON.stringify(rr.stimulus_data ?? {});
      const stimLen = stimJson.length;
      const hasPlaceholder = PLACEHOLDER_PATTERNS.some((p) =>
        stimJson.includes(p),
      );
      const isEmptyObj = stimLen <= 4 || stimJson === '{}';
      if (isEmptyObj) {
        logger.warn(
          `validateItems: stimulus_data 비어있음 — ${meta.target_concept ?? '?'} 스킵`,
        );
        continue;
      }
      if (hasPlaceholder) {
        logger.warn(
          `validateItems: stimulus_data에 플레이스홀더 포함 — ${meta.target_concept ?? '?'} 스킵`,
        );
        continue;
      }

      const difficultyMap: Record<string, Difficulty> = {
        하: Difficulty.LOW,
        중: Difficulty.MIDDLE,
        상: Difficulty.HIGH,
        LOW: Difficulty.LOW,
        MIDDLE: Difficulty.MIDDLE,
        HIGH: Difficulty.HIGH,
        INTERGRATE: Difficulty.INTERGRATE,
      };

      let comboBlock: GeneratedQuestion['comboBlock'] = null;
      const jm = item.judgment_map;
      const rrCombo = rr.combo_block;

      if (rrCombo && Array.isArray(rrCombo.items) && rrCombo.items.length > 0) {
        comboBlock = rrCombo;
      } else if (jm && typeof jm === 'object') {
        const keyMap: Record<string, string> = {
          ga: 'ㄱ',
          na: 'ㄴ',
          da: 'ㄷ',
          ra: 'ㄹ',
        };
        const cbItems = Object.entries(jm)
          .filter(([k]) => keyMap[k])
          .map(([k, v]: [string, any]) => ({
            key: keyMap[k],
            text: typeof v === 'object' ? (v.claim ?? v.text ?? '') : String(v),
          }))
          .filter((ci) => ci.text.length > 0);
        if (cbItems.length > 0) {
          comboBlock = { title: '<보기>', items: cbItems };
        }
      }

      valid.push({
        targetConcept: meta.target_concept ?? '',
        itemType: meta.item_type ?? '',
        difficulty:
          difficultyMap[meta.difficulty ?? meta.item_type] ?? Difficulty.MIDDLE,
        recommendedTemplate: meta.recommended_template ?? '',
        questionStem: rr.question_stem ?? '',
        stimulusData: rr.stimulus_data ?? {},
        optionsList,
        comboBlock,
        explanation: typeof exp === 'string' ? { judgment: exp } : exp,
        correctAnswer,
        unitName: meta.unit_name ?? '',
        setGroupId: meta.set_group_id ?? null,
        setPosition: meta.set_position ?? null,
        dnaContract,
      });
    } catch (e) {
      logger.warn(`문항 파싱 오류, 스킵: ${e.message}`);
    }
  }

  if (valid.length === 0) {
    throw new InternalServerErrorException(
      '유효한 문항이 생성되지 않았습니다.',
    );
  }

  return valid;
}

export function validateCombinationEncoding(item: any): {
  valid: boolean;
  reason?: string;
} {
  const itemStructure = item.item_structure;
  if (
    !itemStructure ||
    itemStructure.choice_encoding_type !== 'truth_combination'
  ) {
    return { valid: true };
  }

  const rr = item.render_ready ?? {};
  const optionsList: string[] =
    rr.options_list ?? (rr.options ?? []).map((o: any) => o.text ?? String(o));

  if (!Array.isArray(optionsList) || optionsList.length !== 5) {
    return {
      valid: false,
      reason: `조합형 문항의 선택지가 5개가 아님 (${optionsList?.length ?? 0}개)`,
    };
  }

  const combinationPattern = /[ㄱ-ㅎ]/;
  const combLikeCount = optionsList.filter((opt) =>
    combinationPattern.test(opt),
  ).length;
  if (combLikeCount < 3) {
    return {
      valid: false,
      reason: `조합형 문항이지만 선택지가 조합 패턴이 아님 (${combLikeCount}/5개만 매칭)`,
    };
  }

  const judgmentMap = item.judgment_map;
  const choiceEncodingPlan = item.choice_encoding_plan;
  if (judgmentMap && choiceEncodingPlan?.correct_combination) {
    const correctIdx =
      Number(item.correct_answer ?? rr.correct_answer ?? 0) - 1;
    if (correctIdx >= 0 && correctIdx < optionsList.length) {
      const trueStatements = Object.entries(judgmentMap)
        .filter(
          ([, v]) => v === true || v === 'T' || v === '옳음' || v === '참',
        )
        .map(([k]) => k);
      if (trueStatements.length > 0) {
        const correctOption = optionsList[correctIdx];
        const allPresent = trueStatements.every((s) =>
          correctOption.includes(s),
        );
        if (!allPresent) {
          return {
            valid: false,
            reason: `정답 선택지가 judgment_map의 참인 진술과 불일치`,
          };
        }
      }
    }
  }

  return { valid: true };
}

export function validateStemPattern(item: any): {
  valid: boolean;
  reason?: string;
} {
  const rr = item.render_ready ?? {};
  const questionStem: string = rr.question_stem ?? '';
  const meta = item.metadata ?? {};

  if (questionStem.length < 10) {
    return {
      valid: false,
      reason: `문항 줄기가 너무 짧음 (${questionStem.length}자)`,
    };
  }

  const questionEndings =
    /(?:것은\?|고른\s*것은\?|고르시오|옳은\s*것은\?|않은\s*것은\?|무엇인가\?|서술하시오|설명으로.*옳은|대한.*설명|맞는\s*것)$/;
  if (!questionEndings.test(questionStem.trim())) {
    return {
      valid: false,
      reason: `문항 줄기가 적절한 질문 형식으로 끝나지 않음`,
    };
  }

  const targetConcept: string = meta.target_concept ?? '';
  const itemStructure = item.item_structure;
  if (
    targetConcept.length > 1 &&
    questionStem.includes(targetConcept) &&
    itemStructure?.item_family &&
    itemStructure.item_family !== 'direct_statement'
  ) {
    return {
      valid: false,
      reason: `문항 줄기에 target_concept("${targetConcept}")이 직접 노출됨`,
    };
  }

  return { valid: true };
}

export function validateItemLogic(item: any): {
  valid: boolean;
  reason?: string;
} {
  const itemStructure = item.item_structure;
  const rr = item.render_ready ?? {};
  const optionsList: string[] =
    rr.options_list ?? (rr.options ?? []).map((o: any) => o.text ?? String(o));
  const rawAnswer = item.correct_answer ?? rr.correct_answer;
  if (rawAnswer == null) {
    return { valid: false, reason: 'correct_answer 누락' };
  }
  const correctAnswer = Number(rawAnswer);

  if (correctAnswer < 1 || correctAnswer > 5) {
    return {
      valid: false,
      reason: `정답 번호가 1~5 범위 밖 (${correctAnswer})`,
    };
  }

  if (!itemStructure) {
    return { valid: true };
  }

  const combinationPattern = /[ㄱ-ㅎ]/;
  const combLikeCount = Array.isArray(optionsList)
    ? optionsList.filter(
        (opt) => combinationPattern.test(opt) && opt.length < 30,
      ).length
    : 0;

  if (itemStructure.choice_encoding_type === 'truth_combination') {
    const fullSentenceCount = Array.isArray(optionsList)
      ? optionsList.filter(
          (opt) => opt.length > 40 && !combinationPattern.test(opt),
        ).length
      : 0;
    if (fullSentenceCount >= 3) {
      return {
        valid: false,
        reason: `조합형(truth_combination)이지만 선택지가 완전한 문장 형태`,
      };
    }
  }

  if (itemStructure.choice_encoding_type === 'independent_options') {
    if (combLikeCount >= 4) {
      return {
        valid: false,
        reason: `독립형(independent_options)이지만 선택지가 조합 패턴`,
      };
    }
  }

  const itemFamily = itemStructure.item_family;
  const questionStem: string = rr.question_stem ?? '';

  if (itemFamily === 'single_selection') {
    const longSentenceCount = Array.isArray(optionsList)
      ? optionsList.filter(
          (opt) => /[.?!]$/.test(opt.trim()) || opt.length > 45,
        ).length
      : 0;
    if (longSentenceCount >= 3) {
      return {
        valid: false,
        reason: 'single_selection인데 선지가 후보명이 아니라 장문 서술 중심임',
      };
    }
    const singleSelectionStem =
      /(가장\s*적절한\s*것은\?|옳은\s*것은\?|옳지\s*않은\s*것은\?|무엇인가\?)/;
    if (!singleSelectionStem.test(questionStem)) {
      return {
        valid: false,
        reason: 'single_selection인데 발문이 단일 선택형 질문 패턴이 아님',
      };
    }
  }

  if (itemFamily === 'direct_statement') {
    const directStemRef =
      /(다음|위|아래).*(자료|표|기사|보고서|공고문|화면|설문|저널|내용)/;
    if (!directStemRef.test(questionStem)) {
      return {
        valid: false,
        reason: 'direct_statement인데 발문이 자료 직접 참조형이 아님',
      };
    }
    const stimulusText = JSON.stringify(rr.stimulus_data ?? {});
    if (stimulusText.length < 40) {
      return {
        valid: false,
        reason: 'direct_statement인데 stimulus_data 정보량이 너무 적음',
      };
    }
  }

  if (itemFamily === 'blank_workflow') {
    const workflowStem = /(\(가\)|\(나\)|단계|절차|순서|흐름)/;
    if (!workflowStem.test(questionStem)) {
      return {
        valid: false,
        reason: 'blank_workflow인데 발문에 빈칸/단계/절차 단서가 없음',
      };
    }
    const stimulus = rr.stimulus_data ?? {};
    const hasWorkflow =
      Array.isArray(stimulus.steps) || /steps/.test(JSON.stringify(stimulus));
    if (!hasWorkflow) {
      return {
        valid: false,
        reason: 'blank_workflow인데 stimulus_data에 단계 정보가 없음',
      };
    }
  }

  return { valid: true };
}

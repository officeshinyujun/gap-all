import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, type Repository } from 'typeorm';
import { Difficulty } from '../entities/exam-record.entity';
import { ReferenceQuestion } from '../entities/reference-question.entity';
import {
  TextbookService,
  type UnitConcepts,
} from '../textbook/textbook.service';
import { getOpenAIClient } from '../lib/openai-keys';
import type { ExamGenerationProgressReporter } from './exam-generation.utils';
import { referenceFinalGenerationModel } from './reference-generation-model';
import { ReferenceJobDeadline } from './reference-job-deadline';
import {
  getTplSchema,
  isStructuredTplName,
  type StructuredTplName,
} from './tpl-schemas';
import type {
  SimplyReferenceGenerationLineage,
  SubjectStyle,
} from './reference-frame.types';
import {
  selectReferences,
  type NormalizedSourceReference,
} from './reference-selector.service';
import { parseReference, stableHash } from './reference-selector.utils';
import {
  matrixGroundingTerms,
  validateReferenceFactGrounding,
} from './reference-fact-grounding';
import { validateSimplyReferenceStructuredTpl } from './simply-reference-generation-contract';
import { StimulusNormalizer } from './stimulus-normalizer';
import {
  SOURCE_PRESERVING_ADAPTER_VERSION,
  sourcePreservingRender,
  sourceTemplate,
} from './simply-reference-source-preserving.adapter';

const MAX_SIMPLY_REFERENCE_BATCH_SIZE = 5;
const MAX_SIMPLY_REFERENCE_ATTEMPTS = 2;
const MAX_SIMPLY_REFERENCE_REPAIR_ATTEMPTS = 2;
const SIMPLY_REFERENCE_PROVIDER_TIMEOUT_MS =
  Number(process.env.OPENAI_TIMEOUT_MS) || 180_000;

export { SOURCE_PRESERVING_ADAPTER_VERSION } from './simply-reference-source-preserving.adapter';

const normalizer = new StimulusNormalizer();

export const SIMPLY_REFERENCE_GENERATION_DEPENDENCIES =
  'SIMPLY_REFERENCE_GENERATION_DEPENDENCIES';

export type SimplyReferenceGenerationDependencies = Readonly<{
  completeBatch: (
    prompt: string,
    references: readonly NormalizedSourceReference[],
    deadline?: ReferenceJobDeadline,
  ) => Promise<string>;
}>;

export type SimplyReferenceGenerationOptions = Readonly<{
  excludePrevious?: boolean;
  generationNonce?: string;
  previousFingerprints?: readonly string[];
  previousSourceIds?: readonly string[];
  /** Use answer-key verified source content directly instead of model rewriting. */
  sourcePreserving?: boolean;
  /** Study-derived ordering only; selection still filters canonical eligible references. */
  studyPatternGroups?: readonly (readonly string[])[];
  studyPatternTags?: Readonly<
    Record<string, Readonly<{ examPatternId: string; questionFormat: string }>>
  >;
}>;

type SimplyReferenceBatchParseResult = Readonly<{
  drafts: readonly SimplyReferenceGeneratedDraft[];
  unresolved: readonly NormalizedSourceReference[];
}>;

export type SimplyReferenceGeneratedDraft = Readonly<{
  result: Readonly<{
    metadata: Readonly<{
      unit_name: string;
      target_concept: string;
      item_type: 'simply_reference';
      difficulty: Difficulty;
      recommended_template: string;
    }>;
    render_ready: Readonly<{
      question_stem: string;
      stimulus_data: Record<string, unknown>;
      options_list: readonly string[];
      combo_block: Readonly<{
        title: string;
        items: readonly Readonly<{ key: string; text: string }>[];
      }> | null;
    }>;
    explanation: Readonly<{ judgment: string }>;
    correct_answer: number;
  }>;
  lineage: SimplyReferenceGenerationLineage;
}>;

export type SimplyReferenceCatalogReader = Pick<
  Repository<ReferenceQuestion>,
  'find'
>;

@Injectable()
export class SimplyReferenceGenerationService {
  private readonly dependencies: SimplyReferenceGenerationDependencies;

  constructor(
    private readonly textbookService: TextbookService,
    @InjectRepository(ReferenceQuestion)
    private readonly catalogReader: SimplyReferenceCatalogReader,
    @Optional()
    @Inject(SIMPLY_REFERENCE_GENERATION_DEPENDENCIES)
    dependencies?: SimplyReferenceGenerationDependencies,
  ) {
    this.dependencies = dependencies ?? {
      completeBatch: async (prompt, references, deadline) => {
        const complete = async (signal?: AbortSignal): Promise<string> => {
          const response = await getOpenAIClient().chat.completions.create(
            {
              model: referenceFinalGenerationModel(),
              messages: [
                {
                  role: 'system',
                  content:
                    'Generate Korean CSAT-style reference questions. Return only one JSON object with a questions array.',
                },
                { role: 'user', content: prompt },
              ],
              response_format: simplyReferenceResponseFormat(references),
              temperature: 0.2,
            },
            signal === undefined ? undefined : { signal },
          );
          const content = response.choices[0]?.message.content;
          return content ?? '';
        };
        return deadline === undefined
          ? complete()
          : deadline.runProviderCall(
              'final_generator',
              SIMPLY_REFERENCE_PROVIDER_TIMEOUT_MS,
              ({ signal }) => complete(signal),
            );
      },
    };
  }

  async generate(
    subjectSlug: string,
    startUnitNum: number,
    endUnitNum: number,
    difficulty: Difficulty,
    questionCount: number,
    targetConcepts?: readonly string[],
    sourceIds?: readonly string[],
    reportProgress?: ExamGenerationProgressReporter,
    deadline?: ReferenceJobDeadline,
    customPrompt?: string,
    options: SimplyReferenceGenerationOptions = {},
  ): Promise<readonly SimplyReferenceGeneratedDraft[]> {
    const subject = subjectStyle(subjectSlug);
    const catalogRows = await this.catalogReader.find({
      where: {
        subject: In(catalogSubjects(subjectSlug)),
        unitNumber: Between(startUnitNum, endUnitNum),
      },
    });
    const parsedReferences = propagateSharedPassageStimuli(
      catalogRows.map(catalogReferencePayload),
    );
    const eligibleParsedReferences = parsedReferences.filter((reference) => {
      const parsed = parseReference(reference, subject);
      return (
        parsed.ok &&
        sourceTemplate(parsed.value) !== null &&
        (!options.sourcePreserving || isSourcePreservingEligible(parsed.value))
      );
    });
    const textbookConcepts = await this.textbookService.getConcepts(
      subjectSlug,
      startUnitNum,
      endUnitNum,
    );
    const validUnitConcepts = conceptValidUnitMap(textbookConcepts);
    const conceptValidReferences = eligibleParsedReferences.filter(
      (reference) => {
        const parsed = parseReference(reference, subject);
        if (!parsed.ok) return false;
        const concepts = validUnitConcepts.get(parsed.value.unitNumber);
        if (concepts === undefined) return true;
        return (
          concepts.has(parsed.value.target.primaryConcept) ||
          conceptsMatchFuzzy(parsed.value.target.primaryConcept, concepts)
        );
      },
    );
    const sourceTargetConcepts = conceptValidReferences.flatMap((reference) => {
      const parsed = parseReference(reference, subject);
      return parsed.ok ? [parsed.value.target.primaryConcept] : [];
    });
    const requestedConcepts =
      targetConcepts !== undefined && targetConcepts.length > 0
        ? targetConcepts
        : [
            ...textbookConcepts.flatMap((unit) => unit.concepts),
            ...sourceTargetConcepts,
          ];
    const generationNonce = options.generationNonce ?? 'legacy';
    const selectionSeed = `${subjectSlug}:${startUnitNum}:${endUnitNum}:${questionCount}:simply:${generationNonce}`;
    const selection = selectReferences({
      subject,
      unitRange: { start: startUnitNum, end: endUnitNum },
      requestedConcepts,
      requestedDistractorAxes: [],
      requestedReferenceCount: questionCount,
      includeAllEligibleReferences: true,
      seed: selectionSeed,
      unitConcepts: textbookConcepts,
      parsedReferences: conceptValidReferences,
      sourceIds,
      ...(targetConcepts === undefined || targetConcepts.length === 0
        ? {}
        : { eligibleReferenceConcepts: targetConcepts }),
    });
    if (selection.kind === 'shortfall') {
      if (options.sourcePreserving) {
        throw sourceReextractionRequired(
          questionCount,
          eligibleParsedReferences.filter((reference) => {
            const parsed = parseReference(reference, subject);
            return parsed.ok && isSourcePreservingEligible(parsed.value);
          }).length,
        );
      }
      throw new InternalServerErrorException({
        code: 'REFERENCE_SELECTION_SHORTFALL',
        ...selection.shortfall,
      });
    }
    const rankedBase =
      sourceIds === undefined
        ? prioritizeSimplyReferenceSources(selection.references, selectionSeed)
        : preserveExplicitSourceOrder(selection.references, sourceIds);
    const ranked =
      sourceIds === undefined && options.studyPatternGroups !== undefined
        ? prioritizeStudyPatternGroups(rankedBase, options.studyPatternGroups)
        : rankedBase;
    const selected = [
      sourceIds === undefined && options.excludePrevious !== false
        ? selectSimplyReferenceSources(
            ranked,
            options.previousSourceIds,
            questionCount,
          )
        : ranked.slice(0, questionCount),
    ].flat();
    if (selected.length !== questionCount) {
      throw new InternalServerErrorException({
        code: 'REFERENCE_SELECTION_SHORTFALL',
        requestedReferenceCount: questionCount,
        availableReferenceCount: selected.length,
        sourceRejectedCount: selection.sourceRejectedCount ?? 0,
        reasons: ['INSUFFICIENT_REFERENCES'],
      });
    }

    await reportProgress?.({
      stage: 'selection',
      progress: 15,
      message: '참조 문항을 선택했습니다.',
      status: 'info',
      completed: 0,
      total: questionCount,
      attempt: 0,
      maxAttempts: 0,
    });

    if (options.sourcePreserving) {
      const drafts = selected.map((reference, index) =>
        sourcePreservingDraft(
          reference,
          difficulty,
          generationNonce,
          index + 1,
          options.studyPatternTags?.[reference.source.sourceId],
        ),
      );
      await reportProgress?.({
        stage: 'final',
        progress: 100,
        message: '공식 정답이 확인된 원문 기출 문항을 준비했습니다.',
        status: 'info',
        completed: drafts.length,
        total: questionCount,
        attempt: 1,
        maxAttempts: 1,
      });
      return drafts;
    }

    const draftBySourceId = new Map<string, SimplyReferenceGeneratedDraft>();
    const unresolved: NormalizedSourceReference[] = [];
    const duplicateSourceIds = new Set<string>();
    const seenFingerprints = new Set(
      options.excludePrevious === false
        ? []
        : (options.previousFingerprints ?? []),
    );
    for (const [batchIndex, batch] of chunkSimplyReferenceRequests(
      selected,
    ).entries()) {
      deadline?.assertActive('final_generator');
      const content = await this.dependencies.completeBatch(
        buildSimplyReferencePrompt(
          batch,
          difficulty,
          false,
          customPrompt,
          generationNonce,
        ),
        batch,
        deadline,
      );
      deadline?.assertActive('final_generator');
      console.log(
        '[SIMPLY_REF_RAW] content length:',
        content.length,
        'preview:',
        content.slice(0, 300),
      );
      const parsed = parseSimplyReferenceBatch(
        content,
        batch,
        difficulty,
        batchIndex + 1,
        generationNonce,
      );
      const novel = retainNovelSimplyReferenceDrafts(
        parsed.drafts,
        seenFingerprints,
      );
      for (const draft of novel.drafts) {
        draftBySourceId.set(draft.lineage.source.sourceId, draft);
      }
      const referenceBySourceId = new Map(
        batch.map((reference) => [reference.source.sourceId, reference]),
      );
      unresolved.push(...parsed.unresolved);
      for (const sourceId of novel.duplicateSourceIds) {
        if (referenceBySourceId.has(sourceId)) duplicateSourceIds.add(sourceId);
      }
      await reportProgress?.({
        stage: 'final',
        progress: Math.round((draftBySourceId.size / questionCount) * 100),
        message: '참조 문항을 생성했습니다.',
        status: 'info',
        completed: draftBySourceId.size,
        total: questionCount,
        attempt: 1,
        maxAttempts: MAX_SIMPLY_REFERENCE_ATTEMPTS,
      });
    }

    console.log('[SIMPLY_REF_DEBUG] After initial batches:', {
      draftCount: draftBySourceId.size,
      unresolvedCount: unresolved.length,
      selectedCount: selected.length,
      questionCount,
    });

    const previousSourceIds = new Set(options.previousSourceIds ?? []);
    const selectedSourceIds = new Set(
      selected.map((reference) => reference.source.sourceId),
    );
    const replacementCandidates = [
      ...ranked.filter(
        (reference) =>
          !selectedSourceIds.has(reference.source.sourceId) &&
          !previousSourceIds.has(reference.source.sourceId),
      ),
      ...ranked.filter(
        (reference) =>
          !selectedSourceIds.has(reference.source.sourceId) &&
          previousSourceIds.has(reference.source.sourceId),
      ),
    ];
    let retryQueue = uniqueSimplyReferenceSources([
      ...unresolved,
      ...replaceDuplicateSources(
        selected,
        duplicateSourceIds,
        replacementCandidates,
      ),
    ]);
    const variantExhaustedSourceIds = new Set<string>(duplicateSourceIds);

    for (
      let repairAttempt = 1;
      repairAttempt <= MAX_SIMPLY_REFERENCE_REPAIR_ATTEMPTS &&
      retryQueue.length > 0;
      repairAttempt += 1
    ) {
      const nextRetryQueue: NormalizedSourceReference[] = [];
      for (const reference of retryQueue) {
        deadline?.assertActive('final_generator');
        const retryNonce = `${generationNonce}:retry:${reference.source.sourceId}:${repairAttempt}`;
        const content = await this.dependencies.completeBatch(
          buildSimplyReferencePrompt(
            [reference],
            difficulty,
            true,
            customPrompt,
            retryNonce,
          ),
          [reference],
          deadline,
        );
        deadline?.assertActive('final_generator');
        const selectedIndex = selected.findIndex(
          (candidate) =>
            candidate.source.sourceId === reference.source.sourceId,
        );
        const repaired = parseSimplyReferenceBatch(
          content,
          [reference],
          difficulty,
          Math.floor(
            Math.max(0, selectedIndex) / MAX_SIMPLY_REFERENCE_BATCH_SIZE,
          ) + 1,
          retryNonce,
        );
        const novel = retainNovelSimplyReferenceDrafts(
          repaired.drafts,
          seenFingerprints,
        );
        for (const draft of novel.drafts) {
          draftBySourceId.set(draft.lineage.source.sourceId, draft);
        }
        nextRetryQueue.push(...repaired.unresolved);
        if (novel.duplicateSourceIds.length > 0) {
          for (const sourceId of novel.duplicateSourceIds) {
            variantExhaustedSourceIds.add(sourceId);
          }
          nextRetryQueue.push(
            ...replaceDuplicateSources(
              selected,
              new Set(novel.duplicateSourceIds),
              replacementCandidates,
            ),
          );
        }
      }
      retryQueue = uniqueSimplyReferenceSources(nextRetryQueue);
      await reportProgress?.({
        stage: 'final',
        progress: Math.round((draftBySourceId.size / questionCount) * 100),
        message: '참조 문항을 보정했습니다.',
        status: 'info',
        completed: draftBySourceId.size,
        total: questionCount,
        attempt: repairAttempt + 1,
        maxAttempts:
          MAX_SIMPLY_REFERENCE_ATTEMPTS + MAX_SIMPLY_REFERENCE_REPAIR_ATTEMPTS,
      });
    }

    console.log('[SIMPLY_REF_DEBUG] After repair:', {
      draftCount: draftBySourceId.size,
      failedCount: retryQueue.length,
      questionCount,
    });

    if (retryQueue.length > 0 || draftBySourceId.size !== questionCount) {
      throw invalidOutput(
        variantExhaustedSourceIds.size > 0
          ? 'VARIANT_EXHAUSTED'
          : 'RETRY_EXHAUSTED',
        retryQueue.map((reference) => reference.source.sourceId),
      );
    }
    return selected.flatMap((reference) => {
      const draft = draftBySourceId.get(reference.source.sourceId);
      return draft === undefined ? [] : [draft];
    });
  }
}

function prioritizeSimplyReferenceSources(
  references: readonly NormalizedSourceReference[],
  seed: string,
): readonly NormalizedSourceReference[] {
  return [...references].sort((left, right) => {
    const leftPriority = simplyReferencePriority(left);
    const rightPriority = simplyReferencePriority(right);
    return (
      rightPriority.combo - leftPriority.combo ||
      rightPriority.structured - leftPriority.structured ||
      rightPriority.informationUnits - leftPriority.informationUnits ||
      rightPriority.conditions - leftPriority.conditions ||
      compareText(
        stableHash(`${seed}\u0000${left.source.sourceId}`),
        stableHash(`${seed}\u0000${right.source.sourceId}`),
      ) ||
      compareText(left.source.sourceId, right.source.sourceId)
    );
  });
}

function prioritizeStudyPatternGroups(
  references: readonly NormalizedSourceReference[],
  groups: readonly (readonly string[])[],
): readonly NormalizedSourceReference[] {
  const byId = new Map(references.map((reference) => [reference.source.sourceId, reference]));
  const ordered: NormalizedSourceReference[] = [];
  const seen = new Set<string>();
  const maxGroupLength = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < maxGroupLength; index += 1) {
    for (const group of groups) {
      const sourceId = group[index];
      const reference = sourceId === undefined ? undefined : byId.get(sourceId);
      if (reference !== undefined && !seen.has(sourceId)) {
        seen.add(sourceId);
        ordered.push(reference);
      }
    }
  }
  return [...ordered, ...references.filter((reference) => !seen.has(reference.source.sourceId))];
}

function selectSimplyReferenceSources(
  ranked: readonly NormalizedSourceReference[],
  previousSourceIds: readonly string[] | undefined,
  questionCount: number,
): readonly NormalizedSourceReference[] {
  const previous = new Set(previousSourceIds ?? []);
  const unseen = ranked.filter(
    (reference) => !previous.has(reference.source.sourceId),
  );
  const reused = ranked.filter((reference) =>
    previous.has(reference.source.sourceId),
  );
  return [...unseen, ...reused].slice(0, questionCount);
}

function uniqueSimplyReferenceSources(
  references: readonly NormalizedSourceReference[],
): readonly NormalizedSourceReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const sourceId = reference.source.sourceId;
    if (seen.has(sourceId)) return false;
    seen.add(sourceId);
    return true;
  });
}

function replaceDuplicateSources(
  selected: NormalizedSourceReference[],
  duplicateSourceIds: ReadonlySet<string>,
  replacementCandidates: NormalizedSourceReference[],
): readonly NormalizedSourceReference[] {
  const retries: NormalizedSourceReference[] = [];
  for (const sourceId of duplicateSourceIds) {
    const selectedIndex = selected.findIndex(
      (reference) => reference.source.sourceId === sourceId,
    );
    if (selectedIndex < 0) continue;
    const replacement = replacementCandidates.shift();
    if (replacement === undefined) {
      retries.push(selected[selectedIndex]);
      continue;
    }
    selected[selectedIndex] = replacement;
    retries.push(replacement);
  }
  return retries;
}

function preserveExplicitSourceOrder(
  references: readonly NormalizedSourceReference[],
  sourceIds: readonly string[],
): readonly NormalizedSourceReference[] {
  const referenceBySourceId = new Map(
    references.map((reference) => [reference.source.sourceId, reference]),
  );
  const seen = new Set<string>();
  return sourceIds.flatMap((sourceId) => {
    if (seen.has(sourceId)) return [];
    seen.add(sourceId);
    const reference = referenceBySourceId.get(sourceId);
    return reference === undefined ? [] : [reference];
  });
}

function simplyReferencePriority(
  reference: NormalizedSourceReference,
): Readonly<{
  combo: number;
  structured: number;
  informationUnits: number;
  conditions: number;
}> {
  const archetype = reference.archetype;
  const sourceText = [reference.stimulus, ...(reference.viewItems ?? [])].join(
    '\n',
  );
  return {
    combo: archetype?.responseMode === 'truth_combination' ? 1 : 0,
    structured: archetype?.shell.requiresStructuredSource ? 1 : 0,
    informationUnits: informationUnitCount(reference),
    conditions: conditionCount(sourceText),
  };
}

function informationUnitCount(reference: NormalizedSourceReference): number {
  const stimulusUnits = reference.stimulus
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter((line) => line !== '').length;
  return stimulusUnits + (reference.viewItems?.length ?? 0);
}

function conditionCount(value: string): number {
  return (
    value.match(/(?:경우|조건|다만|단,|단\s|이면|하면|해야|if|when|unless)/giu)
      ?.length ?? 0
  );
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

export function chunkSimplyReferenceRequests<Value>(
  requests: readonly Value[],
): readonly (readonly Value[])[] {
  const batches: Value[][] = [];
  for (
    let start = 0;
    start < requests.length;
    start += MAX_SIMPLY_REFERENCE_BATCH_SIZE
  ) {
    batches.push(
      requests.slice(start, start + MAX_SIMPLY_REFERENCE_BATCH_SIZE),
    );
  }
  return batches;
}

function extractStimulusSchema(
  fullSchema: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (fullSchema === null) return null;
  const props = fullSchema.properties;
  if (!isRecord(props)) return null;
  const rr = props.render_ready;
  if (!isRecord(rr)) return null;
  const rrProps = rr.properties;
  if (!isRecord(rrProps)) return null;
  const sd = rrProps.stimulus_data;
  return isRecord(sd) ? sd : null;
}
function buildSimplyReferencePrompt(
  references: readonly NormalizedSourceReference[],
  difficulty: Difficulty,
  isRepair: boolean,
  customPrompt?: string,
  generationNonce?: string,
): string {
  return JSON.stringify({
    task: 'Generate one new question for each reference source.',
    attempt: isRepair ? 'repair' : 'initial',
    count: references.length,
    difficulty,
    generationNonce: generationNonce ?? null,
    difficultyContract: difficultyContract(difficulty),
    customInstruction: customPrompt?.trim() || null,
    requirements: [
      'Preserve each reference format, response mechanism, material layout, and reasoning topology.',
      'Preserve the source subject matter, decision facts, material data, quantities, conditions, and answer logic. Rephrase only where this does not change those facts or the reasoning needed for the answer.',
      'Do not introduce unrelated subject matter, figures, comparison criteria, or answer logic.',
      'Use each sourceId and sourceHash exactly once and unchanged.',
      'Return exactly five choices prefixed in order with ①, ②, ③, ④, ⑤.',
      'Encode stimulusData as one valid JSON object string in stimulusDataJson.',
      'selectedTemplate is mandatory: stimulusDataJson must satisfy that exact template schema. Never substitute another template or plain text; omit the source instead when it cannot be satisfied.',
      'Ensure the explanation proves the correct answer and explains why every distractor is wrong.',
      'For combo sources, put every ㄱㄴㄷ claim only in comboBlock, never in questionStem or stimulusDataJson, and preserve the supplied key order exactly.',
      'For comparative matrix sources, use only headers and cell values grounded in the source stimulus, and preserve the source decision facts.',
      'When matrixGroundingTerms is nonempty, preserve at least one of those source terms in the comparative matrix stimulus data.',
      'When generationNonce is present, use it only to vary phrasing and presentation while keeping all source facts, quantities, conditions, decision facts, and answer logic faithful.',
    ],
    response: {
      exactCount: references.length,
      wrapper: 'questions',
      fields: [
        'sourceId',
        'sourceHash',
        'questionStem',
        'stimulusDataJson',
        'comboBlock',
        'choices',
        'correctAnswer',
        'explanation',
      ],
    },
    sources: references.map((reference) => {
      const selectedTemplate = sourceTemplate(reference);
      return {
        sourceId: reference.source.sourceId,
        sourceHash: reference.source.sourceHash,
        unitNumber: reference.unitNumber,
        targetConcept: reference.target.primaryConcept,
        selectedTemplate,
        tplDescription:
          selectedTemplate === null
            ? null
            : getTplDescription(selectedTemplate),
        tplSchema: extractStimulusSchema(
          selectedTemplate === null
            ? null
            : (getTplSchema(selectedTemplate)?.schema ?? null),
        ),
        stem: reference.stem,
        stimulus: reference.stimulus,
        matrixGroundingTerms: matrixGroundingTerms(reference),
        viewItems: reference.viewItems ?? [],
        viewBlock: {
          required: referenceViewKeys(reference).length > 0,
          itemCount: referenceViewKeys(reference).length,
          keys: referenceViewKeys(reference),
        },
        choices: reference.choices,
      };
    }),
  });
}

function parseSimplyReferenceBatch(
  content: string,
  references: readonly NormalizedSourceReference[],
  difficulty: Difficulty,
  batchOrdinal: number,
  generationNonce: string,
): SimplyReferenceBatchParseResult {
  console.log('[SIMPLY_REF_DEBUG] parseSimplyReferenceBatch', {
    batchOrdinal,
    contentLength: content.length,
    refCount: references.length,
    contentPreview:
      content.length > 200 ? content.slice(0, 200) + '...' : content,
  });
  const parsed = parseResponse(content);
  if (parsed === null) {
    console.log('[SIMPLY_REF_DEBUG] parseResponse returned null');
    return { drafts: [], unresolved: references };
  }
  console.log('[SIMPLY_REF_DEBUG] parseResponse success', {
    questionCount: parsed.length,
  });
  const referenceBySourceId = new Map(
    references.map((reference) => [reference.source.sourceId, reference]),
  );
  const draftBySourceId = new Map<string, SimplyReferenceGeneratedDraft>();
  const duplicatedSourceIds = new Set<string>();
  for (const raw of parsed) {
    const draft = parseQuestion(
      raw,
      referenceBySourceId,
      difficulty,
      batchOrdinal,
      generationNonce,
    );
    if (draft === null) continue;
    const sourceId = draft.lineage.source.sourceId;
    if (draftBySourceId.has(sourceId)) {
      duplicatedSourceIds.add(sourceId);
      draftBySourceId.delete(sourceId);
      continue;
    }
    if (!duplicatedSourceIds.has(sourceId)) {
      draftBySourceId.set(sourceId, draft);
    }
  }
  return {
    drafts: references.flatMap((reference) => {
      const draft = draftBySourceId.get(reference.source.sourceId);
      return draft === undefined ? [] : [draft];
    }),
    unresolved: references.filter(
      (reference) => !draftBySourceId.has(reference.source.sourceId),
    ),
  };
}

function parseResponse(content: string): readonly unknown[] | null {
  console.log('[SIMPLY_REF_DEBUG] parseResponse input length:', content.length);
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) {
      console.log(
        '[SIMPLY_REF_DEBUG] parsed is not a record, type:',
        typeof parsed,
      );
      return null;
    }
    if (!Array.isArray(parsed.questions)) {
      console.log(
        '[SIMPLY_REF_DEBUG] parsed.questions is not an array, keys:',
        Object.keys(parsed),
      );
      return null;
    }
    return parsed.questions;
  } catch (err) {
    console.log(
      '[SIMPLY_REF_DEBUG] JSON.parse threw:',
      String(err).slice(0, 200),
    );
    return null;
  }
}

function parseQuestion(
  value: unknown,
  referenceBySourceId: ReadonlyMap<string, NormalizedSourceReference>,
  difficulty: Difficulty,
  batchOrdinal: number,
  generationNonce: string,
): SimplyReferenceGeneratedDraft | null {
  if (!isRecord(value)) {
    console.log(
      '[SIMPLY_REF_DEBUG] parseQuestion: value not a record, type:',
      typeof value,
    );
    return null;
  }
  const renderReady = isRecord(value.render_ready) ? value.render_ready : value;
  const sourceId = text(value.sourceId) ?? text(value.source_id);
  const sourceHash = text(value.sourceHash) ?? text(value.source_hash);
  const questionStem =
    text(value.questionStem) ?? text(renderReady.question_stem);
  const stimulusData =
    parseJsonRecord(value.stimulusDataJson) ??
    (isRecord(value.stimulusData) ? value.stimulusData : undefined) ??
    (isRecord(renderReady.stimulus_data)
      ? renderReady.stimulus_data
      : undefined);
  const choices =
    stringList(value.choices) ?? stringList(renderReady.options_list);
  const explanation =
    text(value.explanation) ??
    (isRecord(value.explanation) ? text(value.explanation.judgment) : null);
  const correctAnswer =
    typeof value.correctAnswer === 'number'
      ? value.correctAnswer
      : value.correct_answer;
  const ref: NormalizedSourceReference | undefined =
    sourceId === null ? undefined : referenceBySourceId.get(sourceId);
  const sid = text(value.sourceId) ?? text(value.source_id) ?? 'unknown';
  if (ref === undefined) {
    console.log(
      '[SIMPLY_REF_DEBUG] parseQuestion: reference not found, sourceId:',
      sid,
    );
    return null;
  }
  if (sourceHash !== ref.source.sourceHash) {
    console.log(
      '[SIMPLY_REF_DEBUG] parseQuestion: hash mismatch, sourceId:',
      sid,
    );
    return null;
  }
  if (questionStem === null) {
    console.log(
      '[SIMPLY_REF_DEBUG] parseQuestion: no questionStem, sourceId:',
      sid,
    );
    return null;
  }
  if (explanation === null) {
    console.log(
      '[SIMPLY_REF_DEBUG] parseQuestion: no explanation, sourceId:',
      sid,
    );
    return null;
  }
  if (stimulusData === undefined) {
    console.log(
      '[SIMPLY_REF_DEBUG] parseQuestion: no stimulusData, sourceId:',
      sid,
      'stimulusDataJson:',
      String(value.stimulusDataJson).slice(0, 100),
    );
    return null;
  }
  if (choices === null) {
    console.log('[SIMPLY_REF_DEBUG] parseQuestion: no choices, sourceId:', sid);
    return null;
  }
  if (choices.length !== 5) {
    console.log(
      '[SIMPLY_REF_DEBUG] parseQuestion: choices not 5, len:',
      choices.length,
      'sourceId:',
      sid,
    );
    return null;
  }
  if (
    choices.some(
      (choice, index) =>
        !choice.startsWith(['①', '②', '③', '④', '⑤'][index] ?? ''),
    )
  ) {
    console.log(
      '[SIMPLY_REF_DEBUG] parseQuestion: choices wrong prefix, sourceId:',
      sid,
      'choices:',
      choices,
    );
    return null;
  }
  if (!isAnswer(correctAnswer)) {
    console.log(
      '[SIMPLY_REF_DEBUG] parseQuestion: invalid answer, sourceId:',
      sid,
      'answer:',
      correctAnswer,
    );
    return null;
  }
  if (isAnswer(ref.correctAnswer) && correctAnswer !== ref.correctAnswer) {
    console.log('[SIMPLY_REF_DEBUG] parseQuestion: official answer mismatch', {
      sourceId: sid,
      expected: ref.correctAnswer,
      actual: correctAnswer,
    });
    return null;
  }
  if (hasDuplicateChoices(choices)) {
    console.log('[SIMPLY_REF_DEBUG] parseQuestion: duplicate choices', {
      sourceId: sid,
    });
    return null;
  }
  const selectedTemplate = sourceTemplate(ref);
  if (selectedTemplate === null) {
    console.log('[SIMPLY_REF_DEBUG] parseQuestion: selectedTemplate is null');
    return null;
  }
  const bestTemplate = pickBestTemplate(selectedTemplate, stimulusData);
  if (bestTemplate === null) {
    console.log(
      '[SIMPLY_REF_DEBUG] parseQuestion: no template matched, tried:',
      selectedTemplate,
      'detected:',
      normalizer.detectTpl(stimulusData),
      'stimulusKeys:',
      Object.keys(stimulusData),
    );
    return null;
  }
  if (bestTemplate !== selectedTemplate) {
    console.log('[SIMPLY_REF_DEBUG] parseQuestion: template overridden', {
      from: selectedTemplate,
      to: bestTemplate,
    });
  }
  if (isStructuredTplName(bestTemplate)) {
    const factGrounding = validateReferenceFactGrounding({
      source: ref,
      template: bestTemplate,
      stimulusData,
    });
    if (factGrounding.kind === 'rejected') {
      console.log('[SIMPLY_REF_DEBUG] parseQuestion: fact grounding failed', {
        sourceId: sid,
        missingTerms: factGrounding.missingTerms,
      });
      return null;
    }
  }
  const comboBlock = parseComboBlock(
    value.comboBlock ?? value.combo_block ?? renderReady.combo_block,
  );
  if (comboBlock === undefined) {
    console.log('[SIMPLY_REF_DEBUG] parseQuestion: comboBlock parse failed');
    return null;
  }
  if (!matchesReferenceViewBlock(ref, comboBlock)) {
    console.log(
      '[SIMPLY_REF_DEBUG] parseQuestion: matchesReferenceViewBlock failed, expected keys:',
      referenceViewKeys(ref),
      'got:',
      comboBlock === null ? 'null' : comboBlock.items.map((i) => i.key),
    );
    return null;
  }
  if (hasDuplicatedComboClaim(questionStem, comboBlock)) {
    console.log('[SIMPLY_REF_DEBUG] parseQuestion: hasDuplicatedComboClaim');
    return null;
  }
  return {
    result: {
      metadata: {
        unit_name: `${ref.unitNumber}단원`,
        target_concept: ref.target.primaryConcept,
        item_type: 'simply_reference',
        difficulty,
        recommended_template: bestTemplate,
      },
      render_ready: {
        question_stem: (questionStem ?? '').replace(/^\d+\.\s*/, ''),
        stimulus_data: stimulusData,
        options_list: choices,
        combo_block: comboBlock,
      },
      explanation: { judgment: explanation },
      correct_answer: correctAnswer,
    },
    lineage: {
      generationPath: 'simply_reference',
      generationNonce,
      source: ref.source,
      batchOrdinal,
      selectedTemplate,
      adapterVersion: 0,
      validation: 'passed',
    },
  };
}

export type SimplyReferenceVisibleQuestion = Readonly<{
  comboBlock: SimplyReferenceGeneratedDraft['result']['render_ready']['combo_block'];
  optionsList: readonly string[];
  questionStem: string;
  stimulusData: Record<string, unknown>;
}>;

export function simplyReferenceFingerprint(
  question: SimplyReferenceVisibleQuestion,
): string {
  return stableHash(
    JSON.stringify({
      questionStem: question.questionStem.trim(),
      stimulusData: question.stimulusData,
      options: question.optionsList.map((choice) => choice.trim()),
      comboBlock: question.comboBlock,
    }),
  );
}

function retainNovelSimplyReferenceDrafts(
  drafts: readonly SimplyReferenceGeneratedDraft[],
  seenFingerprints: Set<string>,
): Readonly<{
  drafts: readonly SimplyReferenceGeneratedDraft[];
  duplicateSourceIds: readonly string[];
}> {
  const accepted: SimplyReferenceGeneratedDraft[] = [];
  const duplicateSourceIds: string[] = [];
  for (const draft of drafts) {
    const fingerprint = simplyReferenceFingerprint({
      questionStem: draft.result.render_ready.question_stem,
      stimulusData: draft.result.render_ready.stimulus_data,
      optionsList: draft.result.render_ready.options_list,
      comboBlock: draft.result.render_ready.combo_block,
    });
    if (seenFingerprints.has(fingerprint)) {
      duplicateSourceIds.push(draft.lineage.source.sourceId);
      continue;
    }
    seenFingerprints.add(fingerprint);
    accepted.push(draft);
  }
  return { drafts: accepted, duplicateSourceIds };
}

function hasDuplicatedComboClaim(
  questionStem: string,
  comboBlock: SimplyReferenceGeneratedDraft['result']['render_ready']['combo_block'],
): boolean {
  if (comboBlock === null) return false;
  const hasComboMarkers = /[ㄱ-ㅎ]\s*[.．]/u.test(questionStem);
  if (hasComboMarkers) return true;
  const normalizedStem = normalizeClaimText(questionStem);
  const MIN_MATCH_CHARS = 1;
  return comboBlock.items.some(({ text }) => {
    const normalized = normalizeClaimText(text);
    return (
      normalized.length >= MIN_MATCH_CHARS &&
      normalizedStem.includes(normalized)
    );
  });
}

function normalizeClaimText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function parseComboBlock(
  value: unknown,
):
  | SimplyReferenceGeneratedDraft['result']['render_ready']['combo_block']
  | undefined {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return undefined;
  }
  const title = text(value.title);
  if (title === null) return undefined;
  const items = value.items.map((item) => {
    if (!isRecord(item)) return null;
    const key = text(item.key);
    const itemText = text(item.text);
    return key === null || itemText === null ? null : { key, text: itemText };
  });
  return items.some((item) => item === null)
    ? undefined
    : { title, items: items.filter(isPresent) };
}

function catalogReferencePayload(
  row: Pick<ReferenceQuestion, 'sourcePayload' | 'unitNumber'>,
): Readonly<Record<string, unknown>> {
  const sourcePayload = row.sourcePayload.source;
  const source = isRecord(sourcePayload) ? { ...sourcePayload } : {};
  if (Number.isInteger(row.unitNumber) && row.unitNumber > 0) {
    source.unitNumber = row.unitNumber;
  }
  return { ...row.sourcePayload, source };
}

/**
 * Shared-passage questions (e.g. "[16~17]" on an exam paper) can have an
 * empty `stimulus` while the preceding question holds the shared passage.
 * Without stimulus the question cannot be parsed, so propagate the
 * preceding stimulus forward within the same source (filename + unitNumber).
 */
function propagateSharedPassageStimuli(
  payloads: readonly Readonly<Record<string, unknown>>[],
): readonly Readonly<Record<string, unknown>>[] {
  // Propagate the most recent non-empty stimulus within each source file.
  const prevStimulusBySource = new Map<string, string>();
  return payloads.map((p) => {
    const source = isRecord(p.source) ? p.source : null;
    const fn =
      source !== null && typeof source.filename === 'string'
        ? source.filename
        : null;
    const s = typeof p.stimulus === 'string' ? p.stimulus.trim() : '';
    if (s !== '' && fn !== null) {
      prevStimulusBySource.set(fn, s);
      return p;
    }
    if (s === '' && fn !== null) {
      const inherited = prevStimulusBySource.get(fn);
      if (inherited !== undefined && inherited !== '') {
        return { ...p, stimulus: inherited };
      }
    }
    return p;
  });
}

function catalogSubjects(subjectSlug: string): readonly string[] {
  if (subjectSlug === 'success') return ['success', 'sungjik'];
  if (subjectSlug === 'industry') return ['industry', 'kongil'];
  return [subjectSlug];
}

function subjectStyle(subjectSlug: string): SubjectStyle {
  if (subjectSlug === 'success') return 'success';
  if (subjectSlug === 'industry' || subjectSlug === 'kongil') return 'kongil';
  throw new InternalServerErrorException(
    `Unsupported reference subject: ${subjectSlug}`,
  );
}

function simplyReferenceResponseFormat(
  references: readonly NormalizedSourceReference[],
) {
  return {
    type: 'json_schema' as const,
    json_schema: {
      name: 'simply_reference_questions',
      strict: true as const,
      schema: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sourceId: {
                  type: 'string',
                  enum: references.map(
                    (reference) => reference.source.sourceId,
                  ),
                },
                sourceHash: {
                  type: 'string',
                  enum: references.map(
                    (reference) => reference.source.sourceHash,
                  ),
                },
                questionStem: { type: 'string' },
                stimulusDataJson: { type: 'string' },
                comboBlock: simplyReferenceComboBlockSchema(references),
                choices: {
                  type: 'array',
                  items: { type: 'string' },
                },
                correctAnswer: {
                  type: 'integer',
                  enum: [1, 2, 3, 4, 5],
                },
                explanation: { type: 'string' },
              },
              required: [
                'sourceId',
                'sourceHash',
                'questionStem',
                'stimulusDataJson',
                'comboBlock',
                'choices',
                'correctAnswer',
                'explanation',
              ],
              additionalProperties: false,
            },
          },
        },
        required: ['questions'],
        additionalProperties: false,
      },
    },
  };
}

function simplyReferenceComboBlockSchema(
  references: readonly NormalizedSourceReference[],
): Record<string, unknown> {
  const objectSchema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['key', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'items'],
    additionalProperties: false,
  };
  const viewRequirements = references.map(
    (reference) => referenceViewKeys(reference).length > 0,
  );
  if (viewRequirements.every((required) => required)) return objectSchema;
  if (viewRequirements.every((required) => !required)) return { type: 'null' };
  return { anyOf: [{ type: 'null' }, objectSchema] };
}

function matchesReferenceViewBlock(
  reference: NormalizedSourceReference,
  comboBlock: SimplyReferenceGeneratedDraft['result']['render_ready']['combo_block'],
): boolean {
  const expectedKeys = referenceViewKeys(reference);
  if (expectedKeys.length === 0) return comboBlock === null;
  return (
    comboBlock !== null &&
    comboBlock.items.length === expectedKeys.length &&
    comboBlock.items.every((item, index) => item.key === expectedKeys[index])
  );
}

function referenceViewKeys(
  reference: NormalizedSourceReference,
): readonly string[] {
  const fallbackKeys = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ'] as const;
  return (reference.viewItems ?? []).map((item, index) => {
    const matched = item.trim().match(/^([ㄱ-ㅎ])(?:[.\s]|$)/u)?.[1];
    return matched ?? fallbackKeys[index] ?? String(index + 1);
  });
}

function isSourcePreservingEligible(
  reference: NormalizedSourceReference,
): boolean {
  return (
    isAnswer(reference.correctAnswer) &&
    normalizeOfficialChoices(reference.choices) !== null &&
    sourceComboBlock(reference) !== undefined &&
    sourcePreservingRender(reference) !== null
  );
}

function sourcePreservingDraft(
  reference: NormalizedSourceReference,
  difficulty: Difficulty,
  generationNonce: string,
  batchOrdinal: number,
  studyPatternTag?: Readonly<{ examPatternId: string; questionFormat: string }>,
): SimplyReferenceGeneratedDraft {
  const options = normalizeOfficialChoices(reference.choices);
  const comboBlock = sourceComboBlock(reference);
  // Prefer cached LLM-converted TPL data over adapter output.
  const cachedData = reference.tplStimulusData;
  const render =
    cachedData !== undefined &&
    validateSimplyReferenceStructuredTpl(
      sourceTemplate(reference) ?? 'TPL_ARTICLE',
      cachedData,
    )
      ? {
          template: sourceTemplate(reference) ?? 'TPL_ARTICLE',
          stimulusData: cachedData,
        }
      : sourcePreservingRender(reference);
  if (
    !isAnswer(reference.correctAnswer) ||
    options === null ||
    comboBlock === undefined ||
    render === null
  ) {
    throw sourceReextractionRequired(1, 0);
  }
  return {
    result: {
      metadata: {
        unit_name: `${reference.unitNumber}단원`,
        target_concept: reference.target.primaryConcept,
        item_type: 'simply_reference',
        difficulty,
        recommended_template: render.template,
      },
      render_ready: {
        question_stem: reference.stem.replace(/^\d+\.\s*/, ''),
        stimulus_data: render.stimulusData,
        options_list: options,
        combo_block: comboBlock,
      },
      explanation: {
        judgment:
          reference.explanation ??
          `공식 정답: ${['①', '②', '③', '④', '⑤'][reference.correctAnswer - 1]}`,
      },
      correct_answer: reference.correctAnswer,
    },
    lineage: {
      generationPath: 'simply_reference',
      generationNonce,
      source: reference.source,
      batchOrdinal,
      selectedTemplate: render.template,
      ...(studyPatternTag === undefined ? {} : studyPatternTag),
      ...(studyPatternTag === undefined
        ? {}
        : { sourceReferenceIds: [reference.source.sourceId] }),
      adapterVersion: SOURCE_PRESERVING_ADAPTER_VERSION,
      validation: 'passed',
    },
  };
}

function sourceComboBlock(
  reference: NormalizedSourceReference,
):
  | SimplyReferenceGeneratedDraft['result']['render_ready']['combo_block']
  | undefined {
  const viewItems = reference.viewItems ?? [];
  if (viewItems.length === 0) return null;
  const keys = referenceViewKeys(reference);
  const items = viewItems.map((item, index) => {
    const key = keys[index];
    const text = normalizeComboItemText(item);
    return key === undefined || text === '' ? null : { key, text };
  });
  return items.some((item) => item === null)
    ? undefined
    : { title: '<보기>', items: items.filter(isPresent) };
}

function normalizeOfficialChoices(
  choices: readonly string[],
): readonly string[] | null {
  if (choices.length !== 5) return null;
  const numerals = ['①', '②', '③', '④', '⑤'] as const;
  const normalized = choices.map((choice, index) => {
    const content = choice
      .trim()
      .replace(/^[①②③④⑤]\s*/u, '')
      .trim();
    return content === '' ? null : `${numerals[index]} ${content}`;
  });
  return normalized.some((choice) => choice === null) ||
    hasDuplicateChoices(normalized.filter(isPresent))
    ? null
    : normalized.filter(isPresent);
}

function hasDuplicateChoices(choices: readonly string[]): boolean {
  const normalized = choices.map((choice) =>
    choice
      .replace(/^[①②③④⑤]\s*/u, '')
      .replace(/\s+/gu, ' ')
      .trim(),
  );
  return new Set(normalized).size !== normalized.length;
}

function normalizeComboItemText(value: string): string {
  return value
    .trim()
    .replace(/^[ㄱ-ㅎ][.．]?\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function pickBestTemplate(
  selected: StructuredTplName,
  data: Record<string, unknown>,
): StructuredTplName | null {
  return validateSimplyReferenceStructuredTpl(selected, data) ? selected : null;
}

const TPL_DESCRIPTIONS: Record<string, string> = {
  TPL_ANNOUNCEMENT:
    '안내문/공고 형식. 채용, 행사 등의 정보를 항목별로 안내합니다.',
  TPL_ARTICLE:
    '일반 기사/서사 형식. 제목, 출처, 본문 문단으로 구성된 연속적인 글입니다.',
  TPL_CASE_DIAGNOSTIC_FRAME:
    '사례 분석 형식. 특정 인물이나 기업의 사례를 서사로 제시하고 진단합니다.',
  TPL_COMPARATIVE_MATRIX:
    '비교 표 형식. 행(row)별로 비교 항목, 열(column)별로 비교 기준을 나타냅니다.',
  TPL_CONVERSATIONAL_FLOW:
    '대화 형식. 두 명 이상의 참여자가 주고받는 대화를 제시합니다.',
  TPL_DIGITAL_FORUM_INTERFACE:
    '인터넷 게시판 형식. 게시글과 댓글로 구성된 온라인 토론을 제시합니다.',
  TPL_FORMAL_DOCUMENT:
    '공식 문서 형식. 계약서, 증명서, 규정 등 문서 형태로 제시합니다.',
  TPL_INCIDENT_REPORT:
    '사고/안전 보고서 형식. 사고 개요, 원인, 결과, 예방 대책을 구조화하여 제시합니다.',
  TPL_INSTRUCTIONAL_SCENE:
    '수업 장면 형식. 강사의 설명과 칠판 자료를 함께 제시합니다.',
  TPL_PROMOTIONAL_CANVAS:
    '광고/홍보물 형식. 슬로건과 핵심 포인트로 구성된 홍보 자료입니다.',
  TPL_QUANTITATIVE_CHART:
    '데이터 차트 형식. 그래프나 차트로 수치 데이터를 시각화합니다.',
  TPL_REPORT:
    '보고서/분석서 형식. 섹션별 설명과 임베디드 표를 포함한 복합 보고서입니다.',
  TPL_SEQUENTIAL_WORKFLOW:
    '단계별 작업 흐름 형식. 절차나 과정을 순서대로 나열합니다.',
  TPL_STATISTICS:
    '데이터/통계 요약 형식. 항목별 수치 데이터를 리스트로 제시합니다.',
};

function getTplDescription(template: StructuredTplName): string | null {
  return TPL_DESCRIPTIONS[template] ?? null;
}

function difficultyContract(difficulty: Difficulty): readonly string[] {
  switch (difficulty) {
    case Difficulty.LOW:
      return [
        'Assess one core concept with one directly usable source clue.',
        'Use distractors that are clearly distinguishable after applying the core concept.',
      ];
    case Difficulty.MIDDLE:
      return [
        'Require comparison of at least two independent source clues.',
        'Make at least one distractor reflect a common misconception or omitted condition.',
      ];
    case Difficulty.HIGH:
    case Difficulty.INTERGRATE:
      return [
        'Require integration of at least three source clues and two conditions or exceptions.',
        'Make every distractor plausible but disproved by a specific condition in the material.',
      ];
  }
}

function parseJsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function invalidOutput(
  reason: string,
  failedSourceIds: readonly string[] = [],
): InternalServerErrorException {
  return new InternalServerErrorException({
    code:
      reason === 'VARIANT_EXHAUSTED'
        ? 'SIMPLY_REFERENCE_VARIANT_EXHAUSTED'
        : 'SIMPLY_REFERENCE_GENERATION_INVALID_OUTPUT',
    reason,
    failedSourceCount: failedSourceIds.length,
    failedSourceIds,
  });
}

function sourceReextractionRequired(
  requestedReferenceCount: number,
  availableReferenceCount: number,
): InternalServerErrorException {
  return new InternalServerErrorException({
    code: 'REFERENCE_SOURCE_REEXTRACTION_REQUIRED',
    requestedReferenceCount,
    availableReferenceCount,
    message:
      '공식 정답과 완전한 원문 자료가 확인된 기출 문항이 부족합니다. 정답지를 포함해 원본을 재추출하세요.',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function stringList(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : null;
}

function isAnswer(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

function conceptsMatchFuzzy(
  concept: string,
  textbookConcepts: ReadonlySet<string>,
): boolean {
  const norm = (s: string): string => s.replace(/\s+/g, '');
  const sourceNorm = norm(concept);
  for (const tc of textbookConcepts) {
    const tcNorm = norm(tc);
    if (
      sourceNorm === tcNorm ||
      sourceNorm.includes(tcNorm) ||
      tcNorm.includes(sourceNorm)
    ) {
      return true;
    }
  }
  const sourceTokens = concept.split(/\s+/).filter(Boolean);
  for (const tc of textbookConcepts) {
    const tcTokens = tc.split(/\s+/).filter(Boolean);
    for (const st of sourceTokens) {
      for (const tt of tcTokens) {
        if (st === tt) return true;
      }
    }
  }
  return false;
}

function conceptValidUnitMap(
  unitConcepts: readonly UnitConcepts[],
): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  for (const unit of unitConcepts) {
    const unitNum = Number(unit.unitName.replace(/[^0-9]/g, ''));
    if (Number.isFinite(unitNum) && unitNum > 0) {
      map.set(unitNum, new Set(unit.concepts));
    }
  }
  return map;
}

function isPresent<Value>(value: Value | null): value is Value {
  return value !== null;
}

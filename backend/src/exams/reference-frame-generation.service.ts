import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Between, In, type Repository } from 'typeorm';
import { Difficulty } from '../entities/exam-record.entity';
import { ReferenceQuestion } from '../entities/reference-question.entity';
import { ReferenceFrameCache } from '../entities/reference-frame-cache.entity';
import { getOpenAIClient } from '../lib/openai-keys';
import { TextbookService } from '../textbook/textbook.service';
import {
  ExamRegeneratorService,
  type ReferenceGenerationClient,
  type ReferenceVariantGenerationRequest,
  type ReferenceVariantGenerationExecution,
  type ReferenceVariantGenerationResult,
} from './exam-regenerator.service';
import type { ExamGenerationProgressReporter } from './exam-generation.utils';
import { ReferenceFramePlannerService } from './reference-frame-planner.service';
import type { PlannerReasonCode } from './reference-frame-planner.types';
import {
  buildReferenceFidelitySpec,
  REFERENCE_FIDELITY_SPEC_VERSION,
} from './reference-fidelity-spec';
import {
  ReferenceConceptCatalogResolver,
  reconcileReferenceConceptCatalog,
} from './reference-concept-catalog-resolver';
import type { ReferenceFramePlannerClient } from './reference-frame-planner.types';
import { referenceGenerationModel } from './reference-generation-model';
import { selectReferences } from './reference-selector.service';
import { DEFAULT_DISTRACTOR_AXES } from './reference-selector.service';
import { parseReference } from './reference-selector.utils';
import { classifyReferenceArchetype } from './reference-archetype';
import {
  REFERENCE_ARCHETYPE_VERSION,
  type ReferenceArchetype,
} from './reference-archetype';
import type {
  ReferenceFrame,
  ReferenceFrameGenerationLineage,
  SourceIdentity,
  SubjectStyle,
  UnitRange,
} from './reference-frame.types';
import type { NormalizedSourceReference } from './reference-selector.types';
import {
  ReferenceJobDeadlineAdmissionError,
  type ReferenceJobDeadline,
} from './reference-job-deadline';
import {
  reconcileReferenceCandidateOutcomes,
  referenceGenerationFailureDisposition,
  resolveReferenceGenerationWorkBudget,
  type ReferenceCandidateOutcome,
  type ReferenceGenerationFailureKind,
  type ReferenceGenerationWorkBudgetOptions,
} from './reference-generation-budget';

const REFERENCE_FRAME_CACHE_VERSION =
  REFERENCE_ARCHETYPE_VERSION * 100 + REFERENCE_FIDELITY_SPEC_VERSION;

type ReferenceFrameCacheContext = Readonly<{
  source: SourceIdentity;
  subject: SubjectStyle;
  unitRange: UnitRange;
  archetype: ReferenceArchetype;
}>;

function reusableCachedFrame(
  cache: ReferenceFrameCache | null | undefined,
  context: ReferenceFrameCacheContext,
): ReferenceFrame | undefined {
  if (
    cache === null ||
    cache === undefined ||
    cache.contractVersion !== REFERENCE_FRAME_CACHE_VERSION ||
    cache.archetypeFingerprint !== context.archetype.fingerprint
  ) {
    return undefined;
  }

  const cachedArchetype = cache.frame.archetype;
  if (
    cachedArchetype === undefined ||
    cachedArchetype.version !== REFERENCE_ARCHETYPE_VERSION ||
    cachedArchetype.fingerprint !== context.archetype.fingerprint
  ) {
    return undefined;
  }

  if (
    !sameSource(cache.frame.source, context.source) ||
    cache.frame.subject !== context.subject ||
    !sameRange(cache.frame.unitRange, context.unitRange)
  ) {
    return undefined;
  }

  return { ...cache.frame, archetype: context.archetype };
}

function sameSource(left: SourceIdentity, right: SourceIdentity): boolean {
  return (
    left.sourceId === right.sourceId && left.sourceHash === right.sourceHash
  );
}

function sameRange(left: UnitRange, right: UnitRange): boolean {
  return left.start === right.start && left.end === right.end;
}

function selectedReferenceArchetype(reference: NormalizedSourceReference) {
  const archetype = classifyReferenceArchetype({
    stem: reference.stem,
    stimulus: reference.stimulus,
    viewItems: reference.viewItems ?? [],
    choices: reference.choices,
    targetConcepts: reference.target.concepts,
  });
  if (archetype.kind !== 'classified') {
    throw new Error('Unreachable archetype.');
  }

  return archetype.value;
}

export type ReferenceFrameGeneratedDraft = Readonly<{
  result: ReferenceVariantGenerationResult;
  lineage: ReferenceFrameGenerationLineage;
  cacheMutation?: ReferenceFrameCacheMutation;
}>;

export type ReferenceFrameCacheMutation = Readonly<{
  id?: string;
  sourceId: string;
  sourceHash: string;
  model: string;
  contractVersion: number;
  archetypeFingerprint: string;
  frame: ReferenceFrame;
}>;

export type ReferenceFrameGenerationDependencies = Readonly<{
  readReferences?: (
    subjectSlug: string,
    startUnitNum: number,
    endUnitNum: number,
  ) => readonly unknown[] | Promise<readonly unknown[]>;
  createPlannerClient: () => ReferenceFramePlannerClient;
  createRegeneratorClient?: () => ReferenceGenerationClient;
}>;

export type ReferenceFrameGenerationOptions = Readonly<{
  deadline?: ReferenceJobDeadline;
  reportProgress?: ExamGenerationProgressReporter;
  replacementAllowance?: ReferenceGenerationWorkBudgetOptions['replacementAllowance'];
  candidateConcurrency?: unknown;
}>;

type ReferenceCandidateExecutionResult = Readonly<{
  outcome: ReferenceCandidateOutcome;
  plannerAttempted: boolean;
  draft?: ReferenceFrameGeneratedDraft;
}>;

export type ReferenceCatalogReader = Pick<
  Repository<ReferenceQuestion>,
  'find'
>;

export const REFERENCE_FRAME_GENERATION_DEPENDENCIES =
  'REFERENCE_FRAME_GENERATION_DEPENDENCIES';

@Injectable()
export class ReferenceFrameGenerationService {
  constructor(
    private readonly textbookService: TextbookService,
    private readonly regeneratorService: ExamRegeneratorService,
    @Optional()
    @Inject(REFERENCE_FRAME_GENERATION_DEPENDENCIES)
    dependencies?: ReferenceFrameGenerationDependencies,
    @Optional()
    @InjectRepository(ReferenceQuestion)
    private readonly catalogReader?: ReferenceCatalogReader,
    @Optional()
    @InjectRepository(ReferenceFrameCache)
    private readonly frameCacheRepo?: Repository<ReferenceFrameCache>,
  ) {
    this.dependencies = dependencies ?? {
      createPlannerClient: () => getOpenAIClient(),
      createRegeneratorClient: () =>
        getOpenAIClient() as ReferenceGenerationClient,
    };
  }

  private readonly dependencies: ReferenceFrameGenerationDependencies;

  async generate(
    subjectSlug: string,
    startUnitNum: number,
    endUnitNum: number,
    difficulty: Difficulty,
    questionCount: number,
    targetConcepts?: readonly string[],
    sourceIds?: readonly string[],
    options?: ReferenceFrameGenerationOptions,
  ): Promise<readonly ReferenceFrameGeneratedDraft[]> {
    const subject = subjectStyle(subjectSlug);
    const unitConcepts = await this.textbookService.getConcepts(
      subjectSlug,
      startUnitNum,
      endUnitNum,
    );
    const textbookCatalogConcepts = await new ReferenceConceptCatalogResolver(
      this.textbookService,
    ).resolve(subject, startUnitNum, endUnitNum);
    const parsedReferences = await this.readReferences(
      subjectSlug,
      startUnitNum,
      endUnitNum,
    );
    const sourceTargetConcepts = parsedReferences.flatMap((reference) => {
      const parsedReference = parseReference(reference, subject);
      return parsedReference.ok
        ? [parsedReference.value.target.primaryConcept]
        : [];
    });
    const requestedConcepts =
      targetConcepts !== undefined && targetConcepts.length > 0
        ? targetConcepts
        : [
            ...unitConcepts.flatMap((unit) => unit.concepts),
            ...sourceTargetConcepts,
          ];
    const selection = selectReferences({
      subject,
      unitRange: { start: startUnitNum, end: endUnitNum },
      requestedConcepts,
      requestedDistractorAxes: [],
      requestedReferenceCount: questionCount,
      includeAllEligibleReferences: true,
      seed: `${subjectSlug}:${startUnitNum}:${endUnitNum}:${questionCount}`,
      unitConcepts,
      sourceIds,
      ...(targetConcepts === undefined || targetConcepts.length === 0
        ? {}
        : { eligibleReferenceConcepts: targetConcepts }),
      parsedReferences,
    });
    if (selection.kind === 'shortfall') {
      if (selection.shortfall.sourceRejectedCount > 0) {
        throw new InternalServerErrorException({
          code: 'REFERENCE_GENERATION_SHORTFALL',
          requestedCount: questionCount,
          generatedCount: 0,
          stageCounts: {
            source: selection.shortfall.sourceRejectedCount,
            planner: 0,
            fidelity: 0,
          },
        });
      }
      throw new InternalServerErrorException({
        code: 'REFERENCE_SELECTION_SHORTFALL',
        ...selection.shortfall,
      });
    }
    options?.deadline?.assertActive('planner');
    await reportReferenceGenerationMilestone(options, {
      stage: 'selection',
      progress: 15,
      completed: 0,
      total: questionCount,
      attempt: 0,
      maxAttempts: 0,
    });
    let sourceRejectedCount = selection.sourceRejectedCount ?? 0;
    let candidateReferences = selection.references;
    let catalogReconciliation = reconcileReferenceConceptCatalog(
      textbookCatalogConcepts,
      candidateReferences.map((reference) => ({
        sourceId: reference.source.sourceId,
        unit: reference.unitNumber,
        canonicalLabel: reference.target.primaryConcept,
      })),
      subject,
    );
    while (catalogReconciliation.kind === 'ambiguous') {
      const ambiguousSourceId = catalogReconciliation.sourceId;
      sourceRejectedCount += 1;
      candidateReferences = candidateReferences.filter(
        (reference) => reference.source.sourceId !== ambiguousSourceId,
      );
      catalogReconciliation = reconcileReferenceConceptCatalog(
        textbookCatalogConcepts,
        candidateReferences.map((reference) => ({
          sourceId: reference.source.sourceId,
          unit: reference.unitNumber,
          canonicalLabel: reference.target.primaryConcept,
        })),
        subject,
      );
    }
    const reconciledCatalog = catalogReconciliation;
    const catalogConcepts = reconciledCatalog.catalogConcepts;

    const plannerClient = this.dependencies.createPlannerClient();
    const planner = new ReferenceFramePlannerService({
      client: plannerClient,
      model: referenceGenerationModel(),
      maxAttempts: 3,
      timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS) || 180_000,
      retryDelayMs: 0,
      ...(options?.deadline === undefined
        ? {}
        : { deadline: options.deadline }),
    });
    const planReference = async (
      reference: NormalizedSourceReference,
      requiredSourceTargetConceptId: string,
      archetype: ReferenceArchetype,
      cachedFrame: ReferenceFrameCache | null | undefined,
      cachedFrameForPlanning: ReferenceFrame | undefined,
    ): Promise<ReferenceCandidatePlanResult> => {
      const requiredSourceConceptIds = [requiredSourceTargetConceptId];
      const plannerRequest = {
        subject,
        unitRange: { start: startUnitNum, end: endUnitNum },
        selection,
        reference,
        archetype,
        referenceDistractorAxes: [],
        catalogConcepts,
        requiredSourceConceptIds,
        requiredSourceTargetConceptId,
      };
      const plan = await planner.plan(plannerRequest, cachedFrameForPlanning);
      if (plan.kind === 'rejected') {
        return {
          kind: 'rejected',
          attempts: plan.attempts,
          reason: plan.reason,
        };
      }
      const viewItems = reference.viewItems ?? [];
      const frame = {
        ...plan.frame,
        archetype,
        stem: {
          ...plan.frame.stem,
          style: archetype.stemIntent,
          polarity: archetype.polarity,
        },
        response: {
          mode: archetype.responseMode,
          choiceEncoding: archetype.choiceEncoding,
          choiceCount: archetype.choiceCount,
          viewItemCount: archetype.viewItemCount,
          choiceTopology: archetype.choiceTopology,
          combinationPlan: {
            expectedAnswerCount: archetype.choiceCount,
            optionCount: archetype.choiceCount,
            topology: archetype.choiceTopology,
          },
        },
        shell: archetype.shell,
        informationShape: plan.frame.informationShape,
      };
      const payload = {
        ...plan.payload,
        requiredInformationShape: plan.payload.requiredInformationShape,
      };
      const plannedFrame = {
        ...plan.frame,
        archetype,
      };
      const cacheFrame =
        cachedFrame === null || cachedFrame === undefined
          ? this.frameCacheRepo?.create({
              sourceId: reference.source.sourceId,
              sourceHash: reference.source.sourceHash,
              model: referenceGenerationModel(),
              contractVersion: REFERENCE_FRAME_CACHE_VERSION,
              archetypeFingerprint: archetype.fingerprint,
              frame: plannedFrame,
            })
          : {
              ...cachedFrame,
              model: referenceGenerationModel(),
              contractVersion: REFERENCE_FRAME_CACHE_VERSION,
              archetypeFingerprint: archetype.fingerprint,
              frame: plannedFrame,
            };
      const selectedTemplate = archetype.sourceTemplate;
      const fidelitySpec = buildReferenceFidelitySpec(
        {
          source: reference.source,
          stem: reference.stem,
          stimulus: reference.stimulus,
          viewItems,
          choices: reference.choices,
          targetConcepts: reference.target.concepts,
        },
        archetype,
        {
          structureBlueprint: plannedFrame.structureBlueprint,
          answerPlan: payload.answerPlan,
          targetConceptIds: payload.targetConceptIds,
          allowedTerminology: reference.target.concepts,
        },
      );
      return {
        kind: 'planned',
        request: {
          reference: {
            source: reference.source,
            stem: reference.stem,
            stimulus: reference.stimulus,
            viewItems,
            choices: reference.choices,
            targetConcepts: reference.target.concepts,
          },
          fidelitySpec,
          frame,
          payload,
          catalogConcepts,
          selectedTemplate,
        },
        lineage: {
          generationPath: 'reference_frame',
          source: reference.source,
          archetype,
          frame,
          payload,
          selectedTemplate,
          fidelity: {
            contractVersion: fidelitySpec.version,
            sourceHash: fidelitySpec.source.sourceHash,
            response: fidelitySpec.response,
            density: fidelitySpec.density,
          },
          validation: 'passed',
        },
        ...(cacheFrame === undefined ? {} : { cacheMutation: cacheFrame }),
        attempts: Math.max(plan.attempts.frame, plan.attempts.payload),
      };
    };
    const regeneratorClient =
      this.dependencies.createRegeneratorClient?.() ??
      (getOpenAIClient() as ReferenceGenerationClient);
    const workBudget = resolveReferenceGenerationWorkBudget(questionCount, {
      replacementAllowance: options?.replacementAllowance,
    });
    const candidateConcurrency = referenceCandidateConcurrency(
      options?.candidateConcurrency ??
        process.env.REFERENCE_GENERATION_CONCURRENCY,
    );
    const drafts: ReferenceFrameGeneratedDraft[] = [];
    const candidateOutcomes: ReferenceCandidateOutcome[] = [];
    let plannerCandidateCount = 0;
    const processCandidate = async (
      reference: NormalizedSourceReference,
    ): Promise<ReferenceCandidateExecutionResult> => {
      options?.deadline?.assertActive('planner');
      const requiredSourceTargetConceptId =
        reconciledCatalog.sourceConceptIds.get(reference.source.sourceId);
      if (requiredSourceTargetConceptId === undefined) {
        return { outcome: { kind: 'source' }, plannerAttempted: false };
      }
      const archetype = selectedReferenceArchetype(reference);
      const cachedFrame = await this.frameCacheRepo?.findOneBy({
        sourceId: reference.source.sourceId,
        sourceHash: reference.source.sourceHash,
      });
      const cachedFrameForPlanning = reusableCachedFrame(cachedFrame, {
        source: reference.source,
        subject,
        unitRange: { start: startUnitNum, end: endUnitNum },
        archetype,
      });
      let planned: ReferenceCandidatePlanResult;
      try {
        options?.deadline?.assertProviderAdmission(
          'planner',
          cachedFrameForPlanning === undefined
            ? options.deadline.minimumUsefulBudget('planner')
            : 0,
        );
        planned = await planReference(
          reference,
          requiredSourceTargetConceptId,
          archetype,
          cachedFrame,
          cachedFrameForPlanning,
        );
      } catch (error) {
        if (error instanceof ReferenceJobDeadlineAdmissionError) {
          return { outcome: { kind: 'admission' }, plannerAttempted: true };
        }
        throw error;
      }
      options?.deadline?.assertActive('planner');
      await reportReferenceGenerationMilestone(options, {
        stage: 'planner',
        progress: 35,
        completed: drafts.length,
        total: questionCount,
        attempt: planned.attempts,
        maxAttempts: 3,
      });
      if (planned.kind === 'rejected') {
        const failureKind = referenceGenerationFailureKindForPlannerReason(
          planned.reason,
        );
        if (
          failureKind !== undefined &&
          referenceGenerationFailureDisposition(failureKind) === 'fatal'
        ) {
          throw new InternalServerErrorException({
            code: 'REFERENCE_GENERATION_PROVIDER_FAILURE',
            failureKind,
          });
        }
        return { outcome: { kind: 'planner' }, plannerAttempted: true };
      }
      const results: ReferenceVariantGenerationResult[] = [];
      const execution: ReferenceVariantGenerationExecution = {
        completed: drafts.length,
        total: questionCount,
        ...(options?.deadline === undefined
          ? {}
          : { deadline: options.deadline }),
        ...(options?.reportProgress === undefined
          ? {}
          : { reportProgress: options.reportProgress }),
      };
      try {
        await this.regeneratorService.regenerateReferenceBatch(
          regeneratorClient,
          [{ ...planned.request, execution }],
          results,
          difficulty,
        );
      } catch (error) {
        if (error instanceof ReferenceJobDeadlineAdmissionError) {
          return { outcome: { kind: 'admission' }, plannerAttempted: true };
        }
        throw error;
      }
      const result = results[0];
      if (result === undefined || results.length !== 1) {
        return { outcome: { kind: 'fidelity' }, plannerAttempted: true };
      }
      return {
        outcome: { kind: 'accepted' },
        plannerAttempted: true,
        draft: {
          result,
          lineage: {
            ...planned.lineage,
            fidelity:
              result.validationReceipt === undefined
                ? planned.lineage.fidelity
                : {
                    ...planned.lineage.fidelity,
                    receipt: result.validationReceipt,
                  },
          },
          ...(planned.cacheMutation === undefined
            ? {}
            : { cacheMutation: planned.cacheMutation }),
        },
      };
    };
    let nextCandidateIndex = 0;

    while (
      drafts.length < questionCount &&
      candidateOutcomes.length < workBudget.candidateScanCap &&
      plannerCandidateCount < workBudget.plannerAttemptCap &&
      nextCandidateIndex < candidateReferences.length
    ) {
      const waveSize = Math.min(
        candidateConcurrency,
        questionCount - drafts.length,
        workBudget.candidateScanCap - candidateOutcomes.length,
        workBudget.plannerAttemptCap - plannerCandidateCount,
        candidateReferences.length - nextCandidateIndex,
      );
      if (waveSize <= 0) break;
      const wave = candidateReferences.slice(
        nextCandidateIndex,
        nextCandidateIndex + waveSize,
      );
      nextCandidateIndex += wave.length;
      const waveResults = await mapWithConcurrency(
        wave,
        candidateConcurrency,
        processCandidate,
      );
      for (const waveResult of waveResults) {
        candidateOutcomes.push(waveResult.outcome);
        if (waveResult.plannerAttempted) plannerCandidateCount += 1;
        if (waveResult.draft !== undefined) drafts.push(waveResult.draft);
      }
    }

    if (drafts.length !== questionCount) {
      const candidateOutcomeCounts =
        reconcileReferenceCandidateOutcomes(candidateOutcomes);
      throw new InternalServerErrorException({
        code: 'REFERENCE_GENERATION_SHORTFALL',
        requestedCount: questionCount,
        generatedCount: drafts.length,
        candidateCounts: {
          attempted: candidateOutcomeCounts.attempted,
          eligible: candidateReferences.length,
          generated: candidateOutcomeCounts.accepted,
          omittedEligibleCount: Math.max(
            0,
            candidateReferences.length - candidateOutcomeCounts.attempted,
          ),
        },
        stageCounts: {
          source: sourceRejectedCount + candidateOutcomeCounts.source,
          planner: candidateOutcomeCounts.planner,
          fidelity: candidateOutcomeCounts.fidelity,
          admission: candidateOutcomeCounts.admission,
        },
      });
    }
    return drafts;
  }

  private async readReferences(
    subjectSlug: string,
    startUnitNum: number,
    endUnitNum: number,
  ): Promise<readonly unknown[]> {
    const configuredReader = this.dependencies.readReferences;
    if (configuredReader !== undefined) {
      return configuredReader(subjectSlug, startUnitNum, endUnitNum);
    }
    if (this.catalogReader === undefined) {
      return readReferences(subjectSlug, startUnitNum, endUnitNum);
    }
    const catalogRows = await this.catalogReader.find({
      where: {
        subject: In(catalogSubjects(subjectSlug)),
        unitNumber: Between(startUnitNum, endUnitNum),
      },
    });
    return propagateSharedPassageStimuli(
      catalogRows.map(catalogReferencePayload),
    );
  }

  async warmCachedFrames(): Promise<
    Readonly<{
      cached: number;
      created: number;
      invalidSource: number;
      unsupportedSubject: Readonly<Record<string, number>>;
      plannerRejected: Readonly<Record<string, number>>;
    }>
  > {
    if (this.catalogReader === undefined || this.frameCacheRepo === undefined) {
      throw new InternalServerErrorException(
        'Reference frame warm-up requires catalog and cache repositories.',
      );
    }
    const frameCacheRepo = this.frameCacheRepo;
    let cached = 0;
    let created = 0;
    let invalidSource = 0;
    const unsupportedSubject: Record<string, number> = {};
    const plannerRejected: Record<string, number> = {};
    let nextIndex = 0;
    const planner = new ReferenceFramePlannerService({
      client: this.dependencies.createPlannerClient(),
      model: referenceGenerationModel(),
      maxAttempts: 2,
      timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS) || 180_000,
      retryDelayMs: 0,
    });
    const rows = await this.catalogReader.find();
    const payloads = propagateSharedPassageStimuli(
      rows.map((row) => catalogReferencePayload(row)),
    );
    const requestedConcurrency = Number.parseInt(
      process.env.REFERENCE_FRAME_WARMUP_CONCURRENCY ?? '4',
      10,
    );
    const concurrency =
      Number.isInteger(requestedConcurrency) && requestedConcurrency > 0
        ? Math.min(requestedConcurrency, 8)
        : 4;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        for (;;) {
          const row = rows[nextIndex];
          if (row === undefined) return;
          const payload = payloads[nextIndex];
          nextIndex += 1;
          const subject = catalogSubject(row.subject);
          if (subject === null) {
            increment(unsupportedSubject, row.subject);
            logWarmupProgress();
            continue;
          }
          const parsed = parseReference(payload, subject);
          if (!parsed.ok) {
            invalidSource += 1;
            logWarmupProgress();
            continue;
          }
          const archetype = selectedReferenceArchetype(parsed.value);
          const existing = await frameCacheRepo.findOneBy({
            sourceId: parsed.value.source.sourceId,
            sourceHash: parsed.value.source.sourceHash,
          });
          const cachedFrame = reusableCachedFrame(existing, {
            source: parsed.value.source,
            subject,
            unitRange: {
              start: parsed.value.unitNumber,
              end: parsed.value.unitNumber,
            },
            archetype,
          });
          if (cachedFrame !== undefined) {
            cached += 1;
            logWarmupProgress();
            continue;
          }
          const selection = {
            kind: 'selected' as const,
            concepts: [
              {
                concept: parsed.value.target.primaryConcept,
                unitNumbers: [parsed.value.unitNumber],
              },
            ],
            distractorAxisCatalog: [...DEFAULT_DISTRACTOR_AXES],
            distractorAxes: [],
            references: [parsed.value],
          };
          const result = await planner.planFrame({
            subject,
            unitRange: {
              start: parsed.value.unitNumber,
              end: parsed.value.unitNumber,
            },
            selection,
            reference: parsed.value,
            archetype,
            referenceDistractorAxes: [],
            catalogConcepts: await new ReferenceConceptCatalogResolver(
              this.textbookService,
            ).resolve(
              subject,
              parsed.value.unitNumber,
              parsed.value.unitNumber,
            ),
          });
          if (result.kind === 'rejected') {
            increment(plannerRejected, result.reason);
            logWarmupProgress();
            continue;
          }
          await frameCacheRepo.save(
            existing === null
              ? frameCacheRepo.create({
                  sourceId: parsed.value.source.sourceId,
                  sourceHash: parsed.value.source.sourceHash,
                  model: referenceGenerationModel(),
                  contractVersion: REFERENCE_FRAME_CACHE_VERSION,
                  archetypeFingerprint: archetype.fingerprint,
                  frame: result.frame,
                })
              : {
                  ...existing,
                  model: referenceGenerationModel(),
                  contractVersion: REFERENCE_FRAME_CACHE_VERSION,
                  archetypeFingerprint: archetype.fingerprint,
                  frame: result.frame,
                },
          );
          created += 1;
          logWarmupProgress();
        }
      }),
    );
    return {
      cached,
      created,
      invalidSource,
      unsupportedSubject,
      plannerRejected,
    };

    function logWarmupProgress(): void {
      const rejected =
        invalidSource +
        Object.values(unsupportedSubject).reduce(
          (sum, count) => sum + count,
          0,
        ) +
        Object.values(plannerRejected).reduce((sum, count) => sum + count, 0);
      const processed = cached + created + rejected;
      if (processed % 25 === 0) {
        console.log(
          `[REFERENCE-WARMUP] processed=${processed}/${rows.length} created=${created} cached=${cached} invalidSource=${invalidSource} plannerRejected=${Object.values(plannerRejected).reduce((sum, count) => sum + count, 0)}`,
        );
      }
    }
  }
}

type ReferenceCandidatePlanResult =
  | Readonly<{
      kind: 'planned';
      request: ReferenceVariantGenerationRequest;
      lineage: ReferenceFrameGenerationLineage;
      cacheMutation?: ReferenceFrameCacheMutation;
      attempts: number;
    }>
  | Readonly<{
      kind: 'rejected';
      attempts: number;
      reason: PlannerReasonCode;
    }>;

function referenceGenerationFailureKindForPlannerReason(
  reason: PlannerReasonCode,
): ReferenceGenerationFailureKind | undefined {
  switch (reason) {
    case 'MODEL_REQUEST_FAILED':
      return 'authentication';
    case 'MODEL_TIMEOUT':
    case 'MODEL_TRANSIENT_FAILURE':
      return 'transport_or_service';
    case 'MODEL_STRUCTURED_OUTPUT_UNSUPPORTED':
      return 'request_configuration';
    default:
      return undefined;
  }
}

async function reportReferenceGenerationMilestone(
  options: ReferenceFrameGenerationOptions | undefined,
  milestone: Readonly<{
    stage: 'selection' | 'planner';
    progress: number;
    completed: number;
    total: number;
    attempt: number;
    maxAttempts: number;
  }>,
): Promise<void> {
  const reportProgress = options?.reportProgress;
  if (reportProgress === undefined) return;
  await reportProgress({
    ...milestone,
    message: '참조 프레임 문항 생성 진행 중',
    status: 'info',
  });
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function subjectStyle(subjectSlug: string): SubjectStyle {
  if (subjectSlug === 'success') return 'success';
  if (subjectSlug === 'industry' || subjectSlug === 'kongil') return 'kongil';
  throw new InternalServerErrorException(
    `Unsupported reference subject: ${subjectSlug}`,
  );
}

function catalogSubjects(subjectSlug: string): readonly string[] {
  if (subjectSlug === 'success') return ['success', 'sungjik'];
  if (subjectSlug === 'industry') return ['industry', 'kongil'];
  return [subjectSlug];
}

function catalogSubject(value: string): SubjectStyle | null {
  if (value === 'success' || value === 'sungjik') return 'success';
  return value === 'kongil' ? 'kongil' : null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function propagateSharedPassageStimuli(
  payloads: readonly Readonly<Record<string, unknown>>[],
): readonly Readonly<Record<string, unknown>>[] {
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

export async function mapWithConcurrency<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  map: (value: Input) => Promise<Output>,
): Promise<readonly Output[]> {
  const results: Output[] = [];
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        const value = values[index];
        if (value === undefined) return;
        results[index] = await map(value);
      }
    }),
  );
  return results;
}

const DEFAULT_REFERENCE_GENERATION_CONCURRENCY = 3;
const MAX_REFERENCE_GENERATION_CONCURRENCY = 5;

function referenceCandidateConcurrency(value: unknown): number {
  if (value === undefined) return DEFAULT_REFERENCE_GENERATION_CONCURRENCY;
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_REFERENCE_GENERATION_CONCURRENCY;
  }
  return Math.min(parsed, MAX_REFERENCE_GENERATION_CONCURRENCY);
}

export function chunkReferenceFinalRequests<Value>(
  requests: readonly Value[],
): readonly (readonly Value[])[] {
  const batches: Value[][] = [];
  for (const request of requests) {
    batches.push([request]);
  }
  return batches;
}

function readReferences(
  subjectSlug: string,
  startUnitNum: number,
  endUnitNum: number,
): readonly unknown[] {
  const folder = subjectSlug === 'success' ? 'sungjik' : 'kongil';
  const directory = path.resolve(
    __dirname,
    '../../../textbook/parsed',
    folder,
    'all',
  );
  const references: unknown[] = [];
  for (
    let unitNumber = startUnitNum;
    unitNumber <= endUnitNum;
    unitNumber += 1
  ) {
    const file = path.join(directory, `${unitNumber}단원.json`);
    if (!fs.existsSync(file)) continue;
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (Array.isArray(parsed)) references.push(...parsed);
  }
  return references;
}

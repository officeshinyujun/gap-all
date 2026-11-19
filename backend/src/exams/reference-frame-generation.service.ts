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
  type ReferenceVariantGenerationResult,
} from './exam-regenerator.service';
import { ReferenceFramePlannerService } from './reference-frame-planner.service';
import {
  buildReferenceFidelitySpec,
  REFERENCE_FIDELITY_SPEC_VERSION,
} from './reference-fidelity-spec';
import { ReferenceConceptCatalogResolver } from './reference-concept-catalog-resolver';
import type {
  ReferenceCatalogConcept,
  ReferenceFramePlannerClient,
} from './reference-frame-planner.types';
import { referenceGenerationModel } from './reference-generation-model';
import { CANONICAL_TPL_BY_INFORMATION_SHAPE } from './reference-tpl-selector';
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
import type { SelectedParsedReference } from './reference-selector.types';

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
  return left.sourceId === right.sourceId && left.sourceHash === right.sourceHash;
}

function sameRange(left: UnitRange, right: UnitRange): boolean {
  return left.start === right.start && left.end === right.end;
}

function selectedReferenceArchetype(reference: SelectedParsedReference) {
  const archetype = classifyReferenceArchetype({
    stem: reference.stem,
    stimulus: reference.stimulus,
    viewItems: reference.viewItems ?? [],
    choices: reference.choices,
    targetConcepts: reference.targetConcepts,
  });
  if (archetype.kind !== 'classified') {
    throw new Error('Unreachable archetype.');
  }

  return archetype.value;
}

export type ReferenceFrameGeneratedDraft = Readonly<{
  result: ReferenceVariantGenerationResult;
  lineage: ReferenceFrameGenerationLineage;
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
  ): Promise<readonly ReferenceFrameGeneratedDraft[]> {
    const subject = subjectStyle(subjectSlug);
    const unitConcepts = this.textbookService.getConcepts(
      subjectSlug,
      startUnitNum,
      endUnitNum,
    );
    const catalogConcepts = new ReferenceConceptCatalogResolver(
      this.textbookService,
    ).resolve(subject, startUnitNum, endUnitNum);
    const requestedConcepts =
      targetConcepts !== undefined && targetConcepts.length > 0
        ? targetConcepts
        : unitConcepts.flatMap((unit) => unit.concepts);
    const selection = selectReferences({
      subject,
      unitRange: { start: startUnitNum, end: endUnitNum },
      requestedConcepts,
      requestedDistractorAxes: [],
      requestedReferenceCount: questionCount,
      seed: `${subjectSlug}:${startUnitNum}:${endUnitNum}:${questionCount}`,
      unitConcepts,
      sourceIds,
      ...(targetConcepts === undefined || targetConcepts.length === 0
        ? {}
        : { eligibleReferenceConcepts: targetConcepts }),
      parsedReferences: await this.readReferences(
        subjectSlug,
        startUnitNum,
        endUnitNum,
      ),
    });
    if (selection.kind === 'shortfall') {
      throw new InternalServerErrorException({
        code: 'REFERENCE_SELECTION_SHORTFALL',
        ...selection.shortfall,
      });
    }

    const plannerClient = this.dependencies.createPlannerClient();
    const planner = new ReferenceFramePlannerService({
      client: plannerClient,
      model: referenceGenerationModel(),
      maxAttempts: 3,
      timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS) || 180_000,
      retryDelayMs: 0,
    });
    const plannedReferences = await mapWithConcurrency(
      selection.references,
      referencePlanningConcurrency(),
      async (
        reference,
      ): Promise<
        Readonly<{
          request: ReferenceVariantGenerationRequest;
          lineage: ReferenceFrameGenerationLineage;
        }>
      > => {
        const requiredSourceConceptIds = sourceConceptIds(
          reference.targetConcepts,
          catalogConcepts,
          reference.unitNumber,
        );
        const requiredSourceTargetConceptId = requiredSourceConceptIds[0];
        if (
          requiredSourceTargetConceptId === undefined ||
          requiredSourceConceptIds.length !== reference.targetConcepts.length
        ) {
          throw new InternalServerErrorException({
            code: 'REFERENCE_SOURCE_CONCEPT_UNRESOLVED',
            sourceId: reference.source.sourceId,
            targetConcepts: reference.targetConcepts,
          });
        }
        const archetype = selectedReferenceArchetype(reference);
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
        const plan = await planner.plan(plannerRequest, cachedFrameForPlanning);
        if (plan.kind === 'rejected') {
          throw new InternalServerErrorException({
            code: 'REFERENCE_PLANNER_REJECTED',
            ...plan,
          });
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
          cachedFrame === null ||
          cachedFrame === undefined
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
        if (cacheFrame !== undefined) {
          await this.frameCacheRepo?.save(cacheFrame);
        }
        const selectedTemplate = archetype.sourceTemplate;
        const fidelitySpec = buildReferenceFidelitySpec(
          {
            source: reference.source,
            stem: reference.stem,
            stimulus: reference.stimulus,
            viewItems,
            choices: reference.choices,
            targetConcepts: reference.targetConcepts,
          },
          archetype,
          {
            structureBlueprint: plannedFrame.structureBlueprint,
            answerPlan: payload.answerPlan,
            targetConceptIds: payload.targetConceptIds,
            allowedTerminology: reference.targetConcepts,
          },
        );
        return {
          request: {
            reference: {
              source: reference.source,
              stem: reference.stem,
              stimulus: reference.stimulus,
              viewItems,
              choices: reference.choices,
              targetConcepts: reference.targetConcepts,
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
        };
      },
    );
    const requests = plannedReferences.map(({ request }) => request);
    const lineages = plannedReferences.map(({ lineage }) => lineage);

    const regeneratorClient =
      this.dependencies.createRegeneratorClient?.() ??
      (getOpenAIClient() as ReferenceGenerationClient);
    const resultBatches = await mapWithConcurrency(
      chunkReferenceFinalRequests(requests),
      referenceFinalGenerationConcurrency(),
      async (batch) => {
        const results: ReferenceVariantGenerationResult[] = [];
        await this.regeneratorService.regenerateReferenceBatch(
          regeneratorClient,
          batch,
          results,
          difficulty,
        );
        return results;
      },
    );
    const results = resultBatches.flat();
    if (results.length !== questionCount) {
      throw new InternalServerErrorException({
        code:
          results.length === 0
            ? 'REFERENCE_FIDELITY_REJECTED'
            : 'REFERENCE_GENERATION_SHORTFALL',
        requestedCount: questionCount,
        generatedCount: results.length,
      });
    }
    return results.map((result, index) => {
      const lineage = lineages[index];
      if (lineage === undefined) {
        throw new InternalServerErrorException('Reference lineage is missing.');
      }
      return {
        result,
        lineage: {
          ...lineage,
          fidelity:
            result.validationReceipt === undefined
              ? lineage.fidelity
              : { ...lineage.fidelity, receipt: result.validationReceipt },
        },
      };
    });
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
    return catalogRows.map(catalogReferencePayload);
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
          nextIndex += 1;
          const subject = catalogSubject(row.subject);
          if (subject === null) {
            increment(unsupportedSubject, row.subject);
            logWarmupProgress();
            continue;
          }
          const parsed = parseReference(catalogReferencePayload(row), subject);
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
            concepts: parsed.value.targetConcepts.map((concept) => ({
              concept,
              unitNumbers: [parsed.value.unitNumber],
            })),
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
            catalogConcepts: new ReferenceConceptCatalogResolver(
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

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sourceConceptIds(
  targetConcepts: readonly string[],
  catalogConcepts: readonly ReferenceCatalogConcept[],
  sourceUnit: number,
): readonly string[] {
  const catalogByLabel = new Map(
    catalogConcepts
      .filter(({ unit }) => unit === sourceUnit)
      .map(({ canonicalLabel, id }) => [normalizeConceptLabel(canonicalLabel), id]),
  );
  return targetConcepts.flatMap((targetConcept) => {
    const id = catalogByLabel.get(normalizeConceptLabel(targetConcept));
    return id === undefined ? [] : [id];
  });
}

function normalizeConceptLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR');
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

function referencePlanningConcurrency(): number {
  const configured = Number.parseInt(
    process.env.REFERENCE_PAYLOAD_CONCURRENCY ?? '3',
    10,
  );
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, 4)
    : 3;
}

function referenceFinalGenerationConcurrency(): number {
  const configured = Number.parseInt(
    process.env.REFERENCE_FINAL_CONCURRENCY ?? '3',
    10,
  );
  return Number.isInteger(configured) && configured > 0
    ? Math.min(configured, 4)
    : 3;
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

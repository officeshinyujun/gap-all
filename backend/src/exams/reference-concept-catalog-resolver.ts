import { createHash } from 'node:crypto';
import type { TextbookService } from '../textbook/textbook.service';
import type { SubjectStyle } from './reference-frame.types';
import type { ReferenceCatalogConcept } from './reference-frame-planner.types';
import { conceptKey } from './reference-selector.utils';

export type ReferenceConceptCatalogReader = Pick<
  TextbookService,
  'getConcepts'
>;

export type SourceConceptTarget = Readonly<{
  sourceId: string;
  unit: number;
  canonicalLabel: string;
}>;

export type ReferenceConceptCatalogReconciliation =
  | Readonly<{
      kind: 'reconciled';
      catalogConcepts: readonly ReferenceCatalogConcept[];
      sourceConceptIds: ReadonlyMap<string, string>;
    }>
  | Readonly<{
      kind: 'ambiguous';
      sourceId: string;
      unit: number;
      conceptKey: string;
      catalogConceptIds: readonly string[];
    }>;

export class ReferenceConceptCatalogResolver {
  constructor(
    private readonly textbookService: ReferenceConceptCatalogReader,
  ) {}

  resolve(
    subject: SubjectStyle,
    startUnit: number,
    endUnit: number,
  ): readonly ReferenceCatalogConcept[] {
    const subjectSlug = subject === 'kongil' ? 'industry' : subject;
    return this.textbookService
      .getConcepts(subjectSlug, startUnit, endUnit)
      .flatMap(({ unitName, concepts }) => {
        const unit = Number.parseInt(unitName, 10);
        if (!Number.isInteger(unit) || unit < startUnit || unit > endUnit) {
          return [];
        }
        return concepts.map((canonicalLabel) => ({
          id: conceptId(subject, unit, canonicalLabel),
          subject,
          unit,
          canonicalLabel,
          ruleTags: [],
        }));
      });
  }
}

export function conceptId(
  subject: SubjectStyle,
  unit: number,
  canonicalLabel: string,
): string {
  const digest = createHash('sha256')
    .update(`${subject}:${unit}:${conceptKey(canonicalLabel)}`)
    .digest('hex')
    .slice(0, 16);
  return `concept_${digest}`;
}

export function reconcileReferenceConceptCatalog(
  catalogConcepts: readonly ReferenceCatalogConcept[],
  sourceTargets: readonly SourceConceptTarget[],
  subject: SubjectStyle,
): ReferenceConceptCatalogReconciliation {
  const textbookByKey = new Map<string, ReferenceCatalogConcept[]>();
  for (const concept of catalogConcepts) {
    const key = catalogKey(concept.unit, concept.canonicalLabel);
    const matches = textbookByKey.get(key) ?? [];
    matches.push(concept);
    textbookByKey.set(key, matches);
  }

  const sourceConceptsByKey = new Map<string, ReferenceCatalogConcept>();
  const sourceConceptIds = new Map<string, string>();
  for (const sourceTarget of sourceTargets) {
    const key = catalogKey(sourceTarget.unit, sourceTarget.canonicalLabel);
    const textbookMatches = textbookByKey.get(key) ?? [];
    if (textbookMatches.length > 1) {
      return {
        kind: 'ambiguous',
        sourceId: sourceTarget.sourceId,
        unit: sourceTarget.unit,
        conceptKey: conceptKey(sourceTarget.canonicalLabel),
        catalogConceptIds: textbookMatches.map(({ id }) => id),
      };
    }
    const textbookMatch = textbookMatches[0];
    if (textbookMatch !== undefined) {
      sourceConceptIds.set(sourceTarget.sourceId, textbookMatch.id);
      continue;
    }

    const sourceConcept = sourceConceptsByKey.get(key) ?? {
      id: conceptId(subject, sourceTarget.unit, sourceTarget.canonicalLabel),
      subject,
      unit: sourceTarget.unit,
      canonicalLabel: sourceTarget.canonicalLabel,
      ruleTags: [],
    };
    sourceConceptsByKey.set(key, sourceConcept);
    sourceConceptIds.set(sourceTarget.sourceId, sourceConcept.id);
  }

  return {
    kind: 'reconciled',
    catalogConcepts: [...catalogConcepts, ...sourceConceptsByKey.values()],
    sourceConceptIds,
  };
}

function catalogKey(unit: number, label: string): string {
  return `${unit}:${conceptKey(label)}`;
}

import { createHash } from 'node:crypto';
import type { TextbookService } from '../textbook/textbook.service';
import type { SubjectStyle } from './reference-frame.types';
import type { ReferenceCatalogConcept } from './reference-frame-planner.types';

export type ReferenceConceptCatalogReader = Pick<TextbookService, 'getConcepts'>;

export class ReferenceConceptCatalogResolver {
  constructor(private readonly textbookService: ReferenceConceptCatalogReader) {}

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
        if (
          !Number.isInteger(unit) ||
          unit < startUnit ||
          unit > endUnit
        ) {
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
    .update(`${subject}:${unit}:${canonicalLabel}`)
    .digest('hex')
    .slice(0, 16);
  return `concept_${digest}`;
}

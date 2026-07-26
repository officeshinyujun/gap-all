import {
  conceptId,
  reconcileReferenceConceptCatalog,
  type SourceConceptTarget,
} from './reference-concept-catalog-resolver';
import type { ReferenceCatalogConcept } from './reference-frame-planner.types';

function sourceTarget(
  sourceId: string,
  canonicalLabel: string,
): SourceConceptTarget {
  return { sourceId, unit: 15, canonicalLabel };
}

function textbookConcept(
  id: string,
  canonicalLabel: string,
): ReferenceCatalogConcept {
  return {
    id,
    subject: 'kongil',
    unit: 15,
    canonicalLabel,
    ruleTags: [],
  };
}

describe('ReferenceConceptCatalogResolver reconciliation', () => {
  it('Given a sparse textbook unit, When source-only labels differ only by key formatting, Then adds one stable source concept ID', () => {
    const result = reconcileReferenceConceptCatalog(
      [],
      [
        sourceTarget('kongil:15:1', 'Risk Control'),
        sourceTarget('kongil:15:2', '  risk\tcontrol  '),
      ],
      'kongil',
    );
    const expectedId = conceptId('kongil', 15, 'risk control');

    expect(conceptId('kongil', 15, 'Risk Control')).toBe(expectedId);
    expect(result.kind).toBe('reconciled');
    if (result.kind !== 'reconciled') return;

    expect(result.catalogConcepts).toEqual([
      textbookConcept(expectedId, 'Risk Control'),
    ]);
    expect(result.sourceConceptIds.get('kongil:15:1')).toBe(expectedId);
    expect(result.sourceConceptIds.get('kongil:15:2')).toBe(expectedId);
  });

  it('Given one normalized textbook match, When reconciling a Unicode and whitespace-equivalent source label, Then keeps the textbook display label and ID', () => {
    const textbook = textbookConcept('textbook-cafe-rule', 'Café Rule');
    const result = reconcileReferenceConceptCatalog(
      [textbook],
      [sourceTarget('kongil:15:3', '  CAFE\u0301\t rule  ')],
      'kongil',
    );

    expect(result.kind).toBe('reconciled');
    if (result.kind !== 'reconciled') return;

    expect(result.catalogConcepts).toEqual([textbook]);
    expect(result.sourceConceptIds.get('kongil:15:3')).toBe(textbook.id);
  });

  it('Given multiple textbook concepts with one normalized key, When reconciling a source label, Then returns the typed ambiguity outcome', () => {
    const result = reconcileReferenceConceptCatalog(
      [
        textbookConcept('textbook-cafe-rule-a', 'Café Rule'),
        textbookConcept('textbook-cafe-rule-b', '  CAFE\u0301   RULE '),
      ],
      [sourceTarget('kongil:15:4', 'café rule')],
      'kongil',
    );

    expect(result).toEqual({
      kind: 'ambiguous',
      sourceId: 'kongil:15:4',
      unit: 15,
      conceptKey: 'café rule',
      catalogConceptIds: ['textbook-cafe-rule-a', 'textbook-cafe-rule-b'],
    });
  });
});

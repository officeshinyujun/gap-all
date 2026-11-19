export type ReferenceQuestionCatalogInput = Readonly<{
  logicalSourceId: string;
  contentHash: string;
  subject: string;
  unitNumber: number;
  provenancePath: string;
  parseVersion: string;
  sourcePayload: Readonly<Record<string, unknown>>;
}>;

export type ReferenceQuestionCatalogResult =
  | Readonly<{ kind: 'inserted'; value: ReferenceQuestionCatalogInput }>
  | Readonly<{ kind: 'existing'; value: ReferenceQuestionCatalogInput }>
  | Readonly<{
      kind: 'version_conflict';
      existing: ReferenceQuestionCatalogInput;
      incoming: ReferenceQuestionCatalogInput;
    }>;

export class ReferenceQuestionCatalog {
  private readonly entries = new Map<string, ReferenceQuestionCatalogInput>();

  insert(input: ReferenceQuestionCatalogInput): ReferenceQuestionCatalogResult {
    const existing = this.entries.get(input.logicalSourceId);
    if (existing === undefined) {
      this.entries.set(input.logicalSourceId, input);
      return { kind: 'inserted', value: input };
    }
    if (existing.contentHash === input.contentHash) {
      return { kind: 'existing', value: existing };
    }
    return { kind: 'version_conflict', existing, incoming: input };
  }
}

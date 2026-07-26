import {
  buildConceptPayloadPrompt,
  buildReferenceFramePrompt,
} from './reference-frame-planner.prompts';
import {
  REFERENCE_CONTRACT_INVARIANTS,
  invariantPromptRequirementsFor,
  providerSchemaRequirementsFor,
} from './reference-contract-invariants';
import {
  validFrameJson,
  validPayloadJson,
  validRequest,
} from './reference-frame-planner.fixtures';
import {
  conceptPayloadStructuredOutputFor,
  referenceFrameStructuredOutput,
} from './reference-frame.provider-schemas';
import {
  validateConceptPayloadJson,
  validateReferenceFrameJson,
} from './reference-frame.types';

describe('Reference contract parity baseline', () => {
  it('Given parser-valid frame and payload fixtures, When provider descriptors and prompts are built, Then they expose the current strict contract surface', () => {
    const request = validRequest();
    const frameResult = validateReferenceFrameJson(validFrameJson());
    const payloadResult = validateConceptPayloadJson(validPayloadJson());

    expect(frameResult.ok).toBe(true);
    expect(payloadResult.ok).toBe(true);
    if (!frameResult.ok || !payloadResult.ok) {
      return;
    }

    const framePrompt = JSON.parse(buildReferenceFramePrompt(request));
    const payloadPrompt = JSON.parse(
      buildConceptPayloadPrompt(request, frameResult.value),
    );
    const payloadDescriptor = conceptPayloadStructuredOutputFor(
      request.catalogConcepts.map(({ id }) => id),
      frameResult.value.response,
    );

    expect(referenceFrameStructuredOutput).toMatchObject({
      name: 'reference_frame',
      strict: true,
      schema: {
        required: Object.keys(frameResult.value).filter(
          (key) => key !== 'archetype',
        ),
      },
    });
    expect(payloadDescriptor).toMatchObject({
      name: 'concept_payload',
      strict: true,
      schema: { required: Object.keys(payloadResult.value) },
    });
    expect(framePrompt).toMatchObject({
      response:
        'Return one raw JSON object that satisfies the ReferenceFrame contract exactly.',
      semanticContract: expect.objectContaining({
        semanticAtoms: expect.any(String),
        groundingLexicon: expect.any(String),
        structureBlueprint: expect.stringMatching(
          /condition_of.+condition.+conclusion.+itemRoles.+evidenceBlocks.+empty relations array/,
        ),
      }),
    });
    expect(payloadPrompt).toMatchObject({
      response:
        'Return one raw JSON object that satisfies the ConceptPayload contract exactly.',
      slotConstraints: expect.objectContaining({
        exactTargetConceptCount: 1,
        minSupportingConceptCount: 0,
        maxSupportingConceptCount: 0,
      }),
    });
  });

  it('Given generated planner prompts, When their contract constraints are inspected, Then every constraint is projected from the canonical invariant inventory', () => {
    const request = validRequest();
    const frameResult = validateReferenceFrameJson(validFrameJson());

    expect(frameResult.ok).toBe(true);
    if (!frameResult.ok) {
      return;
    }

    const framePrompt = JSON.parse(buildReferenceFramePrompt(request));
    const payloadPrompt = JSON.parse(
      buildConceptPayloadPrompt(request, frameResult.value),
    );

    expect(framePrompt.contractRequirements).toEqual(
      invariantPromptRequirementsFor('frame'),
    );
    expect(payloadPrompt.contractRequirements).toEqual(
      invariantPromptRequirementsFor('payload'),
    );
  });

  it('Given canonical invariants, When projecting contract ownership, Then every rule has schema, prompt, validator, repair, and fixture coverage', () => {
    expect(REFERENCE_CONTRACT_INVARIANTS.length).toBeGreaterThan(0);
    expect(REFERENCE_CONTRACT_INVARIANTS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringMatching(/^(RF|CP)-[A-Z0-9-]+$/),
          providerSchema: expect.any(Object),
          promptRequirement: expect.any(String),
          validatorPath: expect.any(String),
          repairStage: expect.stringMatching(/^(frame|payload)$/),
          regressionFixture: expect.objectContaining({
            classification: expect.any(String),
          }),
        }),
      ]),
    );

    expect(invariantPromptRequirementsFor('frame')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.stringMatching(/^RF-/) }),
      ]),
    );
    expect(providerSchemaRequirementsFor('reference_frame')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.stringMatching(/^RF-/) }),
      ]),
    );
  });

  it('Given canonical invariants, When descriptors and repair prompts are projected, Then every structural schema and prompt rule remains owned by its invariant', () => {
    const request = validRequest();
    const frameResult = validateReferenceFrameJson(validFrameJson());

    expect(frameResult.ok).toBe(true);
    if (!frameResult.ok) {
      return;
    }

    const descriptors = {
      reference_frame: referenceFrameStructuredOutput,
      concept_payload: conceptPayloadStructuredOutputFor(
        request.catalogConcepts.map(({ id }) => id),
        frameResult.value.response,
      ),
    } as const;

    for (const invariant of REFERENCE_CONTRACT_INVARIANTS) {
      const expectedPromptRules = invariantPromptRequirementsFor(
        invariant.stage,
      );
      const prompt = JSON.parse(
        invariant.stage === 'frame'
          ? buildReferenceFramePrompt(request, 'INVALID_FIELD_VALUE')
          : buildConceptPayloadPrompt(
              request,
              frameResult.value,
              'INVALID_FIELD_VALUE',
            ),
      );

      expect(prompt.contractRequirements).toEqual(expectedPromptRules);
      expect(expectedPromptRules).toContainEqual({
        id: invariant.id,
        rule: invariant.promptRequirement,
      });
      expect(invariant.repairStage).toBe(invariant.stage);
      expect(invariant.validatorPath).toEqual(expect.any(String));
      expect(invariant.regressionFixture.file).toMatch(/\.spec\.ts$/);

      if (invariant.providerSchema.kind !== 'required_properties') {
        continue;
      }

      const schema = descriptors[invariant.providerSchema.descriptor].schema;
      const projectedSchema = schemaAtPath(
        schema,
        invariant.providerSchema.path,
      );

      expect(projectedSchema).toEqual(
        expect.objectContaining({
          required: invariant.providerSchema.properties,
        }),
      );
    }

    expect(
      providerSchemaRequirementsFor('reference_frame').map(
        (invariant) => invariant.id,
      ),
    ).toEqual(
      expect.arrayContaining(
        REFERENCE_CONTRACT_INVARIANTS.filter((invariant) =>
          invariant.id.startsWith('RF-'),
        ).map((invariant) => invariant.id),
      ),
    );
    expect(
      providerSchemaRequirementsFor('concept_payload').map(
        (invariant) => invariant.id,
      ),
    ).toEqual(
      expect.arrayContaining(
        REFERENCE_CONTRACT_INVARIANTS.filter((invariant) =>
          invariant.id.startsWith('CP-'),
        ).map((invariant) => invariant.id),
      ),
    );
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function schemaAtPath(schema: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((value, segment) => {
    if (!isRecord(value)) {
      return undefined;
    }
    if (segment === 'items') {
      return value.items;
    }
    return isRecord(value.properties) ? value.properties[segment] : undefined;
  }, schema);
}

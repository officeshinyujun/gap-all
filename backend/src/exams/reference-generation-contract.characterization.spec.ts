import {
  DEFAULT_REFERENCE_GENERATION_MODEL,
  referenceFinalGenerationModel,
  referenceGenerationModel,
} from './reference-generation-model';
import { ReferenceFramePlannerService } from './reference-frame-planner.service';
import {
  validFrameJson,
  validPayloadJson,
  validRequest,
} from './reference-frame-planner.fixtures';
import { REFERENCE_GENERATION_CONTRACT_BASELINE } from './reference-generation-contract.fixtures';
import type { ReferenceFramePlannerChatRequest } from './reference-frame-planner.types';

describe('reference generation request characterization', () => {
  it('preserves planner model, schema, temperature, and server-owned selection inputs', async () => {
    const requests: ReferenceFramePlannerChatRequest[] = [];
    const client = {
      chat: {
        completions: {
          create: jest.fn(async (request: ReferenceFramePlannerChatRequest) => {
            requests.push(request);
            const content =
              requests.length === 1 ? validFrameJson() : validPayloadJson();
            return { choices: [{ message: { content } }] };
          }),
        },
      },
    };
    const service = new ReferenceFramePlannerService({
      client,
      model: DEFAULT_REFERENCE_GENERATION_MODEL,
      maxAttempts: REFERENCE_GENERATION_CONTRACT_BASELINE.planner.maxAttempts,
      retryDelayMs: 0,
      timeoutMs: 1_000,
    });

    await expect(service.plan(validRequest())).resolves.toEqual(
      expect.objectContaining({ kind: 'planned' }),
    );

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request).toMatchObject({
        model: REFERENCE_GENERATION_CONTRACT_BASELINE.planner.model,
        temperature: REFERENCE_GENERATION_CONTRACT_BASELINE.planner.temperature,
        response_format: {
          type: REFERENCE_GENERATION_CONTRACT_BASELINE.planner
            .responseFormatType,
          json_schema: expect.objectContaining({ strict: true }),
        },
        messages: expect.arrayContaining([
          {
            role: 'system',
            content:
              REFERENCE_GENERATION_CONTRACT_BASELINE.planner.systemMessage,
          },
        ]),
      });
    }

    const frameRequest = requests[0];
    const payloadRequest = requests[1];
    if (frameRequest === undefined || payloadRequest === undefined) {
      throw new Error('Expected planner frame and payload requests.');
    }
    expect(frameRequest.response_format).toMatchObject({
      json_schema: {
        name: REFERENCE_GENERATION_CONTRACT_BASELINE.planner.frameSchemaName,
      },
    });
    expect(payloadRequest.response_format).toMatchObject({
      json_schema: {
        name: REFERENCE_GENERATION_CONTRACT_BASELINE.planner.payloadSchemaName,
      },
    });

    const payloadPrompt = JSON.parse(
      payloadRequest.messages[1]?.content ?? '{}',
    ) as {
      referenceConceptsToPreserve?: readonly string[];
      referenceDistractorAxesToPreserve?: readonly string[];
      requiredUnitRange?: { start: number; end: number };
    };
    expect(payloadPrompt).toMatchObject({
      referenceConceptsToPreserve: [
        REFERENCE_GENERATION_CONTRACT_BASELINE.planner.selection
          .sourceTargetConcept,
      ],
      referenceDistractorAxesToPreserve:
        REFERENCE_GENERATION_CONTRACT_BASELINE.planner.selection
          .referenceDistractorAxes,
      requiredUnitRange:
        REFERENCE_GENERATION_CONTRACT_BASELINE.planner.selection.unitRange,
    });
    expect(referenceGenerationModel()).toBe(
      REFERENCE_GENERATION_CONTRACT_BASELINE.planner.model,
    );
  });

  it('keeps final and verifier model identities sourced from the existing configuration helpers', () => {
    expect(referenceFinalGenerationModel()).toBe(
      REFERENCE_GENERATION_CONTRACT_BASELINE.final.model,
    );
    expect(referenceGenerationModel()).toBe(
      REFERENCE_GENERATION_CONTRACT_BASELINE.planner.model,
    );
  });
});

import { chunkReferenceFinalRequests } from './reference-frame-generation.service';

describe('chunkReferenceFinalRequests', () => {
  it('isolates each final request by default to prevent sibling-overlap false positives', () => {
    const batches = chunkReferenceFinalRequests(
      Array.from({ length: 10 }, (_, index) => `request-${index + 1}`),
    );

    expect(batches).toEqual([
      ['request-1'],
      ['request-2'],
      ['request-3'],
      ['request-4'],
      ['request-5'],
      ['request-6'],
      ['request-7'],
      ['request-8'],
      ['request-9'],
      ['request-10'],
    ]);
  });
});

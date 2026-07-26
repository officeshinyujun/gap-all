import { mapWithConcurrency } from './reference-frame-generation.service';

describe('mapWithConcurrency', () => {
  it('preserves selection order while limiting active work', async () => {
    let active = 0;
    let maxActive = 0;

    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return `slot-${value}`;
    });

    expect(results).toEqual(['slot-1', 'slot-2', 'slot-3', 'slot-4']);
    expect(maxActive).toBe(2);
  });
});

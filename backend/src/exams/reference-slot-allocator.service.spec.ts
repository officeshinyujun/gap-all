import { validRequest } from './reference-frame-planner.fixtures';
import { allocateReferenceSlots } from './reference-slot-allocator.service';

describe('allocateReferenceSlots', () => {
  it('allocates stable server-owned slots from selected references', () => {
    const request = validRequest();
    const result = allocateReferenceSlots(request.selection, 1);
    expect(result).toEqual(allocateReferenceSlots(request.selection, 1));
    expect(result).toMatchObject({
      kind: 'allocated',
      slots: [{ slotId: 'slot-1', template: 'TPL_CASE_DIAGNOSTIC_FRAME' }],
    });
  });

  it('fails before model planning when reference capacity is insufficient', () => {
    const result = allocateReferenceSlots(validRequest().selection, 2);
    expect(result).toEqual({
      kind: 'capacity_failure',
      reason: 'INSUFFICIENT_REFERENCES',
    });
  });
});

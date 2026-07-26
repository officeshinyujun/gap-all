import {
  defaultConversationIconKey,
  parseConversationVisualMetadata,
} from './conversation-visual-aid-validator';

const participants = [{ id: 'student' }, { id: 'teacher' }];

const messages = [{ p_id: 'student' }, { p_id: 'teacher' }];

describe('conversation visual aid validation', () => {
  it('accepts an evidence-backed actor flow over known participants', () => {
    expect(
      parseConversationVisualMetadata(
        'school',
        {
          kind: 'actor_flow',
          actor_ids: ['student', 'teacher'],
          relations: [
            {
              from_id: 'student',
              to_id: 'teacher',
              action_key: 'consult',
              evidence_message_indexes: [0],
            },
          ],
        },
        participants,
        messages,
      ),
    ).toEqual({
      scene_kind: 'school',
      visual_aid: {
        kind: 'actor_flow',
        actor_ids: ['student', 'teacher'],
        relations: [
          {
            from_id: 'student',
            to_id: 'teacher',
            action_key: 'consult',
            evidence_message_indexes: [0],
          },
        ],
      },
    });
  });

  it.each([
    ['unknown actor', ['student', 'other'], [0]],
    ['wrong source evidence', ['student', 'teacher'], [1]],
  ])(
    'rejects an actor flow with %s',
    (_label, actor_ids, evidence_message_indexes) => {
      expect(
        parseConversationVisualMetadata(
          'school',
          {
            kind: 'actor_flow',
            actor_ids,
            relations: [
              {
                from_id: 'student',
                to_id: 'teacher',
                action_key: 'consult',
                evidence_message_indexes,
              },
            ],
          },
          participants,
          messages,
        ),
      ).toBeNull();
    },
  );

  it('rejects visual data attached to a none aid', () => {
    expect(
      parseConversationVisualMetadata(
        'none',
        { kind: 'none', actor_ids: ['student'], relations: [] },
        participants,
        messages,
      ),
    ).toBeNull();
  });

  it('maps legacy roles to a fixed neutral icon key', () => {
    expect(defaultConversationIconKey('교사')).toBe('teacher');
    expect(defaultConversationIconKey('알 수 없는 역할')).toBe('person');
  });
});

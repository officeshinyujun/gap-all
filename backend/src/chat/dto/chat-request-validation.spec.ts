import { validate } from 'class-validator';
import { CreateSessionDto } from './create-session.dto';
import { SendMessageDto } from './send-message.dto';

describe('chat request DTO bounds', () => {
  it('rejects empty or oversized messages and unsupported modes', async () => {
    const dto = Object.assign(new SendMessageDto(), {
      message: 'x'.repeat(4001),
      mode: 'other',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['message', 'mode']),
    );
  });

  it('rejects empty or oversized session titles', async () => {
    const dto = Object.assign(new CreateSessionDto(), {
      subjectId: '5d0199c5-6bf6-4a92-a3f8-dbd8679bf9e7',
      title: 'x'.repeat(101),
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('title');
  });
});

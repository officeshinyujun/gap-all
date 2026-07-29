import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReviewGenerateDto } from './review-generate.dto';

describe('ReviewGenerateDto', () => {
  it('accepts at most 20 generated questions', async () => {
    const dto = plainToInstance(ReviewGenerateDto, {
      subjectSlug: 'korean',
      questionCount: 21,
    });

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'questionCount' }),
      ]),
    );
  });
});

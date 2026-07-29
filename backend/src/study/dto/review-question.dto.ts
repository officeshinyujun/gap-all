import { ArrayNotEmpty, IsArray, IsInt, IsUUID, Min } from 'class-validator';

export class ReviewQuestionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  questionIds: string[];
}

export class SubmitReviewAnswerDto {
  @IsInt()
  @Min(1)
  answer: number;
}

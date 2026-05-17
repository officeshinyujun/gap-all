import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IncorrectSource } from '../../entities/incorrect-record.entity';

export class ReviewResultItemDto {
  @IsString()
  targetConcept: string;

  @IsUUID()
  unitId: string;

  @IsEnum(IncorrectSource)
  source: IncorrectSource;

  @IsBoolean()
  isCorrect: boolean;
}

export class SubmitReviewResultDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewResultItemDto)
  results: ReviewResultItemDto[];
}

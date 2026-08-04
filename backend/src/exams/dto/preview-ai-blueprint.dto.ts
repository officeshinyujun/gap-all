import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Difficulty } from '../../entities/exam-record.entity';
import {
  AI_QUESTION_FAMILIES,
  type AiQuestionFamily,
} from '../ai-blueprint.types';

export class PreviewAiBlueprintDto {
  @IsUUID()
  subjectId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  subjectSlug: string;

  @IsInt()
  @Min(1)
  @Max(20)
  startUnitNum: number;

  @IsInt()
  @Min(1)
  @Max(20)
  endUnitNum: number;

  @IsEnum(Difficulty)
  difficulty: Difficulty;

  @IsInt()
  @Min(1)
  @Max(20)
  questionCount: number;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  @IsOptional()
  targetConcepts?: string[];

  @IsOptional()
  @IsIn(AI_QUESTION_FAMILIES)
  aiQuestionFamily?: AiQuestionFamily;


  @IsOptional()
  @IsString()
  @MaxLength(128)
  seed?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(256, { each: true })
  excludeSourceIds?: string[];
}

import {
  IsUUID,
  IsInt,
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
  ArrayMaxSize,
  IsIn,
  IsNotEmpty,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Difficulty } from '../../entities/exam-record.entity';

export type ExamSourceType = 'ai' | 'reference' | 'simply_reference';

export class CreateExamDto {
  @IsUUID()
  subjectId: string;

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

  @IsString()
  @IsOptional()
  @MaxLength(4000)
  customPrompt?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  @IsOptional()
  targetConcepts?: string[];

  @IsOptional()
  @IsIn(['ai', 'reference', 'simply_reference'])
  sourceType?: ExamSourceType;

  @IsBoolean()
  @IsOptional()
  excludePrevious?: boolean;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(200, { each: true })
  @IsOptional()
  referenceSourceIds?: string[];
}

import {
  IsUUID,
  IsInt,
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Difficulty } from '../../entities/exam-record.entity';

export class CreateExamDto {
  @IsUUID()
  subjectId: string;

  @IsInt()
  @Min(1)
  startUnitNum: number;

  @IsInt()
  @Min(1)
  endUnitNum: number;

  @IsEnum(Difficulty)
  difficulty: Difficulty;

  @IsInt()
  @Min(1)
  @Max(20)
  questionCount: number;

  @IsString()
  @IsOptional()
  customPrompt?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetConcepts?: string[];
}

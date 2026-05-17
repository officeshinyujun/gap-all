import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IncorrectSource } from '../../entities/incorrect-record.entity';

export class IncorrectRecordItemDto {
  @IsString()
  subjectSlug: string;

  @IsInt()
  @Min(1)
  unitNumber: number;

  @IsString()
  targetConcept: string;

  @IsEnum(IncorrectSource)
  source: IncorrectSource;

  @IsOptional()
  @IsUUID()
  questionId?: string;
}

export class CreateIncorrectRecordsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IncorrectRecordItemDto)
  records: IncorrectRecordItemDto[];
}

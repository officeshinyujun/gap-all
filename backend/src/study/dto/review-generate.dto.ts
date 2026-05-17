import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class UnitRangeDto {
  @IsInt()
  @Min(1)
  start: number;

  @IsInt()
  @Min(1)
  end: number;
}

export class ReviewGenerateDto {
  @IsString()
  subjectSlug: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UnitRangeDto)
  unitRange?: UnitRangeDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  questionCount?: number;

  @IsOptional()
  @IsString()
  difficulty?: string;
}

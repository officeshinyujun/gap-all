import { IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { StudyMode } from '../../entities/study-progress.entity';

export class UpdateProgressDto {
  @IsString()
  unitId: string;

  @IsEnum(StudyMode)
  studyMode: StudyMode;

  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent: number;
}

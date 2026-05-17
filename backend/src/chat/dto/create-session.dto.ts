import { IsString, IsUUID, IsInt, IsOptional, Min, Max } from 'class-validator';

export class CreateSessionDto {
  @IsUUID()
  subjectId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  startUnit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  endUnit?: number;
}

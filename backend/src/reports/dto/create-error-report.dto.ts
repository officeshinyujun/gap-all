import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateErrorReportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  pageUrl: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  userAgent: string;
}

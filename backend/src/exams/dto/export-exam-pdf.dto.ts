import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** 프론트가 그린 시험지 HTML(앱 문항 렌더러와 같은 모양을 유지하려고 HTML을 프론트에서 만든다) */
export class ExportExamPdfDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(3_000_000)
  html: string;
}

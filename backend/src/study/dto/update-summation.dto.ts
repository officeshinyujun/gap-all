import { IsArray } from 'class-validator';

export class UpdateSummationDto {
  @IsArray()
  cards: any[];
}

import { IsString, Allow } from 'class-validator';

export class SendMessageDto {
  @IsString()
  message: string;

  @Allow()
  mode?: string;
}

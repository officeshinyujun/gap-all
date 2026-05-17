import { IsString, IsOptional, MaxLength, IsUrl } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MaxLength(20)
  name?: string;

  @IsOptional()
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'profileImageUrl은 https URL이어야 합니다.' },
  )
  @MaxLength(2048)
  profileImageUrl?: string;
}

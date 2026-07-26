import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsDateString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'passwordStrength', async: false })
class PasswordStrengthConstraint implements ValidatorConstraintInterface {
  validate(password: string, args: ValidationArguments) {
    if (!/^[A-Z]/.test(password)) return false;
    const specialCharCount = [...password].filter((char) =>
      '!@#$%^&*()_+-=[]{}|;\':",./<>?~`\\'.includes(char),
    ).length;
    if (specialCharCount < 2) return false;

    const dto = args.object as RegisterDto;
    if (dto.birthday) {
      const date = new Date(dto.birthday);
      const yyyy = date.getFullYear().toString();
      const yy = yyyy.slice(2);
      const mm = (date.getMonth() + 1).toString().padStart(2, '0');
      const dd = date.getDate().toString().padStart(2, '0');

      const patterns = [
        `${yyyy}${mm}${dd}`,
        `${yy}${mm}${dd}`,
        `${mm}${dd}${yyyy}`,
        `${mm}${dd}`,
        `${dd}${mm}${yy}`,
        `${dd}${mm}${yyyy}`,
      ];

      for (const pattern of patterns) {
        if (password.includes(pattern)) return false;
      }
    }

    return true;
  }

  defaultMessage() {
    return '비밀번호는 첫 글자 대문자, 특수문자 2개 이상이어야 하며, 생일을 포함할 수 없습니다.';
  }
}

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(20)
  name: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Validate(PasswordStrengthConstraint)
  password: string;

  @IsDateString()
  birthday: string;

  @IsString()
  verificationToken: string;
}

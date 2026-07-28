import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

describe('RegisterDto', () => {
  it('모든 필드가 올바르면 유효성 검증 통과', async () => {
    const dto = new RegisterDto();
    dto.email = 'test@example.com';
    dto.name = '홍길동';
    dto.password = 'Abcdefg!@#pass';
    dto.birthday = '2000-01-01';
    dto.verificationToken = 'valid-token';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('이메일 형식이 잘못되면 유효성 검증 실패', async () => {
    const dto = new RegisterDto();
    dto.email = 'not-an-email';
    dto.name = '홍길동';
    dto.password = 'Abcdefg!@#pass';
    dto.birthday = '2000-01-01';
    dto.verificationToken = 'valid-token';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('email');
  });

  it('이름이 2글자 미만이면 유효성 검증 실패', async () => {
    const dto = new RegisterDto();
    dto.email = 'test@example.com';
    dto.name = 'A';
    dto.password = 'Abcdefg!@#pass';
    dto.birthday = '2000-01-01';
    dto.verificationToken = 'valid-token';

    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === 'name');
    expect(nameError).toBeDefined();
  });

  it('비밀번호가 8글자 미만이면 유효성 검증 실패', async () => {
    const dto = new RegisterDto();
    dto.email = 'test@example.com';
    dto.name = '홍길동';
    dto.password = 'Ab!1';
    dto.birthday = '2000-01-01';
    dto.verificationToken = 'valid-token';

    const errors = await validate(dto);
    const pwError = errors.find((e) => e.property === 'password');
    expect(pwError).toBeDefined();
  });

  it('비밀번호가 첫 글자 대문자가 아니면 유효성 검증 실패', async () => {
    const dto = new RegisterDto();
    dto.email = 'test@example.com';
    dto.name = '홍길동';
    dto.password = 'abcdefg!@#pass';
    dto.birthday = '2000-01-01';
    dto.verificationToken = 'valid-token';

    const errors = await validate(dto);
    const pwError = errors.find((e) => e.property === 'password');
    expect(pwError).toBeDefined();
  });

  it('비밀번호에 특수문자가 2개 미만이면 유효성 검증 실패', async () => {
    const dto = new RegisterDto();
    dto.email = 'test@example.com';
    dto.name = '홍길동';
    dto.password = 'Abcdefg!pass';
    dto.birthday = '2000-01-01';
    dto.verificationToken = 'valid-token';

    const errors = await validate(dto);
    const pwError = errors.find((e) => e.property === 'password');
    expect(pwError).toBeDefined();
  });

  it('비밀번호에 생일 패턴이 포함되면 유효성 검증 실패', async () => {
    const dto = new RegisterDto();
    dto.email = 'test@example.com';
    dto.name = '홍길동';
    dto.password = 'A!@2000010100';
    dto.birthday = '2000-01-01';
    dto.verificationToken = 'valid-token';

    const errors = await validate(dto);
    const pwError = errors.find((e) => e.property === 'password');
    expect(pwError).toBeDefined();
  });

  it('생일이 ISO 날짜 형식이 아니면 유효성 검증 실패', async () => {
    const dto = new RegisterDto();
    dto.email = 'test@example.com';
    dto.name = '홍길동';
    dto.password = 'Abcdefg!@#pass';
    dto.birthday = 'not-a-date';
    dto.verificationToken = 'valid-token';

    const errors = await validate(dto);
    const birthError = errors.find((e) => e.property === 'birthday');
    expect(birthError).toBeDefined();
  });
});

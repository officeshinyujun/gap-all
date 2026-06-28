let currentIndex = 0;
const MAX_KEYS = 10;

const allKeys: string[] = [];
for (let i = 1; i <= MAX_KEYS; i++) {
  const key = i === 1
    ? process.env.OPENAI_API_KEY
    : process.env[`OPENAI_API_KEY${i}`];
  if (key && key.length > 0) allKeys.push(key);
}

export function getOpenAIApiKey(): string {
  if (allKeys.length === 0) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  }
  const key = allKeys[currentIndex % allKeys.length];
  currentIndex++;
  return key;
}

export function getOpenAIApiKeyCount(): number {
  return allKeys.length;
}

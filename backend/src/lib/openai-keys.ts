let currentIndex = 0;
let allKeys: string[] | null = null;

function loadKeys(): string[] {
  if (allKeys === null) {
    const keys: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const key = i === 1
        ? process.env.OPENAI_API_KEY
        : process.env[`OPENAI_API_KEY${i}`];
      if (key && key.length > 0) keys.push(key);
    }
    allKeys = keys;
  }
  return allKeys;
}

export function getOpenAIApiKey(): string {
  const keys = loadKeys();
  if (keys.length === 0) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  }
  const key = keys[currentIndex % keys.length];
  currentIndex++;
  return key;
}

export function getOpenAIApiKeyCount(): number {
  return loadKeys().length;
}

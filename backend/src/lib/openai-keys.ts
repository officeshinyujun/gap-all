import OpenAI from 'openai';

let currentIndex = 0;
let clientIndex = 0;
let allKeys: string[] | null = null;
let clients: OpenAI[] | null = null;

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

function loadClients(): OpenAI[] {
  if (clients === null) {
    const keys = loadKeys();
    clients = keys.map(key => new OpenAI({ apiKey: key }));
  }
  return clients;
}

export function getOpenAIClient(): OpenAI {
  const all = loadClients();
  if (all.length === 0) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  }
  const client = all[clientIndex % all.length];
  clientIndex++;
  return client;
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

# GAP 플랫폼 백엔드 요구서

## 1. 서비스 개요

GAP은 한국 직업계 고등학교 학생을 위한 AI 기반 학습 플랫폼입니다. 핵심 기능은 세 가지입니다.

- **학습(Study)**: 단원별 개념 학습 + 진도 관리
- **시험(Exam)**: AI가 생성한 문제를 수능특강 스타일로 렌더링하여 풀기
- **채팅(Chat)**: AI와 과목 관련 질의응답

---

## 2. 기술 스택

| 항목 | 선택 |
|------|------|
| 런타임 | Node.js |
| 프레임워크 | NestJS |
| ORM | Prisma |
| DB | PostgreSQL |
| AI | OpenAI API (문제 생성, 채팅) |
| 인증 | JWT (Access + Refresh Token) |
| 파일 저장 | S3 또는 로컬 |

---

## 3. 도메인 모델 (ERD)

```
User
├── id (uuid)
├── email (unique)
├── name
├── passwordHash
├── profileImageUrl?
├── studyStreakDays (default 0)
├── createdAt
│
├── StudyProgress[]
├── ExamRecord[]
└── ChatSession[]

Subject
├── id (uuid)
├── slug (unique) — "success", "industry"
├── title — "성공적인 직업생활", "공업 일반"
│
├── Unit[]
└── ExamRecord[]

Unit
├── id (uuid)
├── subjectId → Subject
├── unitNumber
├── title
│
└── StudyProgress[]

StudyProgress
├── id (uuid)
├── userId → User
├── unitId → Unit
├── studyMode (enum: BASIC_CONCEPT | BLANK_FILL | INTERACTIVE_QUIZ | PRACTICE_EXAM | REVIEW_INCORRECT)
├── progressPercent (0~100)
└── lastStudiedAt

ExamRecord
├── id (uuid)
├── userId → User
├── subjectId → Subject
├── title
├── startUnitNum
├── endUnitNum
├── difficulty (enum: BEGINNER | INTERMEDIATE | ADVANCED | HARD | EXTREME)
├── questionCount
├── customPrompt?
├── totalScore?
├── createdAt
│
├── ExamTag[]
└── ExamItem[]

ExamTag
├── id (uuid)
├── examId → ExamRecord
└── tagName

ExamItem
├── id (uuid)
├── examId → ExamRecord
├── orderIndex
├── userAnswer?
├── isCorrect (default false)
└── questionId → Question

Question
├── id (uuid)
├── subjectId → Subject
├── unitId → Unit
├── targetConcept
├── itemType            — "하" | "중" | "상" | "극상"
├── difficulty          — BEGINNER | INTERMEDIATE | ADVANCED | HARD | EXTREME
├── recommendedTemplate — TPL_* 이름
├── questionStem        — 지시문 텍스트
├── stimulusData        — JSON (TPL_* 스키마)
├── optionsList         — JSON string[]
├── explanation         — JSON { judgment, distractor_1, distractor_2, ... }
├── correctAnswer       — 1~5
└── createdAt

ChatSession
├── id (uuid)
├── userId → User
├── subjectId? → Subject
├── title
├── searchScope?
└── createdAt

ChatMessage
├── id (uuid)
├── chatSessionId → ChatSession
├── sender (enum: USER | AI)
├── message
└── createdAt
```

---

## 4. API 엔드포인트 명세

### 4-1. 인증 `/auth`

| Method | Path | 설명 |
|--------|------|------|
| POST | `/auth/register` | 회원가입 |
| POST | `/auth/login` | 로그인 → Access/Refresh Token 발급 |
| POST | `/auth/refresh` | Access Token 갱신 |
| POST | `/auth/logout` | Refresh Token 무효화 |

**POST /auth/register**
```json
Request:  { "email": "...", "password": "...", "name": "..." }
Response: { "user": User, "accessToken": "...", "refreshToken": "..." }
```

**POST /auth/login**
```json
Request:  { "email": "...", "password": "..." }
Response: { "user": User, "accessToken": "...", "refreshToken": "..." }
```

---

### 4-2. 사용자 `/users`

| Method | Path | 설명 |
|--------|------|------|
| GET | `/users/me` | 내 프로필 조회 |
| PATCH | `/users/me` | 프로필 수정 |
| GET | `/users/me/stats` | 학습 통계 (스트릭, 진도율 등) |

**GET /users/me/stats 응답**
```json
{
  "studyStreakDays": 7,
  "totalProgressPercent": 42,
  "subjectStats": [
    {
      "subjectSlug": "success",
      "subjectTitle": "성공적인 직업생활",
      "progressPercent": 60,
      "completedUnits": 3,
      "totalUnits": 5
    }
  ]
}
```

---

### 4-3. 과목 `/subjects`

| Method | Path | 설명 |
|--------|------|------|
| GET | `/subjects` | 전체 과목 목록 |
| GET | `/subjects/:slug` | 과목 상세 (단원 목록 포함) |
| GET | `/subjects/:slug/units` | 단원 목록 |

---

### 4-4. 학습 진도 `/study`

| Method | Path | 설명 |
|--------|------|------|
| GET | `/study/:subjectSlug/progress` | 내 과목별 진도 전체 조회 |
| GET | `/study/:subjectSlug/units` | 단원 + 진도 병합 조회 |
| POST | `/study/progress` | 진도 업데이트 |
| GET | `/study/streak` | 학습 스트릭 조회 |

**POST /study/progress**
```json
Request: {
  "unitId": "...",
  "studyMode": "BLANK_FILL",
  "progressPercent": 60
}
Response: { "progress": StudyProgress }
```

**GET /study/:subjectSlug/units 응답**
```json
{
  "units": [
    {
      "id": "...",
      "unitNumber": 1,
      "title": "직업과 직업 생활",
      "progress": 75,
      "subUnits": [
        {
          "studyMode": "BASIC_CONCEPT",
          "title": "기본 개념",
          "progressPercent": 100,
          "status": "completed",
          "lastStudiedAt": "2026-05-08T..."
        }
      ]
    }
  ]
}
```

---

### 4-5. 시험 `/exams`

| Method | Path | 설명 |
|--------|------|------|
| GET | `/exams/:subjectSlug` | 내 시험 목록 조회 |
| POST | `/exams` | 시험 생성 (AI 문제 생성 포함) |
| GET | `/exams/:examId` | 시험 상세 (문항 포함) |
| DELETE | `/exams/:examId` | 시험 삭제 |
| POST | `/exams/:examId/submit` | 답안 제출 + 채점 |
| GET | `/exams/:examId/result` | 채점 결과 조회 |

**POST /exams — 시험 생성**
```json
Request: {
  "subjectId": "...",
  "startUnitNum": 1,
  "endUnitNum": 4,
  "difficulty": "INTERMEDIATE",
  "questionCount": 10,
  "customPrompt": "..."
}
Response: {
  "exam": ExamRecord,
  "items": [
    {
      "id": "...",
      "orderIndex": 1,
      "question": {
        "id": "...",
        "targetConcept": "...",
        "recommendedTemplate": "TPL_COMPARATIVE_MATRIX",
        "questionStem": "...",
        "stimulusData": { ... },
        "optionsList": ["...", "...", "...", "...", "..."]
      }
    }
  ]
}
```

**POST /exams/:examId/submit — 답안 제출**
```json
Request: {
  "answers": [
    { "examItemId": "...", "answer": 3 },
    { "examItemId": "...", "answer": 1 }
  ]
}
Response: {
  "score": 80,
  "correctCount": 8,
  "totalCount": 10,
  "items": ExamItem[]
}
```

**GET /exams/:examId/result — 채점 결과**
```json
{
  "exam": ExamRecord,
  "score": 80,
  "correctCount": 8,
  "totalCount": 10,
  "items": [
    {
      "id": "...",
      "orderIndex": 1,
      "userAnswer": 3,
      "isCorrect": true,
      "question": {
        "questionStem": "...",
        "stimulusData": { ... },
        "optionsList": ["..."],
        "explanation": { "judgment": "...", "distractor_1": "..." },
        "correctAnswer": 3
      }
    }
  ]
}
```

---

### 4-6. 문제 `/questions`

| Method | Path | 설명 |
|--------|------|------|
| GET | `/questions/:id` | 문제 단건 조회 |
| GET | `/questions` | 문제 목록 (필터: subjectId, unitId, template, difficulty) |
| POST | `/questions/generate` | AI로 문제 생성 (관리자용) |

**GET /questions 쿼리 파라미터**
```
?subjectId=...&unitId=...&template=TPL_COMPARATIVE_MATRIX&difficulty=INTERMEDIATE&page=1&limit=20
```

**GET /questions/:id 응답**
```json
{
  "id": "...",
  "targetConcept": "의사소통 능력",
  "itemType": "중",
  "difficulty": "INTERMEDIATE",
  "recommendedTemplate": "TPL_CONVERSATIONAL_FLOW",
  "questionStem": "다음 대화를 읽고...",
  "stimulusData": { ... },
  "optionsList": ["...", "...", "...", "...", "..."],
  "explanation": {
    "judgment": "...",
    "distractor_1": "...",
    "distractor_2": "...",
    "distractor_3": "...",
    "distractor_4": "..."
  },
  "correctAnswer": 1
}
```

---

### 4-7. 채팅 `/chat`

| Method | Path | 설명 |
|--------|------|------|
| GET | `/chat/sessions` | 내 채팅 세션 목록 |
| POST | `/chat/sessions` | 새 채팅 세션 생성 |
| GET | `/chat/sessions/:sessionId` | 세션 상세 (메시지 포함) |
| DELETE | `/chat/sessions/:sessionId` | 세션 삭제 |
| POST | `/chat/sessions/:sessionId/messages` | 메시지 전송 + AI 응답 |

**POST /chat/sessions**
```json
Request:  { "subjectId": "...", "title": "광합성 질문" }
Response: { "session": ChatSession }
```

**POST /chat/sessions/:sessionId/messages**
```json
Request:  { "message": "광합성이 뭔가요?" }
Response: {
  "userMessage": ChatMessage,
  "aiMessage": ChatMessage
}
```

---

## 5. AI 연동 명세

### 5-1. 문제 생성 (Exam Generation)

**트리거**: `POST /exams` 호출 시 내부적으로 실행

**프롬프트 구성 요소**
- 과목명, 단원 범위, 난이도, 문항 수
- 9개 TPL 스키마 정의 (questionstem.ts 기반)
- customPrompt (선택)

**AI 출력 스키마** (exam3.json 형식 기준)
```json
[
  {
    "metadata": {
      "unit_name": "4단원",
      "target_concept": "의사소통 능력",
      "item_type": "중",
      "difficulty": "중",
      "recommended_template": "TPL_CONVERSATIONAL_FLOW"
    },
    "render_ready": {
      "question_stem": "다음 대화를 읽고...",
      "stimulus_data": { ... },
      "options_list": ["...", "...", "...", "...", "..."]
    },
    "explanation": {
      "judgment": "...",
      "distractor_1": "...",
      "distractor_2": "...",
      "distractor_3": "...",
      "distractor_4": "..."
    },
    "correct_answer": 1
  }
]
```

**검증 절차**
1. JSON 파싱 성공 여부 확인
2. `inferTemplate(stimulusData)`로 템플릿 추론 가능 여부 확인
3. `optionsList` 길이 5개 확인
4. `correctAnswer` 1~5 범위 확인
5. 실패 시 재생성 요청 (최대 3회)

---

### 5-2. 채팅 AI (Q&A)

**트리거**: `POST /chat/sessions/:sessionId/messages`

**컨텍스트 구성**
```
[시스템 프롬프트]
- 과목: 성공적인 직업생활
- 역할: 해당 과목 전문 튜터
- 교재 범위 내에서만 답변

[이전 메시지 히스토리 (최근 10개)]
User: ...
AI: ...

[현재 질문]
User: ...
```

**응답**: 단건 응답 (초기), 이후 스트리밍으로 전환 가능

---

## 6. 인증/권한

| 구분 | 엔드포인트 |
|------|-----------|
| 공개 | `POST /auth/register`, `POST /auth/login`, `GET /subjects`, `GET /subjects/:slug` |
| 인증 필요 | 나머지 모든 엔드포인트 |
| 관리자 | `POST /questions/generate`, Subject/Unit CRUD |

JWT Bearer Token 방식. `Authorization: Bearer <accessToken>` 헤더 사용.

---

## 7. 주요 비즈니스 로직

### 7-1. 시험 생성 플로우
```
1. POST /exams 요청 수신
2. 파라미터 검증 (단원 범위, 난이도, 문항 수)
3. OpenAI API 호출 → ExamQuestion[] JSON 생성
4. JSON 파싱 + inferTemplate() 검증
5. Question 레코드 DB 저장
6. ExamRecord 생성
7. ExamItem 레코드 생성 (orderIndex 부여)
8. 응답 반환
```

### 7-2. 채점 플로우
```
1. POST /exams/:examId/submit 요청 수신
2. 각 ExamItem의 userAnswer 저장
3. Question.correctAnswer와 비교 → isCorrect 업데이트
4. ExamRecord.totalScore 계산 및 저장 (정답 수 / 전체 * 100)
5. 결과 반환
```

### 7-3. 학습 스트릭 계산
```
1. StudyProgress 업데이트 시 트리거
2. 해당 유저의 StudyProgress.lastStudiedAt 목록 조회
3. 오늘 포함 연속 학습일 계산
4. User.studyStreakDays 업데이트
```

---

## 8. 폴더 구조 (NestJS)

```
backend/
├── src/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── dto/
│   │   └── strategies/          # jwt.strategy.ts, local.strategy.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   └── dto/
│   ├── subjects/
│   │   ├── subjects.module.ts
│   │   ├── subjects.controller.ts
│   │   ├── subjects.service.ts
│   │   └── dto/
│   ├── study/
│   │   ├── study.module.ts
│   │   ├── study.controller.ts
│   │   ├── study.service.ts
│   │   └── dto/
│   ├── exams/
│   │   ├── exams.module.ts
│   │   ├── exams.controller.ts
│   │   ├── exams.service.ts
│   │   ├── exam-generator.service.ts   # AI 문제 생성
│   │   └── dto/
│   ├── questions/
│   │   ├── questions.module.ts
│   │   ├── questions.controller.ts
│   │   ├── questions.service.ts
│   │   └── dto/
│   ├── chat/
│   │   ├── chat.module.ts
│   │   ├── chat.controller.ts
│   │   ├── chat.service.ts
│   │   ├── chat-ai.service.ts          # AI 응답
│   │   └── dto/
│   ├── common/
│   │   ├── decorators/
│   │   ├── guards/                     # jwt-auth.guard.ts, roles.guard.ts
│   │   ├── filters/                    # http-exception.filter.ts
│   │   └── pipes/                      # validation.pipe.ts
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   └── app.module.ts
├── prisma/
│   └── schema.prisma
├── .env
├── .env.example
└── package.json
```

---

## 9. Prisma 스키마

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id              String          @id @default(uuid())
  email           String          @unique
  name            String
  passwordHash    String
  profileImageUrl String?
  studyStreakDays  Int             @default(0)
  createdAt       DateTime        @default(now())

  progress        StudyProgress[]
  exams           ExamRecord[]
  chatSessions    ChatSession[]
}

model Subject {
  id       String  @id @default(uuid())
  slug     String  @unique
  title    String

  units    Unit[]
  exams    ExamRecord[]
  questions Question[]
  chatSessions ChatSession[]
}

model Unit {
  id          String  @id @default(uuid())
  subjectId   String
  unitNumber  Int
  title       String

  subject     Subject         @relation(fields: [subjectId], references: [id])
  progress    StudyProgress[]
  questions   Question[]
}

model StudyProgress {
  id              String      @id @default(uuid())
  userId          String
  unitId          String
  studyMode       StudyMode
  progressPercent Int         @default(0)
  lastStudiedAt   DateTime    @default(now())

  user  User  @relation(fields: [userId], references: [id])
  unit  Unit  @relation(fields: [unitId], references: [id])

  @@unique([userId, unitId, studyMode])
}

enum StudyMode {
  BASIC_CONCEPT
  BLANK_FILL
  INTERACTIVE_QUIZ
  PRACTICE_EXAM
  REVIEW_INCORRECT
}

model ExamRecord {
  id            String      @id @default(uuid())
  userId        String
  subjectId     String
  title         String
  startUnitNum  Int
  endUnitNum    Int
  difficulty    Difficulty
  questionCount Int
  customPrompt  String?
  totalScore    Int?
  createdAt     DateTime    @default(now())

  user      User        @relation(fields: [userId], references: [id])
  subject   Subject     @relation(fields: [subjectId], references: [id])
  tags      ExamTag[]
  items     ExamItem[]
}

model ExamTag {
  id      String  @id @default(uuid())
  examId  String
  tagName String

  exam  ExamRecord  @relation(fields: [examId], references: [id])
}

model ExamItem {
  id          String   @id @default(uuid())
  examId      String
  questionId  String
  orderIndex  Int
  userAnswer  Int?
  isCorrect   Boolean  @default(false)

  exam      ExamRecord  @relation(fields: [examId], references: [id])
  question  Question    @relation(fields: [questionId], references: [id])
}

model Question {
  id                  String      @id @default(uuid())
  subjectId           String
  unitId              String
  targetConcept       String
  itemType            String
  difficulty          Difficulty
  recommendedTemplate String
  questionStem        String
  stimulusData        Json
  optionsList         Json
  explanation         Json
  correctAnswer       Int
  createdAt           DateTime    @default(now())

  subject   Subject     @relation(fields: [subjectId], references: [id])
  unit      Unit        @relation(fields: [unitId], references: [id])
  examItems ExamItem[]
}

enum Difficulty {
  BEGINNER
  INTERMEDIATE
  ADVANCED
  HARD
  EXTREME
}

model ChatSession {
  id          String    @id @default(uuid())
  userId      String
  subjectId   String?
  title       String
  searchScope String?
  createdAt   DateTime  @default(now())

  user      User          @relation(fields: [userId], references: [id])
  subject   Subject?      @relation(fields: [subjectId], references: [id])
  messages  ChatMessage[]
}

model ChatMessage {
  id            String      @id @default(uuid())
  chatSessionId String
  sender        ChatSender
  message       String
  createdAt     DateTime    @default(now())

  chatSession ChatSession @relation(fields: [chatSessionId], references: [id])
}

enum ChatSender {
  USER
  AI
}
```

---

## 10. 환경 변수

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/gap

# JWT
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# App
PORT=3001
NODE_ENV=development
```

---

## 11. 구현 우선순위

| 단계 | 내용 | 예상 소요 |
|------|------|-----------|
| 1단계 | Prisma 스키마 + DB 마이그레이션 | 1일 |
| 2단계 | 인증 (register / login / JWT) | 1일 |
| 3단계 | Subject / Unit CRUD + 시드 데이터 | 1일 |
| 4단계 | StudyProgress API | 1일 |
| 5단계 | Question 저장 + ExamRecord CRUD | 1일 |
| 6단계 | AI 문제 생성 (exam-generator) | 2일 |
| 7단계 | 채점 로직 | 1일 |
| 8단계 | Chat + AI 응답 | 2일 |

---

## 12. 미결 사항 결정

| 항목 | 결정 |
|------|------|
| AI 문제 생성 방식 | 차후 설정 예정 |
| 채팅 AI 컨텍스트 | RAG 방식 — 교재 PDF를 벡터 DB에 저장 후 검색하여 컨텍스트 제공 |
| 문제 재사용 | 재사용 — 동일 개념 문제를 Question 테이블에 저장하고 여러 시험에서 공유 |

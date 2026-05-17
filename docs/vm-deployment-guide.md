# GAP VM 직접 배포 가이드

## 문서 목적

이 문서는 현재 `gap` 프로젝트를 클라우드 VM 또는 사내 VM에 **직접 올려서 운영**하려는 경우를 기준으로 작성했다.

이 프로젝트는 **npm workspaces 기반 모노레포**로 구성되어 있다. 루트 `package.json`이 아래 네 앱을 워크스페이스로 묶고 있다.

- `backend/`: NestJS API 서버, 기본 포트 `3001`
- `frontend/`: Next.js 사용자 프론트엔드, 기본 `next start` 포트 사용
- `dashboard/`: Next.js 관리자/대시보드, 기본 포트 `3002`
- `landing/`: Vite 기반 랜딩 페이지, 선택 배포 가능
- DB: PostgreSQL 필요 (`DATABASE_URL` 사용)

운영 기준으로 가장 중요한 조합은 보통 아래 둘이다.

1. `backend` + PostgreSQL
2. 여기에 `frontend` 또는 `dashboard`를 목적에 맞게 추가

`landing`은 필수 운영 요소라기보다 별도 정적 프론트에 가깝기 때문에, 먼저 `backend`와 실제 사용하는 Next 앱(`frontend`, `dashboard` 중 필요한 것)을 안정적으로 올린 뒤 필요하면 추가하는 흐름을 권장한다.

---

## 1. 권장 배포 구조

가장 단순하고 관리하기 쉬운 형태는 아래 구조다.

- VM 1대
- PostgreSQL 1개
- Node.js 프로세스 2~3개
  - `backend` → `127.0.0.1:3001`
  - `frontend` → `127.0.0.1:3000` 또는 별도 지정 포트
  - `dashboard` → `127.0.0.1:3002`
- Nginx 1개
  - `https://api.2830.cloud` → backend 프록시
  - `https://app.2830.cloud` → frontend 프록시
  - `https://admin.2830.cloud` → dashboard 프록시

가능하면 `backend`, `frontend`, `dashboard`는 외부에 직접 포트를 열지 말고, **Nginx 뒤에서 localhost 바인딩**으로 운영하는 편이 안전하다.

---

## 2. 배포 전 꼭 확인할 점

### 2.1 필수 런타임

이 프로젝트를 VM에 올리기 전에 아래가 필요하다.

- Ubuntu 22.04 LTS 같은 일반적인 Linux VM
- Node.js 20 이상 권장
- npm
- PostgreSQL
- Nginx
- 프로세스 매니저 (`pm2` 권장)

### 2.2 백엔드 환경 변수

코드 기준으로 백엔드는 최소한 아래 값이 필요하다.

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

실제로 운영하려면 보통 아래도 함께 넣어야 한다.

- `PORT`
- `NODE_ENV=production`
- `CORS_ORIGINS`
- `FRONTEND_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- 필요 시 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`

### 2.3 프론트 환경 변수

이 저장소에는 Next 앱이 두 개 있다.

- `frontend/`: 사용자용 프론트
- `dashboard/`: 관리자용 프론트

`dashboard`는 코드상 두 이름이 혼용되고 있다.

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_API_BASE`

운영 환경에서는 **두 값 모두 같은 API 주소로 맞춰 주는 것**이 안전하다.

예시:

```env
NEXT_PUBLIC_API_URL=https://api.2830.cloud
NEXT_PUBLIC_API_BASE=https://api.2830.cloud
```

추가로 `frontend`는 푸시 알림 관련 공개 키를 사용한다.

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

따라서 사용자용 프론트를 배포한다면 아래 예시처럼 API 주소와 함께 넣는 편이 좋다.

```env
NEXT_PUBLIC_API_URL=https://api.2830.cloud
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-public-vapid-key
```

---

## 3. VM 초기 세팅

아래는 Ubuntu 계열 VM 기준 예시다.

### 3.1 패키지 업데이트

```bash
sudo apt update
sudo apt upgrade -y
```

### 3.2 기본 패키지 설치

```bash
sudo apt install -y git curl nginx postgresql postgresql-contrib
```

### 3.3 Node.js 설치

NodeSource를 쓰는 방식이 가장 단순하다.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### 3.4 PM2 설치

```bash
sudo npm install -g pm2
pm2 -v
```

---

## 4. PostgreSQL 준비

### 4.1 DB와 사용자 생성

```bash
sudo -u postgres psql
```

PostgreSQL 콘솔에서 아래 실행:

```sql
CREATE DATABASE gap;
CREATE USER gap_user WITH ENCRYPTED PASSWORD 'change-this-password';
GRANT ALL PRIVILEGES ON DATABASE gap TO gap_user;
```

필요하면 아래도 같이 준다.

```sql
\c gap
GRANT ALL ON SCHEMA public TO gap_user;
ALTER SCHEMA public OWNER TO gap_user;
```

운영용 `DATABASE_URL` 예시:

```env
DATABASE_URL=postgresql://gap_user:change-this-password@127.0.0.1:5432/gap
```

---

## 5. 소스 배치 및 의존성 설치

예시 경로를 `/srv/gap`으로 잡겠다.

```bash
sudo mkdir -p /srv/gap
sudo chown -R $USER:$USER /srv/gap
git clone <YOUR_REPOSITORY_URL> /srv/gap
```

만약 이미 로컬에서 작업한 코드를 VM으로 올리는 중이면, Git 저장소를 push 한 뒤 VM에서 clone 하는 방식이 제일 깔끔하다.

### 5.1 모노레포 전체 의존성 설치

이 프로젝트는 npm workspaces를 사용하므로, **루트에서 한 번만 `npm install`을 실행**하면 모든 앱의 의존성이 함께 설치된다.

```bash
cd /srv/gap
npm install
```

이 명령 하나로 `backend`, `frontend`, `dashboard`, `landing` 네 앱의 `node_modules`가 모두 준비된다. 각 앱 폴더에서 따로 `npm install`을 할 필요가 없다.

만약 호이스팅 충돌로 특정 앱의 빌드가 깨지는 경우에는, 해당 앱 폴더에서 개별적으로 `npm install`을 실행해도 된다.

---

## 6. backend 배포

### 6.1 의존성 설치

루트에서 `npm install`을 이미 실행했다면 별도 설치가 필요 없다. 만약 개별 설치가 필요하면:

```bash
npm install -w backend
```

### 6.2 운영 환경 변수 파일 작성

`backend/.env` 또는 쉘 환경 변수 방식 중 하나를 쓰면 된다. 단, 운영에서는 **실제 비밀값을 Git에 넣으면 안 된다.**

예시:

```env
DATABASE_URL=postgresql://gap_user:change-this-password@127.0.0.1:5432/gap
JWT_ACCESS_SECRET=replace-with-long-random-secret
JWT_REFRESH_SECRET=replace-with-long-random-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
OPENAI_API_KEY=replace-me
OPENAI_MODEL=gpt-4o
PORT=3001
NODE_ENV=production
CORS_ORIGINS=https://admin.2830.cloud
FRONTEND_URL=https://admin.2830.cloud
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@2830.cloud
SMTP_PASS=your-app-password
SMTP_FROM=GAP <your-email@2830.cloud>
```

### 6.3 빌드

```bash
npm run build:backend
```

또는 루트에서 워크스페이스 지정:

```bash
npm run build -w backend
```

### 6.4 단독 실행 확인

```bash
npm run start:backend
```

또는 앱 폴더에서 직접:

```bash
cd /srv/gap/backend
npm run start:prod
```

정상 동작이 확인되면 `Ctrl+C`로 종료하고 PM2로 등록한다.

### 6.5 PM2 등록

```bash
pm2 start /srv/gap/backend/dist/main.js --name gap-backend
pm2 save
pm2 startup
```

백엔드는 코드상 `PORT` 기본값이 `3001`이므로, 환경 변수를 주지 않으면 3001로 뜬다.

---

## 7. frontend 배포

`frontend/`는 사용자용 Next.js 앱이다.

### 7.1 의존성 설치

루트에서 `npm install`을 이미 실행했다면 별도 설치가 필요 없다. 만약 개별 설치가 필요하면:

```bash
npm install -w frontend
```

### 7.2 환경 변수 작성

`frontend/.env.local` 예시:

```env
NEXT_PUBLIC_API_URL=https://api.2830.cloud
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-public-vapid-key
```

### 7.3 빌드

```bash
npm run build:frontend
```

### 7.4 단독 실행 확인

```bash
npm run start:frontend
```

또는 포트를 명시하려면:

```bash
cd /srv/gap/frontend
npm run start -- --port 3000
```

`frontend/package.json`에는 포트가 고정되어 있지 않아서, 운영에서는 PM2 또는 실행 명령에서 포트를 명시하는 편이 관리하기 쉽다.

### 7.5 PM2 등록

```bash
pm2 start npm --name gap-frontend --cwd /srv/gap/frontend -- start -- --port 3000
pm2 save
```

---

## 8. dashboard 배포

### 8.1 의존성 설치

루트에서 `npm install`을 이미 실행했다면 별도 설치가 필요 없다. 만약 개별 설치가 필요하면:

```bash
npm install -w dashboard
```

### 8.2 환경 변수 작성

`dashboard/.env.local` 예시:

```env
NEXT_PUBLIC_API_URL=https://api.2830.cloud
NEXT_PUBLIC_API_BASE=https://api.2830.cloud
```

### 8.3 빌드

```bash
npm run build:dashboard
```

### 8.4 단독 실행 확인

```bash
npm run start:dashboard
```

코드상 `next start -p 3002`로 실행되므로, 운영 포트는 기본적으로 `3002`다.

정상 확인 후 종료하고 PM2로 등록한다.

### 8.5 PM2 등록

```bash
pm2 start npm --name gap-dashboard --cwd /srv/gap/dashboard -- start
pm2 save
```

---

## 9. landing 배포 여부

`landing/`은 현재 Vite 프로젝트다. 꼭 VM에 같이 올릴 필요는 없다.

- 관리자 페이지가 목적이면 `dashboard`만으로 충분할 수 있다.
- 별도 공개 웹사이트가 필요하면 `landing`도 배포한다.

VM에 같이 올리려면 아래처럼 진행하면 된다.

```bash
npm run build:landing
```

빌드 결과물은 일반적으로 `landing/dist/`에 생성되므로, Nginx 정적 파일 서빙으로 연결하는 방식이 가장 단순하다.

---

## 10. DNS 설정 (2830.cloud)

도메인을 구매한 뒤, DNS 관리 패널에서 아래 A 레코드를 추가한다.

| 타입 | 호스트 | 값 (VM IP) | TTL |
|------|--------|------------|-----|
| A | `api` | `<VM_IP>` | 300 |
| A | `app` | `<VM_IP>` | 300 |
| A | `admin` | `<VM_IP>` | 300 |

설정 후 실제 반영까지 수 분~수십 분 걸릴 수 있다. 확인하려면:

```bash
dig api.2830.cloud +short
dig app.2830.cloud +short
dig admin.2830.cloud +short
```

세 개 모두 VM의 공인 IP가 나오면 DNS 설정 완료다.

---

## 11. Nginx reverse proxy 설정

아래 예시는 API, 사용자 프론트, Dashboard를 서브도메인으로 분리하는 방식이다.

### 11.1 Backend용 서버 블록

`/etc/nginx/sites-available/gap-api`

```nginx
server {
    listen 80;
    server_name api.2830.cloud;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 11.2 Frontend용 서버 블록

`/etc/nginx/sites-available/gap-frontend`

```nginx
server {
    listen 80;
    server_name app.2830.cloud;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 11.3 Dashboard용 서버 블록

`/etc/nginx/sites-available/gap-dashboard`

```nginx
server {
    listen 80;
    server_name admin.2830.cloud;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 11.4 활성화

```bash
sudo ln -s /etc/nginx/sites-available/gap-api /etc/nginx/sites-enabled/gap-api
sudo ln -s /etc/nginx/sites-available/gap-frontend /etc/nginx/sites-enabled/gap-frontend
sudo ln -s /etc/nginx/sites-available/gap-dashboard /etc/nginx/sites-enabled/gap-dashboard
sudo nginx -t
sudo systemctl reload nginx
```

---

## 12. HTTPS 적용

실운영이면 HTTP 그대로 두지 말고 HTTPS를 반드시 붙이는 편이 좋다.

예시:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.2830.cloud -d app.2830.cloud -d admin.2830.cloud
```

HTTPS를 붙인 뒤에는 아래 값들도 실제 도메인 기준으로 다시 확인한다.

- `CORS_ORIGINS`
- `FRONTEND_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_API_BASE`

---

## 13. 재부팅 후 자동 시작

PM2 startup 명령을 한 번 적용한 뒤 저장 상태를 유지해야 한다.

```bash
pm2 save
pm2 list
```

서버 재부팅 뒤에도 아래 두 프로세스가 살아나는지 확인한다.

- `gap-backend`
- `gap-frontend`
- `gap-dashboard`

---

## 14. 배포 검증 체크리스트

### 14.1 백엔드

- `pm2 logs gap-backend` 에 에러가 없는지 확인
- PostgreSQL 연결 에러가 없는지 확인
- `Missing required environment variables` 에러가 없는지 확인
- 인증/쿠키 관련 요청이 정상 응답하는지 확인

### 14.2 사용자 프론트

- `pm2 logs gap-frontend` 에 빌드/런타임 에러가 없는지 확인
- 브라우저에서 `app.2830.cloud` 접속 확인
- 주요 API 호출이 `api.2830.cloud`으로 정상 연결되는지 확인
- 푸시 알림을 쓴다면 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`가 정상 반영됐는지 확인

### 14.3 대시보드

- `pm2 logs gap-dashboard` 에 빌드/런타임 에러가 없는지 확인
- 브라우저에서 `admin.2830.cloud` 접속 확인
- 로그인 후 API 호출이 `api.2830.cloud`으로 정상 연결되는지 확인

### 14.4 CORS

백엔드 코드상 `CORS_ORIGINS` 값으로 허용 도메인이 결정된다.

운영 도메인이 예를 들어 `https://admin.2830.cloud`이면 다음처럼 맞춘다.

```env
CORS_ORIGINS=https://admin.2830.cloud
```

도메인이 여러 개면 쉼표로 나눈다.

```env
CORS_ORIGINS=https://admin.2830.cloud,https://www.2830.cloud
```

---

## 15. 이 프로젝트에서 특히 주의할 점

### 15.1 production에서 DB synchronize 비활성화

백엔드 코드상 TypeORM 설정은 아래 동작을 한다.

- `NODE_ENV !== 'production'` 일 때만 `synchronize: true`
- 즉, 운영에서는 자동 스키마 동기화가 꺼짐

이건 좋은 방향이다. 대신 운영 DB 변경이 필요하면, 수동 SQL 또는 마이그레이션 전략을 별도로 잡아야 한다.

### 15.2 dashboard 환경 변수 이름 혼용

현재 코드에는 `NEXT_PUBLIC_API_URL`과 `NEXT_PUBLIC_API_BASE`가 둘 다 쓰이고 있다.

그래서 운영에서 하나만 넣으면 일부 화면은 되고 일부 화면은 실패할 수 있다. **둘 다 같은 값으로 넣는 것**을 권장한다.

### 15.3 frontend의 VAPID 공개키

`frontend`는 다음 공개 환경 변수를 사용한다.

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

이 값은 비밀키는 아니지만, 운영 푸시 기능을 쓰려면 실제 발급된 공개키로 맞춰야 한다.

### 15.4 저장소 내 실제 시크릿 사용 금지

운영 배포 전에 반드시 확인할 점이 있다.

- `.env` 실파일을 Git에 넣지 말 것
- 기존에 노출된 적 있는 시크릿은 새 값으로 교체할 것
- 운영 비밀값은 VM 내부 환경 변수나 별도 비밀 관리 수단으로만 관리할 것

특히 JWT 비밀키, OpenAI 키, SMTP 비밀번호는 운영 전 새로 발급 또는 재설정하는 편이 안전하다.

---

## 16. 추천 배포 순서

가장 덜 헷갈리는 순서는 아래다.

1. VM 생성
2. Node / PostgreSQL / Nginx / PM2 설치
3. PostgreSQL DB 생성
4. 저장소 clone
5. 루트에서 `npm install` (모노레포 전체 의존성 설치)
6. `backend` 환경 변수 작성
7. `npm run build:backend` 및 실행 확인
8. 실제 사용할 Next 앱(`frontend`, `dashboard`) 환경 변수 작성
9. `npm run build:frontend` / `npm run build:dashboard` 및 실행 확인
10. Nginx reverse proxy 연결
11. HTTPS 적용
12. 실사용 로그인/주요 API 점검

---

## 17. 자주 쓰는 운영 명령어

### PM2 상태 보기

```bash
pm2 list
```

### 로그 보기

```bash
pm2 logs gap-backend
pm2 logs gap-frontend
pm2 logs gap-dashboard
```

### 재시작

```bash
pm2 restart gap-backend
pm2 restart gap-frontend
pm2 restart gap-dashboard
```

### 코드 갱신 후 재배포

모노레포이므로 루트에서 pull 한 뒤 각 앱을 빌드하면 된다.

```bash
cd /srv/gap
git pull
npm install
```

```bash
npm run build:backend
pm2 restart gap-backend
```

```bash
npm run build:frontend
pm2 restart gap-frontend
```

```bash
npm run build:dashboard
pm2 restart gap-dashboard
```

---

## 18. 최소 배포 구성 요약

빠르게 정리하면, 이 프로젝트를 VM에 직접 올릴 때 최소 구성은 아래다.

1. PostgreSQL 설치
2. 저장소 clone 후 루트에서 `npm install`
3. `backend`에 `DATABASE_URL`, JWT 시크릿, OpenAI 키 설정
4. `npm run build:backend` 후 PM2 실행
5. 실제 사용할 Next 앱에 환경 변수 설정
   - `frontend`: `NEXT_PUBLIC_API_URL`, 필요 시 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `dashboard`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_API_BASE`
6. `npm run build:frontend` / `npm run build:dashboard` 후 PM2 실행
7. Nginx로 80/443에서 각 서비스에 프록시

이 구성으로 먼저 안정화한 뒤, 필요하면 `dashboard` 또는 `landing`을 추가하는 방식이 가장 무난하다.

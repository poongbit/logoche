# 로고체 웹

Next.js 16(App Router)으로 만든 화면과 API입니다. API 라우트가 OpenAI(GPT Image)·Claude와 Python 엔진(`../engine`)을 부르고, 폰트 하나를 만드는 일을 서버에서 이어서 돌립니다. 그리기는 GPT Image가, 이미지를 보는 일(로고 해석·글자 검사·판독)은 Claude가 맡습니다. 키는 라우트 핸들러(서버)에서만 읽습니다.

## 실행

터미널 두 개가 필요합니다.

```bash
# 1. 엔진 (자세한 내용은 ../engine/README.md)
cd engine && uv sync
uv run uvicorn logoche_engine.main:app --port 8000 --reload

# 2. 웹
cd web
cp .env.example .env.local   # 키를 채운다(아래 '설정')
npm install
npm run dev                  # http://localhost:3000
```

`.env.local`을 바꾸면 `npm run dev`를 다시 켭니다. 키 없이 화면만 보려면 `.env.local`에 `LOGOCHE_MOCK=1`을 넣습니다(모의 응답, 엔진도 필요 없음).

작업 파일은 `web/.data/`에 남습니다(`projects/` 폰트 작업, `glyphs/<작업>/` 그린 글자와 조정 표, `samples/` 견본, `mail/` 메일 카드, `auth.sqlite` 계정). 만든 TTF는 `engine/data/builds/`에 남습니다. 두 폴더 모두 저장소에는 올리지 않습니다.

## 화면

| 경로 | 화면 |
|---|---|
| `/` | 메인. 로고와 가게 이름을 넣는 접수증, 만드는 순서, 예시 폰트, 받는 것과 쓸 수 있는 범위, 자주 묻는 질문 |
| `/make/[step]` | 질문. 업종 → 사업 내용 → 글씨 모양 → 로고 권리를 한 가지씩 묻고, 구글 로그인을 거칩니다 |
| `/fonts` | 내 폰트 목록 |
| `/fonts/[id]` | 폰트 하나. 로고 읽기·견본 고르기·기준 글자 확인·그리는 중은 이 주소에서 단계별로 보이고, 다 만들면 스튜디오(써 보기, 시안, 글자 표와 글자 다듬기, 검사 결과, 제작 기록, 받기)가 됩니다 |
| `/dev/making`, `/ds-preview` | 개발용 미리보기(만드는 중 화면, 공통 부품) |

## API

요청·응답 타입은 `lib/types.ts`, 서버 코드는 `lib/server/`에 있습니다. 폰트와 글자 그림은 만든 사람만 받을 수 있고, 메인에 진열하는 폰트만 누구나 받습니다.

| 경로 | 하는 일 |
|---|---|
| `GET·POST /api/projects` | 내 폰트 목록, 새 폰트 만들기(바로 id를 돌려주고 로고 읽기부터 폰트 파일까지 서버가 이어서 돌립니다) |
| `GET·PATCH·DELETE /api/projects/[id]` | 폰트 하나의 진행 상황과 스튜디오 내용, 이름·즐겨찾기 바꾸기, 지우기 |
| `POST /api/projects/[id]/choose` | 견본 고르는 단계: 기다리기, 다시 시간 세기, 고르기 |
| `POST /api/projects/[id]/review` | 기준 글자 확인 단계: 고르기, 풀기, 계속, 고른 글자 다시 그리기 |
| `POST /api/projects/[id]/cancel` | 만드는 중인 일 멈추기(그린 글자는 남습니다) |
| `POST /api/projects/[id]/rebuild` | 빠진 글자만 그려 폰트 다시 만들기(멈춘 작업 이어 하기 포함) |
| `POST /api/projects/[id]/redraw` | 다시 볼 글자 중 고른 글자를 다시 그려 폰트 다시 만들기 |
| `GET·PUT /api/projects/[id]/tweaks` | 글자 다듬기 조정 저장·기록. 글자 하나는 폰트에 바로 반영하고, 전체(`*`)나 같은 초성·중성·종성(`cho:ㅂ`)은 폰트를 다시 만듭니다 |
| `POST /api/projects/[id]/glyph-parts` | 글자를 초성·중성·종성 영역으로 나눈 외곽선과 경계선(부분 끌어서 바꾸기) |
| `POST·PUT /api/projects/[id]/glyph-edit` | 직접 그리기: 그림판에 띄울 그림, 그린 글자 저장(저장하면 폰트에 바로 바꿔 끼웁니다) |
| `GET /api/projects/[id]/logo` | 올린 로고 그림 |
| `GET /api/font/[id]` | 폰트 파일(TTF, `?format=otf·woff·woff2`). `?download=1`이면 발급 대장에 올립니다 |
| `POST /api/font/[id]/bundle` | 모두 받기 zip(TTF·OTF, 웹폰트, OFL 원문, 제작 기록) |
| `GET /api/glyphs/jobs/[id]/images/[index]`, `…/rest/[hex]` | 그린 기준 글자·나머지 글자 그림(PNG) |
| `GET /api/style/samples/[id]` | 견본 그림(PNG) |
| `GET·DELETE /api/account` | 탈퇴 안내와 탈퇴(폰트·글자·로고·계정 삭제, 만드는 중인 폰트가 있으면 거절) |
| `/api/auth/[...all]` | 구글 로그인(Better Auth) |
| `GET /mail-card/[file]` | 메일에 넣는 카드 이미지 |

`LOGOCHE_MOCK=1`에서는 글자 다듬기·직접 그리기·부분 나누기 API가 501을 돌려줍니다.

## 설정

값은 `.env.local`에 둡니다(`.env.example` 참고).

| 이름 | 설명 |
|---|---|
| `OPENAI_API_KEY` | 견본·기준 글자·나머지 글자 그리기(GPT Image) |
| `ANTHROPIC_API_KEY` | 로고 해석·글자 검사·판독(Claude) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 구글 로그인. 리디렉션 URI는 `<BETTER_AUTH_URL>/api/auth/callback/google` |
| `FONT_ENGINE_URL` | 엔진 주소(기본 `http://127.0.0.1:8000`) |
| `OPENAI_IMAGE_MODEL`, `OPENAI_REF_IMAGE_MODEL`, `CLAUDE_VISION_MODEL` | 모델 id(쉼표로 여러 개면 앞 모델이 붐빌 때 다음 모델로 넘어갑니다). 기본은 `lib/server/env.ts`: 그리기 `gpt-image-2.5-sunburst` → `gpt-image-2.5-flare`, 보기 `claude-opus-5-5` |
| `OPENAI_IMAGE_QUALITY` | 그리기 품질(기본 high). 쓴 모델 id는 제작 기록에 남습니다 |
| `GLYPH_REST_LIMIT` | 폰트에 넣을 글자 수(기본 2350). 줄이면 자주 쓰는 글자만 그려 싸게 시험하고, 글자 세트 검사는 떨어집니다 |
| `GLYPH_SHEET_CONCURRENCY`, `GLYPH_CHECK_CONCURRENCY` | 동시에 그리고 검사하는 장 수(기본 8). OpenAI 한도에 걸리면 줄입니다 |
| `LOGOCHE_MOCK` | `1`이면 AI·엔진 대신 모의 응답 |

### 처음 키를 넣고 확인할 것

- 모델 id가 키로 쓸 수 있는 모델인지. 없는 모델이면 화면에 "OpenAI 404"가 뜨고 작업이 멈춥니다.
- OpenAI 조직 인증이 필요하면 "조직 인증이 필요해요"가 뜨고 작업이 멈춥니다. platform.openai.com 설정에서 인증합니다.
- 엔진 `/health`의 `ok`가 `true`인지(기준 서체 파일이 있는지).

# 로고체

**가게 로고 한 장으로 그 가게만의 한글 폰트(2,350자)를 약 15분 만에 만들어 주는 웹 서비스입니다.**

![우수상](https://img.shields.io/badge/%EC%B2%AD%EB%85%84%EC%B7%A8%EC%97%85%EC%82%AC%EA%B4%80%ED%95%99%EA%B5%90%20AI%20%EC%9D%B8%EC%9E%AC%20%ED%8E%98%EC%8A%A4%ED%8B%B0%EB%B2%8C%202026-%EC%9A%B0%EC%88%98%EC%83%81-gold)
[![사이트](https://img.shields.io/badge/%EC%82%AC%EC%9D%B4%ED%8A%B8-logoche.my-brightgreen)](https://logoche.my)
![폰트 라이선스](https://img.shields.io/badge/%ED%8F%B0%ED%8A%B8%20%EB%9D%BC%EC%9D%B4%EC%84%A0%EC%8A%A4-SIL%20OFL%201.1-blue)
![팀](https://img.shields.io/badge/%ED%8C%80-%2Feli30-black)

2026 청년취업사관학교 AI 인재 페스티벌 우수 프로젝트 발표회 **우수상**(서울특별시 주최, 2026.11.9) · 팀 **/eli30**: 김용휘(팀장·기획·개발), 임낙원(디자인·프론트엔드)

## 미리보기

<img src="docs/main.png" alt="로고체 메인 화면" width="720">

[![로고체 시연 영상 (YouTube)](https://img.youtube.com/vi/T9JXQpk0VMo/hqdefault.jpg)](https://youtu.be/T9JXQpk0VMo)

*▲ 시연 영상 (클릭하면 YouTube로 이동)*

<img src="docs/sign-mockup.jpg" alt="새싹체로 만든 폰트를 입힌 간판 시안" width="720">

*▲ 예시 가게 이름 '청년취업사관학교 새싹'으로 만든 폰트(새싹체, 한글 2,350자)를 간판 시안에 입힌 모습. 간판 사진은 AI로 만들었고 글자는 만든 폰트입니다. 공식 로고나 서체가 아닌 시험용 예시입니다.*

## 주요 특징

- **로고 한 장으로 폰트 한 벌**: 한글 2,350자와 숫자·문장부호 폰트(TTF·OTF·WOFF2), 간판·메뉴판 시안, 권리 카드, 제작 기록을 받습니다. 느낌을 고른 뒤 약 13~18분이 걸립니다(11/5~6 실측).
- **AI 역할 분리**: 글자 그리기는 GPT Image, 보고 판단하는 일(로고 해석·검사·판독)은 Claude가 맡고, 폰트를 만드는 엔진은 AI를 부르지 않습니다. 만든 TTF와 원래 그림의 겹침은 평균 0.979입니다.
- **권리 안전장치**: 로고 글자는 폰트에 넣지 않고 모두 새로 그립니다. 무료 폰트 69개와 견줘 0.85 이상 닮으면 다시 그립니다.
- **글자 다듬기**: 슬라이더, 끌어서 바꾸기, 초성·중성·종성 부분 나누기, 직접 그리기로 사람이 손볼 수 있고, 고친 내용은 제작 기록에 남습니다.
- **끊겨도 이어서**: 창을 닫아도 서버에서 계속 만들고 메일로 알려 줍니다. 끊기면 못 그린 글자만 다시 그립니다.

## 시작하기

### 전제 조건

- Python 3.12, [uv](https://docs.astral.sh/uv/), Node.js 24
- 폰트를 만들려면 OpenAI·Anthropic API 키와 구글 로그인(OAuth) 키가 필요합니다. 키 없이 화면만 보려면 아래 모의 모드를 쓰면 됩니다.

### 설치와 실행

```bash
git clone https://github.com/poongbit/logoche.git
cd logoche

# 1. 엔진 (터미널 1)
cd engine
uv sync
uv run python scripts/fetch_compare_fonts.py   # 처음 한 번: 닮은 폰트 검사용 무료 폰트 받기
uv run uvicorn logoche_engine.main:app --port 8000 --reload

# 2. 웹 (터미널 2, logoche 폴더에서)
cd web
cp .env.example .env.local   # AI 키 두 개와 구글 로그인 키를 채운다
npm install
npm run dev                  # http://localhost:3000
```

키 없이 화면만 보려면 `web/.env.local`에 `LOGOCHE_MOCK=1`을 넣습니다(엔진도 켜지 않아도 됩니다). 자세한 설정은 [`web/README.md`](web/README.md), [`engine/README.md`](engine/README.md), 서버 배포는 [`deploy/README.md`](deploy/README.md)에 있습니다.

## 사용법

1. 메인 화면에서 **로고와 가게 이름**을 올립니다.
2. **질문 네 개**(업종, 가게 이야기, 글씨 모양, 로고 권리)에 답하고 구글로 로그인합니다.
3. AI가 그린 **견본 세 가지** 중 하나를 고릅니다.
4. 기준 글자 30자를 확인하면 나머지 글자를 그리고, 폰트를 만들어 검사합니다.
5. **스튜디오**에서 써 보고, 간판·메뉴판 시안을 보고, 글자를 다듬고, 파일을 받습니다.

폰트 파일은 만든 사람만 받을 수 있고, 간판·메뉴판·SNS 등 가게 일에 상업적으로 쓸 수 있습니다. 폰트 파일만 따로 파는 것은 안 됩니다.

## 기술 스택

| 부분 | 쓰는 것 |
|---|---|
| 웹 | Next.js 16(App Router), React 19, TypeScript, Tailwind CSS 4, Better Auth(구글 로그인) |
| AI | OpenAI GPT Image(그리기), Anthropic Claude(로고 해석·검사·판독) |
| 엔진 | Python 3.12, FastAPI, fontTools, vtracer, OpenCV, skia-pathops |
| 배포 | AWS EC2 한 대(서울), Caddy(HTTPS) |
| 기준 서체 | Source Han Sans KR 1.001(Apache License 2.0). 글자표를 만들고 크기·자리를 맞추는 데에만 쓰고, 외곽선은 만든 폰트에 들어가지 않습니다 |

## 기여 방법

이슈로 제보해 주시면 확인하겠습니다. 코드를 고치고 싶다면 먼저 이슈로 방향을 이야기해 주세요.

- 엔진을 고쳤다면 `engine/tests/`의 관련 시험을 돌려 주세요(예: `cd engine && uv run python tests/test_parts.py`).
- API 키와 `.env.local`은 올리지 마세요. 닮은 폰트 검사용 폰트 파일도 저장소에 넣지 않습니다.
- 자료의 출처와 라이선스는 [`engine/LICENSE-NOTES.md`](engine/LICENSE-NOTES.md)에 기록합니다.

## 라이선스

- **만든 폰트**: SIL Open Font License 1.1. AI로 만들었다는 표시는 폰트 이름 정보와 권리 카드에 들어갑니다. 닮은 폰트 검사는 선별용이고 권리를 보증하지 않습니다.
- **이 저장소의 코드**: 아직 정하지 않았습니다.
- 자료별 출처는 [`engine/LICENSE-NOTES.md`](engine/LICENSE-NOTES.md)에 있습니다.

---

더 자세한 내용(왜 만들었나, 만드는 방법, 실측, 엔진을 바꿔 온 과정, 디자인, 한계와 남은 일)은 [자세한 설명](docs/README-full.md), [화면 설계 기록](design.md)에 있습니다. · *2026-11-12 기준*

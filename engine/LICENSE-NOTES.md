# 외부 자료·코드 출처

판매용 서체를 만들 엔진이라 쓰는 자료와 코드의 출처를 여기 남긴다. 새로 넣으면 이 표에 추가한다.

## 서체 자료

| 자료 | 버전 | 라이선스 | 받은 곳 | 쓰는 곳 |
|---|---|---|---|---|
| Source Han Sans KR Regular·Bold | 1.001 (태그 `1.001R`) | Apache License 2.0 (`assets/fonts/LICENSE-SourceHanSans-1.001.txt`) | github.com/adobe-fonts/source-han-sans, 2026-10-27 | MX-Font 내용 입력(Regular, 10/29), 기준 글자표 그림(이미지 API 구조 참고), 굵기 축 보정, 유사도 비교 기준, 로고 측정 보정 |

- SHA-256: Regular `a395bd79c2f08d1bbc654ec0d1d9708abdaafda97c888576b3a3c9962e045549`, Bold `a4702001bc4ce9f860fe50151e31bd8ce225e60e98a7f963256ccfaf17b0981a`
- Source Han Sans는 1.002부터 SIL OFL 1.1이다. Apache 2.0인 1.001만 쓴다. 다른 버전으로 바꾸지 않는다.
- 기준 서체의 외곽선을 그대로 넣지는 않는다. 이미지 API에 주는 기준 글자표(철자·칸 참고)와 그린 글자의 크기·자리 맞추기(잉크 상자)에 쓴다. 10/29~10/30에는 MX-Font의 내용 입력(만들 글자의 뼈대)으로도 썼다(Apache 2.0이라 파생 허용).

## 생성 모델 (10/29~10/30, 지금은 쓰지 않음)

10/30 결정으로 MX-Font를 뺐다. 코드는 `../backup/before-gpt-direct-20261030.tar.gz`에만 있고, 이제 2,350자는 이미지 API(GPT Image)가 그린다. 아래는 그동안 쓴 기록이다.

| 자료 | 라이선스 | 받은 곳 | 쓰는 곳 |
|---|---|---|---|
| MX-Font++ 생성망 코드 (`logoche_engine/mxfont_net.py`) | MIT. MX-Font Copyright (c) 2021-present NAVER Corp., MX-Font++ HAA 블록, HERIUN 정리판 | huggingface.co/HERIUN/mxfontpp-korean-handwriting 의 `modeling_mxfontpp.py`, 판 `966389df6e11be98fc62dde9cf5a9dff7d14646f`, 2026-10-29. transformers 감싸개만 뺐다 | 참고 글자 → 2,350자 생성 |
| MX-Font++ 가중치 (`data/models/mxfontpp/model.safetensors`, 저장소에 넣지 않음) | MIT (가중치). 학습 데이터는 SIL OFL 1.1 폰트 86종(Google Fonts 한글 가족, 네이버 나눔·나눔손글씨) | 같은 저장소 같은 판. `scripts/fetch_mxfont.py`가 받고 SHA-256 `22f738a0bd8d8fc4d699faa4ee668933217cbfde6900fc8771d72aa4780d87a4`를 확인 | 생성 |

- 학습 데이터가 OFL 폰트라 생성 서체는 OFL 1.1 파생물로 봤다(SIL OFL FAQ 1.25). MX-Font를 뺀 10/30 뒤에는 이 이유가 없지만, 권리 결정(OFL로 냄)은 그대로다(바꿀지는 사용자 결정). 10/29 결정: 상업 사용은 되지만 서체 파일만 따로 팔지 않는다. TTF 이름 표에 OFL 고지(nameID 13·14)를 넣고, 웹이 라이선스 원문(`assets/licenses/OFL-1.1.txt`, 웹 `public/licenses/`)을 함께 준다.
- 학습 폰트 목록: github.com/HERIUN/MXFontpp-korean `FONTS.md`(학습 86종·검증 8종).
- 아직 확인할 것: 나눔손글씨 라이선스 원문(목록은 "Naver Nanum handwriting license"로 따로 적음), 학습 폰트들의 예약 이름(RFN), OFL이 요구하는 원본 저작권 표시를 86종 각각 어떻게 넣을지(지금은 이름 표 저작권 칸에 요약 한 줄).

## 유사도 비교용 폰트 (`compare/free/`, 10/28)

생성 서체에는 들어가지 않는다. 검사할 때 글자를 그려 뼈대를 비교하는 데만 쓴다. 파일은 배포하지 않는다.

| 자료 | 라이선스 | 받은 곳 | 목록 |
|---|---|---|---|
| Google Fonts 한글 가족 38개(47개 파일) | SIL OFL 1.1 | github.com/google/fonts `ofl/`, 2026-10-28 | `compare/free/google-fonts.json` (파일·해시·주소) |
| Pretendard·SUIT | SIL OFL 1.1 | 사용자 맥 `~/Library/Fonts`, 2026-10-28 | `compare/free/local-fonts.json` |
| G마켓 산스, 넥슨 Lv1 고딕, 학교안심 알림장, 강원교육 5종, 전남교육 4종, 심경하체 | 무료 배포 폰트. 각 배포처 약관은 아직 확인 전 | 사용자 맥 `~/Library/Fonts`, 2026-10-28 | `compare/free/local-fonts.json` (이름 표의 저작권·라이선스 문구 포함) |

## 분석용 말뭉치 (`data/cache/corpus/`, 10/28)

많이 쓰는 자소를 고르는 데만 썼다(`scripts/jaso_coverage.py`). 서체나 앱에 들어가지 않는다.

| 자료 | 라이선스 | 받은 곳 |
|---|---|---|
| NSMC 시험 세트(네이버 영화 리뷰 5만 개) | CC0 1.0 | github.com/e9t/nsmc |
| KorQuAD 1.0 dev 세트(위키백과 문단) | CC BY-ND 2.0 KR | korquad.github.io |

## Python 패키지 (`pyproject.toml`)

| 패키지 | 라이선스 | 쓰는 곳 |
|---|---|---|
| fontTools | MIT | TTF 빌드, 글리프 읽기 |
| skia-pathops | BSD-3-Clause | 외곽선 정리(겹침·방향), 깨진 글자 검사 |
| vtracer | MIT | 비트맵 → 외곽선 |
| uharfbuzz | Apache-2.0 | 기준 서체 자모 조합(배치 규칙 측정) |
| freetype-py | BSD-3-Clause (FreeType은 FTL) | 글리프 래스터화 |
| opencv-python-headless | Apache-2.0 | 로고 측정, 자소표 자르기 |
| numpy | BSD-3-Clause | 배열 계산 |
| Pillow | MIT-CMU | 그림 입출력, 검사용 렌더링 |
| FastAPI · Uvicorn | MIT · BSD-3-Clause | HTTP 서버 |
| python-multipart | Apache-2.0 | 로고 파일 업로드(multipart) |
| openai | Apache-2.0 | 브랜드명 견본 이미지 생성(GPT Image) |

GPL 계열(potrace 등)은 쓰지 않는다. 외곽선 따기는 vtracer만 쓴다.

# 구조 참고 폰트 도감 (11/5, 나눔손글씨 합본)

무료 폰트 151종(기존 44 + 나눔손글씨 107, 렌더 실패 2종 제외)을 뼈대 닮음으로 13묶음(k-medoids)으로 나눴다. 생성: `engine/scripts/font_catalog.py`.

- 나눔손글씨 파일은 hangeul.naver.com에서 받아 `engine/compare/nanum-hand/`에 둔다(용량 546MB, .gitignore). 폰트 파일 안의 라이선스 필드는 비어 있어, 쓰기 전에 네이버 한글한글아름답게 사이트의 약관(OFL 여부)을 따로 확인해야 한다.
- 느슨함 = 1 − Pretendard와의 뼈대 닮음.

| 묶음 | 수 | 나눔 | 느슨함 평균 | 예 |
|---|---|---|---|---|
| 12 | 29 | 27 | 0.57 | 강원교육새음, 강원교육현옥샘, NanumAInMamSonGeurSsi, NanumBaeEunHyeCe, NanumBiSangCe, NanumBuJangNimNunCiCe |
| 6 | 18 | 2 | 0.24 | Dongle, GothicA1, GowunBatang, GowunDodum, Gugi, Hahmlet |
| 2 | 16 | 12 | 0.58 | CuteFont, Dokdo, PoorStory, Sunflower, NanumAJumMaJaYu, NanumBaReunHiPi |
| 5 | 14 | 14 | 0.66 | NanumAReumDeuRiGgocNaMu, NanumBanJjagBanJjagByeor, NanumBeomSomCe, NanumCoDingHeuiMang, NanumDaJinCe, NanumDdaAgDanDan |
| 9 | 12 | 9 | 0.67 | EastSeaDokdo, YeonSung, 심경하체, NanumAnSsangCe, NanumBeoDeuNaMu, NanumDarEuiGweDo |
| 10 | 12 | 12 | 0.65 | NanumABbaGeurSsi, NanumAGiSaRangCe, NanumBugGeugSeong, NanumDdarEGeEomMaGa, NanumEongGeongKwiCe, NanumGyuRiEuiIrGi |
| 14 | 11 | 11 | 0.67 | NanumABbaEuiYeonAePyeonJi, NanumAmSeuTeReuDam, NanumBaReunJeongSin, NanumCeorPirGeurSsi, NanumDaeGwangYuRi, NanumGangInHanWiRo |
| 4 | 10 | 10 | 0.64 | NanumBbangGuNiMamSonGeurSsi, NanumDdaDdeusHanJagByeor, NanumDungGeunInYeon, NanumGiBbeumBarkEum, NanumGoDigANiGoGoDing, NanumGoRyeoGeurGgor |
| 13 | 9 | 2 | 0.59 | Gaegu, GamjaFlower, HiMelody, SingleDay, Stylish, 강원교육모두 |
| 1 | 9 | 9 | 0.67 | NanumBrushScript, NanumPenScript, NanumGaRamYeonGgoc, NanumGangBuJangNimCe, NanumHanYunCe, NanumSoMiCe |
| 7 | 6 | 0 | 0.43 | BlackHanSans, DoHyeon, GmarketSans, Hakgyoansim Allimjang, Jua, 강원교육튼튼 |
| 8 | 3 | 3 | 0.61 | NanumMuGungHwa, NanumYeBbeunMinGyeongCe, NanumYuNiDdingDdangDdingDdang |
| 3 | 2 | 0 | 0.64 | BagelFatOne, GasoekOne |

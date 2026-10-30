import type { UploadInput } from "./types";

// "○○체 느낌으로", "○○랑 비슷하게"처럼 특정 서체를 따라 하는 요청은 받지 않는다(기획서 2-5).
// 고딕·명조처럼 서체 갈래를 말하는 것은 막지 않는다. 화면 1 원하는 느낌, 화면 2 표현 방식, 화면 3 말로 고치기에 쓴다.

// 서체 갈래와 일반적인 모양 말(막지 않는다)
const GENERIC_STYLES = ["고딕", "명조", "바탕", "돋움", "궁서", "궁", "손글씨", "붓글씨", "필기", "캘리", "둥근", "각진", "굵은", "얇은", "레트로", "픽셀", "도트"];
// '체'로 끝나지만 서체 이름이 아닌 낱말
const NOT_FONT = ["입체", "전체", "자체", "단체", "업체", "매체", "형체", "실체", "구체", "주체", "신체", "액체", "기체", "고체", "개체", "본체", "문체", "대체", "일체", "합체", "물체", "유체", "육체", "정체", "천체", "약체", "공동체", "결정체", "복합체", "연합체"];
// '체'·'폰트'로 끝나지 않아도 서체 이름인 것(앞부분이 같으면 서체 이름으로 본다).
// 카카오·나눔·배민처럼 보통 낱말이기도 한 이름은 넣지 않는다("카카오 디저트 느낌"이 막히지 않게). "카카오 폰트"·"배민체"는 끝말로 잡힌다.
const KNOWN_FONTS = [
  "프리텐다드", "pretendard", "나눔고딕", "나눔명조", "나눔스퀘어", "나눔바른", "나눔손글씨", "노토", "noto", "본고딕", "본명조",
  "맑은고딕", "애플고딕", "애플산돌", "산돌", "sandoll", "윤고딕", "윤명조", "에스코어", "지마켓", "gmarket", "스포카", "마루부리",
  "고운돋움", "고운바탕", "리디바탕", "페이퍼로지", "helvetica", "futura", "arial", "garamond", "gotham", "avenir", "montserrat", "roboto",
];
// 낱말 끝에 붙는 조사·말. 떼어 낸 뒤 서체 이름인지 본다.
const TAIL = /(이랑|랑|하고|과|와|처럼|같이|같은|같게|보다|으로|로|을|를|의|이|가|은|는|도|만|느낌|스타일)$/;
// 서체 이름에 바로 붙으면 그것만으로 따라 하려는 뜻이 되는 말(○○체로, ○○처럼)
const DIRECT = new Set(["처럼", "같이", "같은", "같게", "으로", "로", "느낌", "스타일"]);
// 글 어딘가에 있으면 따라 하려는 뜻으로 보는 말
const INTENT = /느낌|처럼|같이|같은|같게|스타일|비슷|닮|따라|흉내|똑같|그대로|베끼|베껴|카피|참고|기반/;

function isFontName(word: string): boolean {
  if (KNOWN_FONTS.some((k) => word.startsWith(k))) return true;
  const m = /^(.+?)(체|폰트|서체|글꼴)$/.exec(word);
  if (!m) return false;
  if (m[2] === "체" && NOT_FONT.some((w) => word.endsWith(w))) return false;
  return !GENERIC_STYLES.some((g) => m[1].endsWith(g));
}

export function isImitationRequest(text: string): boolean {
  // "카카오 폰트"처럼 띄어 쓴 이름을 붙인다
  const words = text.toLowerCase().replace(/\s+(체|폰트|서체|글꼴)/g, "$1").split(/[\s,.!?~·'"()]+/);
  for (const raw of words) {
    let word = raw;
    const tails: string[] = [];
    for (let i = 0; i < 3; i++) {
      const m = TAIL.exec(word);
      if (!m || m.index === 0) break;
      tails.push(m[1]);
      word = word.slice(0, m.index);
    }
    if (isFontName(word) && (tails.some((s) => DIRECT.has(s)) || INTENT.test(text))) return true;
  }
  return false;
}

export function missingUploadFields(u: UploadInput): string[] {
  const missing: string[] = [];
  if (!u.logoImage) missing.push("로고");
  if (!u.storeName.trim()) missing.push("가게 이름");
  if (!u.industry) missing.push("업종");
  if (u.brandTones.length < 2) missing.push("브랜드 톤 2~3개");
  if (u.usageContexts.length < 1) missing.push("주 사용처");
  if (!u.logoSource) missing.push("로고 출처");
  if (!u.logoFont) missing.push("로고 글자 폰트");
  return missing;
}

export function isUploadComplete(u: UploadInput): boolean {
  return missingUploadFields(u).length === 0 && !isImitationRequest(u.desiredFeel);
}

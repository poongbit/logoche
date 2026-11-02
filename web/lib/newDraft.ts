// 새 폰트 입력(탭 단위 sessionStorage). /new가 읽고 쓰고, 메인 첫 칸(components/home/Hero.tsx)이 채워서 /new로 넘긴다(11/2).
// 큰 로고는 저장 한도를 넘으면 로고만 빼고 저장한다.

import { ACCEPTED_LOGO_TYPES, MAX_LOGO_BYTES, SAMPLE_LOGOS } from "./constants";
import { sha256Hex, toLogoDataUrl } from "./files";
import { EMPTY_UPLOAD } from "./store";
import type { DrawQuality, UploadInput } from "./types";

const STORAGE_KEY = "logoche-new-v1";

export const QUALITIES: { value: DrawQuality; label: string; note: string }[] = [
  { value: "fine", label: "정밀", note: "획 끝 장식까지 살려요. 지금까지 쓰던 품질이에요" },
  { value: "standard", label: "표준", note: "더 빠르고 비용이 적어요. 획 끝이 조금 거칠 수 있어요" },
];

export interface NewDraft {
  upload: UploadInput;
  quality: DrawQuality;
}

export function loadDraft(): NewDraft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as NewDraft | null;
    if (saved) return { upload: { ...EMPTY_UPLOAD, ...saved.upload }, quality: saved.quality === "standard" ? "standard" : "fine" };
  } catch {}
  return { upload: EMPTY_UPLOAD, quality: "fine" };
}

export function saveDraft(draft: NewDraft) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, upload: { ...draft.upload, logoImage: null } }));
    } catch {}
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** 올린 로고 파일을 입력 값으로 바꾼다. 받을 수 없는 파일이면 이유를 돌려준다. */
export async function logoFromFile(file: File): Promise<{ patch: Partial<UploadInput> } | { error: string }> {
  if (!ACCEPTED_LOGO_TYPES.includes(file.type)) return { error: "PNG·SVG·JPG·WEBP 파일만 받을 수 있어요." };
  if (file.size > MAX_LOGO_BYTES) return { error: "10MB 이하 파일만 받을 수 있어요." };
  const [logoImage, logoHash] = await Promise.all([toLogoDataUrl(file), sha256Hex(file)]);
  return { patch: { logoImage, logoHash, logoFileName: file.name, inputPath: "upload", sampleId: null } };
}

/** 샘플 로고와 그 가게 정보(업종·톤·쓸 곳)를 입력 값으로 바꾼다 */
export async function logoFromSample(sample: (typeof SAMPLE_LOGOS)[number]): Promise<Partial<UploadInput>> {
  const blob = await (await fetch(sample.src)).blob();
  const [logoImage, logoHash] = await Promise.all([toLogoDataUrl(blob), sha256Hex(blob)]);
  return { logoImage, logoHash, logoFileName: `${sample.id}.svg`, inputPath: "sample", sampleId: sample.id, ...sample.prefill };
}

// 새 폰트 입력(탭 단위 sessionStorage). 메인 첫 칸(components/home/Hero.tsx)이 읽고 쓴다. 새로 고침하거나 구글 로그인에 다녀와도 입력이 남는다.
// 11/2: 예전에는 /new가 따로 읽고 썼는데, 만들기를 메인으로 합쳤다.
// 큰 로고는 저장 한도를 넘으면 로고만 빼고 저장한다.

import { ACCEPTED_LOGO_TYPES, MAX_LOGO_BYTES } from "./constants";
import { sha256Hex, toLogoDataUrl } from "./files";
import { EMPTY_UPLOAD } from "./store";
import type { UploadInput } from "./types";

const STORAGE_KEY = "logoche-new-v1";

export interface NewDraft {
  upload: UploadInput;
}

export const EMPTY_DRAFT: NewDraft = { upload: EMPTY_UPLOAD };

// 11/4: 질문 페이지(/make/...)로 옮겨 다녀도 큰 로고가 사라지지 않게 메모리에도 들고 있다(sessionStorage는 5MB 한도라 큰 로고를 못 담을 수 있다).
let memory: NewDraft | null = null;

export function loadDraft(): NewDraft {
  if (memory) return memory;
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as NewDraft | null;
    if (saved) return { upload: { ...EMPTY_UPLOAD, ...saved.upload } };
  } catch {}
  return EMPTY_DRAFT;
}

export function saveDraft(draft: NewDraft) {
  memory = draft;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, upload: { ...draft.upload, logoImage: null } }));
    } catch {}
  }
}

export function clearDraft() {
  memory = null;
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

// 폰트 만들기 질문 페이지의 순서(11/4). 주소는 /make/<step>. 건너뛰기는 없다: 각 단계는 값을 정해야 다음으로 간다.
import { attributesComplete, BUSINESS_MIN, isImitationRequest } from "./rules";
import type { UploadInput } from "./types";

export const MAKE_STEPS = ["industry", "business", "style", "rights"] as const;
export type MakeStep = (typeof MAKE_STEPS)[number];

/** 이 단계에서 꼭 채워야 하는 것이 채워졌나 */
export function stepDone(step: MakeStep, u: UploadInput): boolean {
  switch (step) {
    case "industry":
      return !!u.industry && (u.industry !== "other" || u.industryOther.trim().length > 0);
    case "business":
      // 특정 폰트를 따라 해 달라는 요청이면 이 단계는 끝나지 않은 것으로 본다(11/6: 칸 아래 알림 + 다음 버튼 끔과 같은 규칙).
      return u.desiredFeel.trim().length >= BUSINESS_MIN && !isImitationRequest(u.desiredFeel);
    case "style":
      return attributesComplete(u.attributes);
    case "rights":
      return !!u.logoSource;
  }
}

/** 아직 못 채운 첫 단계(모두 채웠으면 null). 앞 단계를 건너뛰어 주소로 들어오면 여기로 돌려보낸다. */
export function firstOpenStep(u: UploadInput): MakeStep | null {
  return MAKE_STEPS.find((s) => !stepDone(s, u)) ?? null;
}

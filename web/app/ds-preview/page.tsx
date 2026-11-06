import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DsPreview } from "./DsPreview";

export const metadata: Metadata = { title: "공통 부품 미리보기", robots: { index: false, follow: false } };

// 11/6 개발용: 공통 부품(components/ds)을 상태별로 한 화면에 모아 스크린샷으로 비교한다. 어디에도 링크하지 않고, 배포에서는 열리지 않는다.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DsPreview />;
}

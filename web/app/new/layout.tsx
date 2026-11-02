import type { Metadata } from "next";

// 화면(page.tsx)이 클라이언트 컴포넌트라 탭 제목은 여기서 붙인다(11/2 점검: 모든 화면 제목이 '로고체'였다).
export const metadata: Metadata = { title: "새 폰트 만들기" };

export default function NewFontLayout({ children }: LayoutProps<"/new">) {
  return children;
}

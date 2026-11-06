import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { AppProvider } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "로고체", template: "%s · 로고체" },
  description: "로고 한 장으로 만드는 한글 브랜드 폰트",
};

// 글꼴: 화면 글씨는 SUIT, 빠진 글자 자리는 Noto Sans KR(globals.css의 --font-sans·--font-gothic)
const SUIT_CSS = "https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/static/woff2/SUIT.css";
const NOTO_CSS = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500&display=swap";
// 큰 제목 몇 자리(메인 첫 화면, 폰트 완성 순간)에만 쓰는 포스터 글꼴(DESIGN.md 3장). 굵기는 하나뿐.
const DISPLAY_CSS = "https://fonts.googleapis.com/css2?family=Black+Han+Sans&display=swap";

// 화면 틀(Claude Design 'Logoche Final'): 위 머리줄 72px · 가운데 화면. 11/2 B안: 여섯 단계 표시 대신 '내 폰트 · 새 폰트 만들기' 머리줄.
// AppProvider는 예전 단계 화면(/style 등, 지금은 연결하지 않음)이 쓴다.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={SUIT_CSS} precedence="default" />
        <link rel="stylesheet" href={NOTO_CSS} precedence="default" />
        <link rel="stylesheet" href={DISPLAY_CSS} precedence="default" />
      </head>
      {/* 11/6 A 규칙: 화면 바탕은 흰색(bg/canvas). 큰 민트 면(bg-bg-brand)은 접수·만드는 중·완성 순간 화면이 직접 깐다(DESIGN.md 2-4). */}
      <body className="flex min-h-full flex-col bg-bg-canvas text-text-primary">
        <AppProvider>
          <AppHeader />
          <main className="flex w-full flex-1 flex-col">{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}

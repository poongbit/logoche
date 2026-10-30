import type { Metadata } from "next";
import { StepNav } from "@/components/StepNav";
import { AppProvider } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "로고체",
  description: "로고 한 장으로 만드는 한글 브랜드 폰트",
};

// 화면 틀(Claude Design 'Logoche Final'): 위 단계 표시 72px · 가운데 화면 · 아래 동작 막대(각 화면의 Footer, 아래에 붙음)
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <AppProvider>
          <StepNav />
          <main className="flex w-full flex-1 flex-col">{children}</main>
        </AppProvider>
      </body>
    </html>
  );
}

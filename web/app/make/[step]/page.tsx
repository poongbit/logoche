import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MakeWizard } from "@/components/make/MakeWizard";
import { Spinner } from "@/components/ui";
import { MAKE_STEPS, type MakeStep } from "@/lib/makeSteps";

// 폰트 만들기 질문 페이지(11/4). 메인에서 로고와 가게 이름을 받은 뒤 업종 → 사업 내용 → 속성 → 로고 권리 순서로 한 가지씩 묻는다.
// 주소의 단계는 화면을 열 때 알 수 있어(Cache Components) Suspense 안에서 읽는다.
export const metadata: Metadata = { title: "폰트 만들기", robots: { index: false } };

export function generateStaticParams() {
  return MAKE_STEPS.map((step) => ({ step }));
}

async function Step({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  if (!MAKE_STEPS.includes(step as MakeStep)) notFound();
  return <MakeWizard step={step as MakeStep} />;
}

export default function MakePage({ params }: { params: Promise<{ step: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[44rem] px-5 py-10">
          <Spinner label="불러오는 중" />
        </div>
      }
    >
      <Step params={params} />
    </Suspense>
  );
}

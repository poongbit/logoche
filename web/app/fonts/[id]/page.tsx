import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Spinner } from "@/components/ui";
import { currentUser } from "@/lib/server/auth";
import { projectName } from "@/lib/server/projects";
import { FontView } from "./FontView";

// 폰트 하나의 화면(11/2 B안). 주소의 id는 화면을 열 때만 알 수 있어(Cache Components) 진행 화면을 Suspense 안에서 그린다.
// 탭 제목은 폰트 이름이다(11/2 점검). 남의 폰트나 로그인 전이면 '폰트'. 제목이 주소(params)를 읽으므로, 화면에 '열 때 정해짐' 표시(Connection)를 둔다.
export async function generateMetadata({ params }: PageProps<"/fonts/[id]">): Promise<Metadata> {
  const { id } = await params;
  const owner = await currentUser(await headers());
  return { title: (owner && (await projectName(owner, id))) || "폰트" };
}

async function Connection() {
  await connection();
  return null;
}

export default function FontPage() {
  return (
    <>
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-page px-5 py-10 lg:px-10">
            <Spinner label="불러오는 중" />
          </div>
        }
      >
        <FontView />
      </Suspense>
      <Suspense>
        <Connection />
      </Suspense>
    </>
  );
}

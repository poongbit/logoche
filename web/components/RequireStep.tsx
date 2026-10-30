"use client";

import type { ReactNode } from "react";
import { useApp } from "@/lib/store";
import { ButtonLink, Notice, Spinner } from "./ui";

/** 앞 화면을 마치지 않고 들어오면 돌아갈 곳을 알려 준다. */
export function RequireStep({ ready, message, href, children }: { ready: boolean; message: string; href: string; children: ReactNode }) {
  const { hydrated } = useApp();
  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-[90rem] px-5 py-10 lg:px-12">
        <Spinner label="불러오는 중" />
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="mx-auto flex w-full max-w-[90rem] flex-col items-start gap-4 px-5 py-10 lg:px-12">
        <Notice tone="warn">{message}</Notice>
        <ButtonLink href={href}>앞 화면으로</ButtonLink>
      </div>
    );
  }
  return <>{children}</>;
}

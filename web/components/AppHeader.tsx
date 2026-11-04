"use client";

// 11/2 B안 머리줄: 로고체 · 내 폰트 · [새 폰트 만들기]. 여섯 단계 표시(StepNav)를 대신한다(만들기가 한 화면이 됐다).
// 11/2 메인 화면: '로고체'는 메인(/), '내 폰트'는 /fonts와 폰트 하나의 화면(/fonts/[id])에서 켜진다. 바탕은 화면과 같은 크림.
// 지금 주소(usePathname)는 화면을 열 때만 알 수 있어(Cache Components) 주소에 따라 바뀌는 조각만 Suspense 안에 둔다.
// 11/2 구글 로그인: 오른쪽 끝에 '로그인' 또는 내 계정(첫 글자 동그라미 → 이름·메일·로그아웃). 로그인 상태는 브라우저에서 받는다.

import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";
import { InAppNotice, useGoogleSignIn } from "@/components/GoogleSignIn";
import { Notice } from "@/components/ui";
import { authClient } from "@/lib/authClient";

const noSubscribe = () => () => {};

export function PlusIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={className}>
      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ListLink({ current }: { current: boolean }) {
  return (
    <Link
      href="/fonts"
      aria-current={current ? "page" : undefined}
      className={`flex h-9 items-center rounded-full px-3.5 text-15 font-bold transition-colors ${current ? "bg-stage" : "hover:bg-subtle"}`}
    >
      내 폰트
    </Link>
  );
}

function NewLink() {
  return (
    <Link href="/#make" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-15 font-bold text-bg transition-colors hover:bg-hover">
      <PlusIcon />
      <span className="hidden sm:inline">새 폰트 만들기</span>
      <span className="sm:hidden">새 폰트</span>
    </Link>
  );
}

function CurrentListLink() {
  const path = usePathname();
  return <ListLink current={path === "/fonts" || path.startsWith("/fonts/")} />;
}

function SignInButton() {
  const { start, starting, problem, inApp } = useGoogleSignIn();
  return (
    <div className="relative">
      <button
        type="button"
        disabled={starting}
        onClick={() => void start(location.pathname + location.search)}
        className="flex h-9 items-center rounded-full px-3.5 text-15 font-bold transition-colors hover:bg-subtle disabled:text-muted"
      >
        로그인
      </button>
      {(inApp || problem) && (
        <div className="absolute top-full right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2.5rem))]">
          {inApp ? <InAppNotice app={inApp} /> : <Notice tone="error">{problem}</Notice>}
        </div>
      )}
    </div>
  );
}

function AccountMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function signOut() {
    setLeaving(true);
    await authClient.signOut();
    router.push("/"); // 내 폰트 화면에 머물지 않게 메인으로
  }

  return (
    <>
      <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`내 계정: ${name || email}`}
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-full bg-stage text-15 font-extrabold transition-colors hover:bg-line"
      >
        {(name || email).slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="absolute top-full right-0 z-20 mt-2 flex w-64 flex-col gap-3 rounded-2xl border border-line bg-bg p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-15 font-bold">{name}</span>
            <span className="truncate text-13 text-muted">{email}</span>
          </div>
          <button
            type="button"
            disabled={leaving}
            onClick={() => void signOut()}
            className="h-10 rounded-full border-[1.5px] border-edge text-15 font-bold transition-colors hover:border-ink disabled:text-muted"
          >
            {leaving ? "로그아웃하는 중" : "로그아웃"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setDeleting(true);
            }}
            className="self-center text-13 text-muted underline underline-offset-4 hover:text-ink"
          >
            탈퇴
          </button>
        </div>
      )}
      </div>
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </>
  );
}

function Account() {
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  const { data, isPending } = authClient.useSession();
  if (!inBrowser || isPending) return <span aria-hidden className="block h-9 w-9" />;
  return data ? <AccountMenu name={data.user.name} email={data.user.email} /> : <SignInButton />;
}

export function AppHeader() {
  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-3 px-5 lg:h-[4.5rem] lg:gap-6 lg:px-10">
        <Link href="/" className="text-18 font-extrabold lg:text-22">
          로고체
        </Link>
        <nav aria-label="메뉴" className="flex items-center">
          <Suspense fallback={<ListLink current={false} />}>
            <CurrentListLink />
          </Suspense>
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:gap-3">
          <NewLink />
          <Account />
        </div>
      </div>
    </header>
  );
}

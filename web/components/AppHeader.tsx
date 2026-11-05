"use client";

// 11/2 B안 머리줄: 로고체 · 내 폰트 · [새 폰트 만들기]. 여섯 단계 표시(StepNav)를 대신한다(만들기가 한 화면이 됐다).
// 11/2 메인 화면: '로고체'는 메인(/), '내 폰트'는 /fonts와 폰트 하나의 화면(/fonts/[id])에서 켜진다. 바탕은 화면과 같은 크림.
// 지금 주소(usePathname)는 화면을 열 때만 알 수 있어(Cache Components) 주소에 따라 바뀌는 조각만 Suspense 안에 둔다.
// 11/2 구글 로그인: 오른쪽 끝에 '로그인' 또는 내 계정(첫 글자 동그라미 → 이름·메일·로그아웃). 로그인 상태는 브라우저에서 받는다.

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";
import { InAppNotice, useGoogleSignIn } from "@/components/GoogleSignIn";
import { Notice } from "@/components/ui";
import { authClient } from "@/lib/authClient";

const noSubscribe = () => () => {};

export function PlusIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={className}>
      <path
        d="M8 3v10M3 8h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ListLink({ current }: { current: boolean }) {
  return (
    <Link
      href="/fonts"
      aria-current={current ? "page" : undefined}
      className={`flex h-11 items-center rounded-full px-3.5 text-15 font-bold transition-colors ${current ? "underline decoration-2 underline-offset-8" : "text-text-secondary hover:text-text-primary"}`}
    >
      내 폰트
    </Link>
  );
}

function HowLink() {
  return (
    <Link
      href="/#how"
      className="flex h-11 items-center rounded-full px-3.5 text-15 font-bold text-text-secondary transition-colors hover:text-text-primary"
    >
      만드는 법
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
        className="flex h-10 items-center rounded-full border-[1.5px] border-border-strong px-4 text-15 font-bold transition-colors hover:border-border-active hover:bg-bg-surface disabled:text-text-disabled"
      >
        로그인
      </button>
      {(inApp || problem) && (
        <div className="absolute top-full right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2.5rem))]">
          {inApp ? (
            <InAppNotice app={inApp} />
          ) : (
            <Notice tone="error">{problem}</Notice>
          )}
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
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
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
          className="grid h-11 w-11 place-items-center rounded-full bg-bg-surface-strong text-15 font-extrabold transition-colors hover:bg-border-default"
        >
          {(name || email).slice(0, 1).toUpperCase()}
        </button>
        {open && (
          <div className="absolute top-full right-0 z-20 mt-2 flex w-64 flex-col gap-3 rounded-[1.25rem] border border-border-default bg-bg-canvas p-4 shadow-float">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-15 font-bold">{name}</span>
              <span className="truncate text-13 text-text-secondary">
                {email}
              </span>
            </div>
            <button
              type="button"
              disabled={leaving}
              onClick={() => void signOut()}
              className="h-10 rounded-full border-[1.5px] border-border-strong text-15 font-bold transition-colors hover:border-border-active disabled:text-text-disabled"
            >
              {leaving ? "로그아웃하는 중" : "로그아웃"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setDeleting(true);
              }}
              className="self-center text-13 text-text-secondary underline underline-offset-4 hover:text-text-primary"
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
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const { data, isPending } = authClient.useSession();
  if (!inBrowser || isPending)
    return <span aria-hidden className="block h-11 w-11" />;
  return data ? (
    <AccountMenu name={data.user.name} email={data.user.email} />
  ) : (
    <SignInButton />
  );
}

export function AppHeader() {
  return (
    <header className="border-b border-border-default bg-bg-theme">
      <div className="mx-auto flex h-16 max-w-[76rem] items-center gap-3 px-5 lg:h-[4.5rem] lg:gap-6 lg:px-10">
        <Link
          href="/"
          aria-label="로고체 처음으로"
          className="-my-3 inline-flex items-center py-3"
        >
          <BrandLogo />
        </Link>
        <nav
          aria-label="메뉴"
          className="ml-auto flex items-center gap-1 lg:gap-2"
        >
          <HowLink />
          <Suspense fallback={<ListLink current={false} />}>
            <CurrentListLink />
          </Suspense>
        </nav>
        <div className="flex items-center gap-2 lg:gap-3">
          <Account />
        </div>
      </div>
    </header>
  );
}

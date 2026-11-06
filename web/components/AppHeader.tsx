"use client";

// 11/2 B안 머리줄: 로고체 · 내 폰트 · [새 폰트 만들기]. 여섯 단계 표시(StepNav)를 대신한다(만들기가 한 화면이 됐다).
// 11/2 메인 화면: '로고체'는 메인(/), '내 폰트'는 /fonts와 폰트 하나의 화면(/fonts/[id])에서 켜진다. 11/6: 바탕은 흰색(A 규칙).
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
import { isPlainClick, scrollToId } from "@/components/home/scrollTo";
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

// 11/6 머리줄(피그마 441:6 데스크톱 · 441:21 모바일 · 475:1397 로그인 전): 흰 바탕 + 아래 1px 선. 메뉴 글자는 15 보통 굵기 먹.
// 로그인 전: 데스크톱은 '만드는 법 · 내 폰트 · 로그인', 모바일은 '로그인' 칸만. 로그인 뒤 모바일은 '내 폰트 + 계정'.
// 질문 화면(/make)도 로그인 전이면 이 모양이다(로고 권리 단계에서 로그인).
const NAV_LINK =
  "h-11 items-center px-3 text-15 font-medium text-text-primary underline-offset-8 transition-colors hover:underline";

function ListLink({ current, mobile }: { current: boolean; mobile: boolean }) {
  return (
    <Link
      href="/fonts"
      aria-current={current ? "page" : undefined}
      className={`${mobile ? "flex" : "hidden lg:flex"} ${NAV_LINK} ${current ? "font-bold underline decoration-2" : ""}`}
    >
      내 폰트
    </Link>
  );
}

// 11/6 밤: 메인에서는 '만드는 순서'(#how)로 부드럽게 내려가고(움직임 줄이기면 바로) 주소에 #how를 남긴다.
// 다른 화면에서는 /#how로 이동하고, 라우터가 그 섹션(scroll-mt)으로 내려 준다.
function HowLink() {
  return (
    <Link
      href="/#how"
      className={`hidden lg:flex ${NAV_LINK}`}
      onClick={(e) => {
        if (location.pathname !== "/" || !isPlainClick(e) || !scrollToId("how")) return;
        e.preventDefault();
        history.pushState(null, "", "/#how");
      }}
    >
      만드는 법
    </Link>
  );
}

function CurrentListLink({ mobile }: { mobile: boolean }) {
  const path = usePathname();
  return <ListLink mobile={mobile} current={path === "/fonts" || path.startsWith("/fonts/")} />;
}

function SignInButton() {
  const { start, starting, problem, inApp } = useGoogleSignIn();
  return (
    <div className="relative">
      <button
        type="button"
        disabled={starting}
        onClick={() => void start(location.pathname + location.search)}
        className="flex h-8 w-[4.5rem] items-center justify-center rounded-full border border-border-strong bg-bg-canvas text-13 font-bold transition-colors hover:border-border-active hover:bg-bg-surface disabled:text-text-disabled lg:h-[2.375rem] lg:w-[5.75rem] lg:text-sm"
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
          className="group grid h-11 w-11 place-items-center rounded-full"
        >
          {/* 먹 동그라미 + 흰 첫 글자(피그마 441:18, 데스크톱 38 · 모바일 36). 누르는 범위는 44. */}
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-full bg-bg-inverse text-sm font-bold text-text-inverse transition-colors group-hover:bg-bg-inverse-strong lg:size-[2.375rem] lg:text-15"
          >
            {(name || email).slice(0, 1).toUpperCase()}
          </span>
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

/** 로그인 상태: 서버와 첫 그림에서는 모름(null) */
function useSignedIn() {
  const inBrowser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const session = authClient.useSession();
  if (!inBrowser || session.isPending) return { known: false as const };
  return { known: true as const, user: session.data?.user ?? null };
}

export function AppHeader() {
  const state = useSignedIn();
  const user = state.known ? state.user : null;
  return (
    <header className="border-b border-border-default bg-bg-canvas">
      <div className="mx-auto flex h-14 max-w-page items-center gap-2 px-4 lg:h-[4.5rem] lg:gap-6 lg:px-10">
        <Link
          href="/"
          aria-label="로고체 처음으로"
          className="-my-3 inline-flex items-center py-3"
        >
          <BrandLogo />
        </Link>
        <nav
          aria-label="메뉴"
          className="ml-auto flex items-center gap-1 lg:gap-4"
        >
          <HowLink />
          <Suspense fallback={<ListLink current={false} mobile={!!user} />}>
            <CurrentListLink mobile={!!user} />
          </Suspense>
        </nav>
        <div className="flex items-center lg:ml-2">
          {!state.known ? (
            <span aria-hidden className="block h-11 w-11" />
          ) : user ? (
            <AccountMenu name={user.name} email={user.email} />
          ) : (
            <SignInButton />
          )}
        </div>
      </div>
    </header>
  );
}

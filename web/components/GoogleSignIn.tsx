"use client";

// 구글 로그인(11/2). 머리글의 '로그인', 새 폰트 만들기의 '로그인하고 폰트 만들기', 내 폰트의 로그인 안내가 같은 흐름을 쓴다.
// 누르면 구글로 갔다가 callbackURL로 돌아온다. 실패하면 같은 주소에 ?login=failed를 붙여 돌아오고, 그 화면에서 알린다.
// 카카오톡 같은 앱 안 브라우저는 구글이 로그인을 막아서, 구글로 보내는 대신 바깥 브라우저로 열라고 안내한다.

import { useState, useSyncExternalStore } from "react";
import { Notice } from "@/components/ui";
import { authClient, inAppBrowser, withParam } from "@/lib/authClient";

const noSubscribe = () => () => {};

export function useGoogleSignIn() {
  const failedReturn = useSyncExternalStore(noSubscribe, () => new URLSearchParams(location.search).get("login") === "failed", () => false);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [inApp, setInApp] = useState<"kakao" | "other" | null>(null);

  /** callbackURL: 로그인 뒤 돌아올 주소(이 사이트 안의 경로) */
  async function start(callbackURL: string) {
    const app = inAppBrowser(navigator.userAgent);
    if (app) return setInApp(app);
    setStarting(true);
    setProblem(null);
    const failedURL = withParam(callbackURL.replace(/[?&]login=failed/, ""), "login", "failed");
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL: failedURL });
    if (error) {
      setProblem(`구글 로그인을 시작하지 못했어요: ${error.message ?? error.statusText}`);
      setStarting(false);
    }
  }

  const message = problem ?? (failedReturn ? "구글 로그인을 마치지 못했어요. 다시 눌러 주세요." : null);
  return { start, starting, problem: message, inApp };
}

/** 앱 안 브라우저 안내. 카카오톡은 바깥 브라우저로 여는 주소가 있다. */
export function InAppNotice({ app }: { app: "kakao" | "other" }) {
  return (
    <Notice tone="warn">
      <span className="block text-left">
        {app === "kakao" ? "카카오톡 안에서는 구글 로그인이 막혀 있어요. 다른 브라우저에서 열어 주세요." : "앱 안에서는 구글 로그인이 막혀 있어요. 메뉴에서 '다른 브라우저로 열기'를 눌러 주세요."}
        {app === "kakao" && (
          <button
            type="button"
            onClick={() => (location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`)}
            className="mt-2 block font-bold underline underline-offset-4"
          >
            다른 브라우저로 열기
          </button>
        )}
      </span>
    </Notice>
  );
}

function GoogleMark({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className={className}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** 로그인이 필요한 화면의 안내: 제목 · 한 줄 · 구글 버튼 */
export function SignInPrompt({ title, body, callbackURL }: { title: string; body: string; callbackURL: string }) {
  const { start, starting, problem, inApp } = useGoogleSignIn();
  return (
    <div className="flex flex-col items-center gap-4 border-y border-border-default px-6 py-14 text-center">
      <p className="text-17 font-extrabold">{title}</p>
      <p className="max-w-[28rem] text-15 leading-relaxed text-text-secondary">{body}</p>
      <button
        type="button"
        disabled={starting}
        onClick={() => void start(callbackURL)}
        className="inline-flex h-12 items-center gap-3 rounded-full border-[1.5px] border-border-strong bg-bg-canvas px-6 text-15 font-bold transition-colors hover:border-border-active disabled:text-text-disabled"
      >
        <GoogleMark />
        {starting ? "구글로 가는 중" : "Google 계정으로 로그인"}
      </button>
      {inApp && <InAppNotice app={inApp} />}
      {problem && <Notice tone="error">{problem}</Notice>}
    </div>
  );
}

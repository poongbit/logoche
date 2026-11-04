"use client";

// 11/4 탈퇴. 머리글 계정 메뉴의 '탈퇴'에서 연다. 무엇이 지워지는지 먼저 보여 주고, 확인 문구("탈퇴")를 적어야 누를 수 있다.
// 서버는 DELETE /api/account(lib/server/account.ts). 만드는 중인 폰트가 있으면 서버가 거절하므로 미리 알리고 막는다.

import { useEffect, useRef, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { Button, Notice, Spinner, TextField } from "@/components/ui";

interface Summary {
  fonts: number;
  building: number;
}

// 계정이 지워졌으니 로그인 상태를 들고 있는 화면을 모두 버리고 메인을 새로 연다(router.push로는 브라우저가 들고 있는 세션이 남는다).
function go() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/");
}

/** 탈퇴 창을 연 '탈퇴' 항목은 메뉴와 함께 사라지므로, 닫으면 계정 단추로 포커스를 돌려준다 */
const accountButton = () => document.querySelector<HTMLElement>('button[aria-label^="내 계정"]');

const CONFIRM = "탈퇴"; // lib/server/account.ts DELETE_CONFIRM과 같다

export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    fetch("/api/account")
      .then((r) =>
        r.ok
          ? (r.json() as Promise<Summary>)
          : Promise.reject(new Error(String(r.status))),
      )
      .then(setSummary)
      .catch(() =>
        setProblem("계정 정보를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요."),
      );
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && !busy && !done && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, done, onClose]);

  async function leave() {
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `탈퇴하지 못했어요 (${res.status})`);
      }
      setDone(true);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "탈퇴하지 못했어요");
      setBusy(false);
    }
  }

  const blocked = !!summary && summary.building > 0;
  const ready = text.trim() === CONFIRM && !!summary && !blocked && !busy;

  return (
    <ModalPortal restoreTo={accountButton}>
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onPointerDown={(e) =>
        e.target === e.currentTarget && !busy && !done && onClose()
      }
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        tabIndex={-1}
        className="flex max-h-full w-full max-w-[30rem] flex-col gap-5 overflow-y-auto rounded-[1.25rem] bg-bg p-6 shadow-[0_30px_80px_-30px_rgba(17,17,17,.6)] outline-none"
      >
        {done ? (
          <>
            <h2 id="delete-title" className="text-xl font-extrabold">
              탈퇴했어요
            </h2>
            <p className="text-15 leading-relaxed text-muted">
              만든 폰트와 계정 정보를 모두 지웠어요. 그동안 써 주셔서 고마워요.
            </p>
            <Button size="md" onClick={() => go()}>
              메인으로
            </Button>
          </>
        ) : (
          <>
            <h2 id="delete-title" className="text-xl font-extrabold">
              탈퇴하기
            </h2>
            {!summary && !problem ? (
              <Spinner label="확인하는 중" />
            ) : (
              <>
                <div className="flex flex-col gap-2 text-15 leading-relaxed">
                  <p className="font-bold">
                    탈퇴하면 아래가 모두 지워지고, 되돌릴 수 없어요.
                  </p>
                  <ul className="flex list-disc flex-col gap-1 pl-5">
                    <li>
                      만든 폰트 {summary ? `${summary.fonts}개` : ""}: 폰트
                      파일, 그린 글자, 직접 고친 글자와 조정, 제작 기록
                    </li>
                    <li>올려 둔 로고 이미지</li>
                    <li>구글 계정 연결과 로그인 정보</li>
                  </ul>
                  <p className="text-13 text-muted">
                    이미 내려받은 폰트 파일은 계속 쓸 수 있어요. 폰트를 내려받을
                    때 남긴 발급 기록(폰트 번호, 가게 이름)은 같은 로고로 만든
                    폰트를 가려내는 데 쓰려고 남아요.
                  </p>
                </div>
                {blocked && (
                  <Notice tone="warn">
                    만드는 중인 폰트가 {summary!.building}개 있어요. 다 만들어진
                    뒤에 탈퇴할 수 있어요.
                  </Notice>
                )}
                <label className="flex flex-col gap-2 text-15 font-bold">
                  계속하려면 &lsquo;{CONFIRM}&rsquo;을 입력해 주세요
                  <TextField
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={CONFIRM}
                    autoComplete="off"
                    disabled={blocked || busy}
                  />
                </label>
              </>
            )}
            {problem && <Notice tone="error">{problem}</Notice>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                size="md"
                onClick={onClose}
                disabled={busy}
              >
                취소
              </Button>
              <Button
                size="md"
                onClick={() => void leave()}
                disabled={!ready}
                className="bg-bad hover:bg-bad"
              >
                {busy ? "탈퇴하는 중" : "탈퇴하기"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
    </ModalPortal>
  );
}

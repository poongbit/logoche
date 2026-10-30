"use client";

// 화면 6 다운로드(Claude Design 'Logoche Final' 3m·3n). 위에 완성한 서체, 아래에 받을 파일 · 권리 카드 · 제작 기록.
// 10/29 사용자 요청: TTF만 주던 것을 OTF·웹폰트(WOFF2·WOFF)까지. '모두 받기'는 zip 하나(폰트 4형식·CSS 예시·OFL 원문·제작 기록).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecordLog } from "@/components/RecordLog";
import { RequireStep } from "@/components/RequireStep";
import { RightsCard } from "@/components/RightsCard";
import { Button, ButtonLink, Footer, Notice } from "@/components/ui";
import { api, errorMessage, type FontFormat } from "@/lib/api";
import { RIGHTS } from "@/lib/constants";
import { saveBlob } from "@/lib/files";
import { useGeneratedFont } from "@/lib/font";
import { buildRecordText } from "@/lib/record";
import { isBuildPassed, useApp } from "@/lib/store";

type FileKey = FontFormat | "license" | "record" | "all";

export default function DownloadPage() {
  const { state } = useApp();
  return (
    <RequireStep ready={isBuildPassed(state.build) && state.maxStep >= 5} message="화면 5에서 시안을 확인하고 '받기'를 눌러 주세요." href="/kit">
      <DownloadScreen />
    </RequireStep>
  );
}

function DownloadScreen() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const [got, setGot] = useState<Set<FileKey>>(new Set());
  const [busy, setBusy] = useState<FileKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);

  const fontName = `${state.upload.storeName}체`;
  const recordText = buildRecordText(fontName, state.record);
  const fontId = state.build?.fontId;
  const { fontFamily } = useGeneratedFont(fontId ?? null, state.fontRevision);
  const glyphCount = (state.build?.totalGlyphs ?? 2350).toLocaleString();
  const mark = (...keys: FileKey[]) => setGot((prev) => new Set([...prev, ...keys]));

  async function fetchOk(input: string, init?: RequestInit): Promise<Blob> {
    const res = await fetch(input, init);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
    }
    return res.blob();
  }

  async function downloadFont(format: FontFormat) {
    if (!fontId) return;
    setBusy(format);
    setError(null);
    try {
      saveBlob(await fetchOk(api.fontUrl(fontId, { download: true, format, revision: state.fontRevision })), `${fontName}.${format}`);
      mark(format);
    } catch (err) {
      setError(`${format.toUpperCase()}를 받지 못했어요: ${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function downloadLicense() {
    setBusy("license");
    setError(null);
    try {
      const res = await fetch(RIGHTS.licenseUrl);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      saveBlob(await res.blob(), "OFL-1.1.txt");
      mark("license");
    } catch (err) {
      setError(`라이선스 원문을 받지 못했어요: ${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }

  function downloadRecord() {
    saveBlob(new Blob([recordText], { type: "text/plain;charset=utf-8" }), `${fontName} 제작 기록.txt`);
    mark("record");
  }

  /** 모두 받기: 폰트 4형식·웹폰트 CSS 예시·OFL 원문·제작 기록을 zip 하나로 */
  async function downloadAll() {
    if (!fontId) return;
    setBusy("all");
    setError(null);
    try {
      const blob = await fetchOk(api.fontBundleUrl(fontId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fontName, record: recordText }),
      });
      saveBlob(blob, `${fontName}.zip`);
      mark("all", "ttf", "otf", "woff2", "woff", "license", "record");
    } catch (err) {
      setError(`묶음을 받지 못했어요: ${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function copyRecord() {
    await navigator.clipboard.writeText(recordText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function restart() {
    dispatch({ type: "reset" });
    router.push("/");
  }

  const files: { key: FileKey | "mockups"; name: string; note: string; onGet?: () => void }[] = [
    { key: "ttf", name: `${fontName}.ttf`, note: `한글 ${glyphCount}자 · 숫자는 없어요 · 컴퓨터·인쇄용`, onGet: () => void downloadFont("ttf") },
    { key: "otf", name: `${fontName}.otf`, note: "디자인 프로그램용(일러스트레이터 등)", onGet: () => void downloadFont("otf") },
    { key: "woff2", name: `${fontName}.woff2`, note: "웹폰트 · 홈페이지·쇼핑몰용", onGet: () => void downloadFont("woff2") },
    { key: "license", name: "OFL-1.1.txt", note: `라이선스 원문 · ${RIGHTS.license}`, onGet: () => void downloadLicense() },
    { key: "record", name: "제작 기록.txt", note: "고르고 고친 과정 · 시각 포함", onGet: downloadRecord },
    { key: "mockups", name: "적용 시안 3종", note: "간판·메뉴판·인스타그램 PNG" },
  ];
  const allGot = got.has("all");

  return (
    <>
      {/* 데스크톱에서는 위 단계 표시(72px)와 아래 동작 막대(88px) 사이를 꼭 채운다. 제작 기록은 남는 높이 안에서 스크롤한다. */}
      <div className="flex w-full flex-1 flex-col lg:h-[calc(100dvh-10rem)] lg:min-h-[40rem] lg:flex-none">
        <div className="w-full shrink-0 lg:px-6">
          <div className="mx-auto flex max-w-[87rem] flex-col gap-3 bg-stage px-5 py-6 lg:h-[15.625rem] lg:flex-row lg:items-center lg:gap-10 lg:rounded-[1.25rem] lg:px-12 lg:py-0">
            <div className="flex min-w-0 flex-col gap-3">
              <h1 className="text-xl font-extrabold lg:text-22">{fontName}가 완성됐어요</h1>
              <p className="truncate text-[clamp(3.5rem,10vw,9.375rem)] leading-none" style={fontFamily ? { fontFamily } : undefined}>
                {fontName}
              </p>
            </div>
            <p className="text-15 leading-normal font-semibold text-muted lg:mb-8 lg:ml-auto lg:self-end lg:text-right">
              한글 {glyphCount}자 · 검사 7항목 통과
              <br />
              구독이나 서버 확인 없이 계속 써요
            </p>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-[90rem] flex-1 gap-8 px-5 pt-6 pb-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-9 lg:px-12">
          <section className="flex flex-col gap-2 lg:min-h-0 lg:overflow-y-auto">
            <h2 className="pb-1 text-lg font-bold">받을 파일</h2>
            {files.map((f) => (
              <div key={f.key} className="flex min-h-14 shrink-0 items-center gap-3 rounded-[0.875rem] border-[1.5px] border-edge px-4 py-1.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-base font-bold">{f.name}</span>
                  <span className="text-13 font-medium text-muted">{f.note}</span>
                </div>
                {f.key === "mockups" ? (
                  <Button variant="outline" size="sm" className="ml-auto h-10 px-4 text-sm" disabled>
                    준비 중
                  </Button>
                ) : got.has(f.key) ? (
                  <span className="ml-auto shrink-0 text-15 font-bold text-good">받았어요 ✓</span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-10 shrink-0 px-4 text-sm"
                    disabled={busy !== null || (["ttf", "otf", "woff2"].includes(f.key) && !fontId)}
                    onClick={f.onGet}
                  >
                    {busy === f.key ? "받는 중" : "받기"}
                  </Button>
                )}
              </div>
            ))}
            {error && <Notice tone="error">{error}</Notice>}
            {(got.has("ttf") || got.has("all")) && <Notice>간판·인쇄 업체에 TTF와 라이선스 원문, 제작 기록을 함께 보내세요.</Notice>}
          </section>

          <RightsCard className="lg:min-h-0 lg:overflow-y-auto" />

          <section className="flex min-h-0 flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold">제작 기록</h2>
              {copied ? (
                <span className="ml-auto flex h-9 items-center rounded-full bg-ink px-4 text-sm font-bold text-bg">복사했어요 ✓</span>
              ) : (
                <Button variant="outline" size="sm" className="ml-auto h-9 px-4 text-sm" onClick={() => void copyRecord()}>
                  복사
                </Button>
              )}
            </div>
            <RecordLog events={state.record} />
            <p className="text-13 leading-normal font-medium text-muted">
              고르기·슬라이더·직접 고친 기록은 지식재산처 AI 활용 디자인 출원 가이드의 &apos;사람의 실질적 기여&apos; 근거로 쓰여요.
            </p>
          </section>
        </div>
      </div>

      <Footer
        lead={
          confirmRestart ? (
            <span className="flex flex-wrap items-center gap-2 lg:mr-6">
              <span className="text-15 font-medium">지금 입력과 기록이 모두 지워져요.</span>
              <Button size="sm" onClick={restart}>
                처음부터 다시
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmRestart(false)}>
                그대로 두기
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" className="self-start px-2 lg:mr-6" onClick={() => setConfirmRestart(true)}>
              처음부터 다시 만들기…
            </Button>
          )
        }
        status={
          busy === "all"
            ? "묶음을 만드는 중이에요 · 처음에는 10초쯤 걸려요"
            : allGot
              ? "다 받았어요."
              : "폰트 파일·웹폰트·라이선스·제작 기록을 zip 하나로 받을 수 있어요."
        }
      >
        <ButtonLink href="/kit">이전</ButtonLink>
        {allGot ? (
          <Button variant="outline" size="lg" onClick={() => void downloadAll()}>
            다시 받기
          </Button>
        ) : (
          <Button disabled={busy !== null || !fontId} onClick={() => void downloadAll()}>
            {busy === "all" ? "묶는 중" : busy ? "받는 중" : "모두 받기 (zip)"}
          </Button>
        )}
      </Footer>
    </>
  );
}

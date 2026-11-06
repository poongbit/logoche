import { RIGHTS } from "@/lib/constants";

// 쓸 수 있는 범위(11/6 스튜디오 ST2 v2 549:402, screens.md 오후 2·3차 'B: 줄 표 전문').
// 실제로 받아 쓰는 자리라 전문을 1px 먹 줄 표로: 할 수 있어요 ✓ · 안 돼요 × · 알아 둘 점 !. 제목은 Black Han Sans 30, 라이선스 전문 링크는 같은 줄 오른쪽.
// 권리는 SIL OFL 1.1이고 독점이 아니다(README 2장). 문구는 법률 자문 전 초안이다.
// 줄 문구는 lib/constants RIGHTS.rows 한 곳에서 가져온다(메인의 세 줄 요약 RIGHTS.summary와 같은 사실).

/** 표시: ✓ 먹 원 · × 먹 테두리 원 · ! 먹 테두리 원(피그마 '표시 ok/no/note'). 색만으로 구분하지 않고 줄 제목이 뜻을 말한다. */
function Mark({ kind }: { kind: "ok" | "no" | "note" }) {
  const filled = kind === "ok";
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[1.375rem] w-[1.375rem] shrink-0 lg:h-6 lg:w-6">
      <circle cx="12" cy="12" r={filled ? 12 : 11} fill={filled ? "var(--ink)" : "none"} stroke={filled ? "none" : "var(--ink)"} strokeWidth="2" />
      {kind === "ok" && <path d="M7 12.5l3.3 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
      {kind === "no" && <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />}
      {kind === "note" && (
        <>
          <path d="M12 7v6.5" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="12" cy="17" r="1.4" fill="var(--ink)" />
        </>
      )}
    </svg>
  );
}

export function RightsCard({ className = "", id }: { className?: string; id?: string }) {
  return (
    <section id={id} aria-labelledby="rights-title" className={`flex flex-col ${className}`}>
      <div className="flex flex-col items-start gap-x-6 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="rights-title" className="font-display text-2xl leading-[1.25] tracking-[-0.03em] lg:text-[1.875rem]">
          쓸 수 있는 범위
        </h2>
        <a
          href={RIGHTS.licenseUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center py-2 text-13 text-text-secondary underline decoration-1 underline-offset-[0.25em] hover:text-text-primary sm:py-3 sm:text-15 sm:font-bold"
        >
          {RIGHTS.licenseName} 전문 보기
        </a>
      </div>
      <dl className="mt-4 border-t border-border-active lg:mt-5">
        {RIGHTS.rows.map((row) => (
          <div key={row.mark} className="grid grid-cols-[1.375rem_1fr] gap-x-2.5 gap-y-1 border-b border-border-active py-[1.0625rem] lg:grid-cols-[1.5rem_24.5rem_1fr] lg:gap-x-3 lg:py-5">
            <Mark kind={row.mark} />
            <dt className="text-base leading-[1.375rem] font-bold lg:text-17 lg:leading-6">{row.title}</dt>
            <dd className="col-start-2 text-sm leading-[1.65] lg:col-start-3 lg:row-start-1 lg:text-base lg:leading-[1.75]">
              {row.lines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-13 leading-normal text-text-secondary">
        {RIGHTS.aiNotice} {RIGHTS.screeningShort} 문구는 법률 자문 전 초안이에요.
      </p>
    </section>
  );
}

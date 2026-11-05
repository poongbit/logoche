import { RIGHTS } from "@/lib/constants";

/** 권리 카드(Claude Design 'Logoche Final' 3m). 유사도 검사의 비교 범위는 화면 4 검사 카드에 있다.
 * bare: 이미 테두리 상자 안에 있을 때(스튜디오) 안쪽 회색 상자 대신 구분선만 둔다. */
export function RightsCard({ className = "", bare = false }: { className?: string; bare?: boolean }) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-22 font-extrabold">권리 카드</h2>
        <span className="rounded-[0.875rem] border-[1.5px] border-border-strong bg-bg-surface px-2.5 py-[0.1875rem] text-13 font-bold">{RIGHTS.expression}</span>
      </div>
      <div className={`flex flex-col gap-2 ${bare ? "border-t border-border-default pt-3" : "rounded-[0.875rem] bg-bg-surface p-4"}`}>
        <p className="text-15 font-bold text-text-success">할 수 있어요</p>
        <ul className="flex flex-col gap-1.5 text-15 leading-snug font-medium">
          {RIGHTS.allowed.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
        <p className="mt-1.5 text-15 font-bold text-text-error">할 수 없어요</p>
        <ul className="flex flex-col gap-1.5 text-15 font-medium">
          {RIGHTS.notAllowed.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
        <p className="mt-1.5 text-15 font-medium">
          라이선스:{" "}
          <a href={RIGHTS.licenseUrl} target="_blank" rel="noreferrer" className="font-bold underline underline-offset-2">
            {RIGHTS.license}
          </a>
        </p>
        <p className="text-13 leading-normal font-medium text-text-secondary">{RIGHTS.openNote}</p>
      </div>
      <p className="text-13 leading-normal font-medium text-text-secondary">
        {RIGHTS.aiNotice} 유사도 검사는 닮은 폰트를 걸러 내는 선별 검사이고, 권리 보증은 아니에요. 문구는 법률 자문 전 초안이에요.
      </p>
    </section>
  );
}

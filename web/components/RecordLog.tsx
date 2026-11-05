import { RECORD_CATEGORIES } from "@/lib/constants";
import type { RecordEvent } from "@/lib/types";

const shortTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** 제작 기록 표(Claude Design 'Logoche Final' 3m): 시각 · 갈래 · 내용, 일어난 차례대로. 받는 파일에는 갈래별로 묶어 적는다(lib/record.ts).
 * bare: 이미 테두리가 있는 카드 안에 둘 때 바깥 테두리 대신 위 구분선만 긋는다(상자 안 상자를 피한다). */
export function RecordLog({ events, bare = false }: { events: RecordEvent[]; bare?: boolean }) {
  if (events.length === 0) {
    return <p className="rounded-[0.875rem] border-[1.5px] border-border-strong px-4 py-3 text-15 font-medium text-text-secondary">아직 기록이 없어요.</p>;
  }
  return (
    <ol className={`min-h-0 flex-1 overflow-y-auto ${bare ? "border-t border-border-default" : "rounded-[0.875rem] border-[1.5px] border-border-strong"}`}>
      {events.map((e, i) => (
        <li key={i} className={`grid grid-cols-[2.75rem_5.25rem_1fr] gap-2.5 border-b border-border-default py-2 text-13 leading-[1.45] last:border-b-0 ${bare ? "" : "px-3.5"}`}>
          <time dateTime={e.at} className="font-bold tabular-nums">
            {shortTime(e.at)}
          </time>
          <span className="font-bold text-text-secondary">{RECORD_CATEGORIES.find((c) => c.key === e.category)?.label}</span>
          <span className="font-medium break-words">{e.text}</span>
        </li>
      ))}
    </ol>
  );
}

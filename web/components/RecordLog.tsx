import { RECORD_CATEGORIES } from "@/lib/constants";
import type { RecordEvent } from "@/lib/types";

const shortTime = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** 제작 기록 표(Claude Design 'Logoche Final' 3m): 시각 · 갈래 · 내용, 일어난 차례대로. 받는 파일에는 갈래별로 묶어 적는다(lib/record.ts). */
export function RecordLog({ events }: { events: RecordEvent[] }) {
  if (events.length === 0) {
    return <p className="rounded-[0.875rem] border-[1.5px] border-edge px-4 py-3 text-sm font-medium text-muted">아직 기록이 없어요.</p>;
  }
  return (
    <ol className="min-h-0 flex-1 overflow-y-auto rounded-[0.875rem] border-[1.5px] border-edge">
      {events.map((e, i) => (
        <li key={i} className="grid grid-cols-[2.75rem_5.25rem_1fr] gap-2.5 border-b border-line px-3.5 py-2 text-13 leading-[1.45] last:border-b-0">
          <time dateTime={e.at} className="font-bold tabular-nums">
            {shortTime(e.at)}
          </time>
          <span className="font-bold text-muted">{RECORD_CATEGORIES.find((c) => c.key === e.category)?.label}</span>
          <span className="font-medium break-words">{e.text}</span>
        </li>
      ))}
    </ol>
  );
}

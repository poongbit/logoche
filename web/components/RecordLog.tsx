import { RECORD_CATEGORIES } from "@/lib/constants";
import type { RecordEvent } from "@/lib/types";

// 제작 기록 표(11/6 ST2 v2 549:402): '11월 6일 6:42 | 내용' 줄, 위 1px 먹 선 + 줄 사이 옅은 선. 갈래(창작 의도·AI 모델 등)는 내용 앞에 작게.
// 받는 파일에는 갈래별로 묶어 적는다(lib/record.ts).

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** newestFirst: 최근 것부터(스튜디오). 아니면 일어난 차례대로. */
export function RecordLog({ events, newestFirst = false }: { events: RecordEvent[]; newestFirst?: boolean }) {
  if (events.length === 0) {
    return <p className="border-t border-border-active py-4 text-15 text-text-secondary">아직 기록이 없어요.</p>;
  }
  const list = newestFirst ? [...events].reverse() : events;
  return (
    <ol className="border-t border-border-active">
      {list.map((e, i) => (
        <li key={`${e.at}-${i}`} className="grid grid-cols-[6.5rem_1fr] gap-x-3 border-b border-border-default py-3.5 leading-normal lg:grid-cols-[12.5rem_1fr] lg:gap-x-0 lg:py-[1.0625rem]">
          <time dateTime={e.at} className="text-13 text-text-secondary tabular-nums lg:text-15">
            {when(e.at)}
          </time>
          <span className="text-sm break-words lg:text-15">
            <span className="mr-1.5 text-13 text-text-secondary">{RECORD_CATEGORIES.find((c) => c.key === e.category)?.label}</span>
            {e.text}
          </span>
        </li>
      ))}
    </ol>
  );
}

"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";

// 11/6 밑줄 탭(피그마 549:402 시안 탭·글자 탭, 내 폰트 L2 필터). 고른 탭: 16 굵게 먹 + 글자 폭 2.5px 먹 밑줄(8px 아래).
// 안 고른 탭: 16 보통 보조 글자색. 사이 32px. 알약·민트 채움은 쓰지 않는다.
// 접근성: role="tablist" / "tab", 화살표·Home·End로 옮기면 바로 고른다(자동 활성). Tab은 고른 탭으로만 들어온다.

export type TabItem<V extends string> = { value: V; label: ReactNode };

/** 탭 버튼의 id(패널의 aria-labelledby에 쓴다) */
export const tabId = (prefix: string, value: string) => `${prefix}-tab-${value}`;
/** 탭 패널의 id(패널 요소에 붙인다) */
export const tabPanelId = (prefix: string, value: string) => `${prefix}-panel-${value}`;

export function UnderlineTabs<V extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
  hasPanels = true,
  className = "",
}: {
  tabs: readonly TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
  /** tablist 이름(aria-label) */
  label: string;
  /** 탭·패널 id 앞부분. 패널은 id={tabPanelId(idPrefix, v)} role="tabpanel" aria-labelledby={tabId(idPrefix, v)}로 둔다. */
  idPrefix?: string;
  /** 패널이 없는 필터 탭이면 false(aria-controls를 붙이지 않는다) */
  hasPanels?: boolean;
  className?: string;
}) {
  const auto = useId().replace(/:/g, "");
  const prefix = idPrefix ?? `tabs${auto}`;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = tabs.findIndex((t) => t.value === value);
    let next = -1;
    if (e.key === "ArrowRight") next = (at + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (at - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].value);
    document.getElementById(tabId(prefix, tabs[next].value))?.focus();
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={`flex flex-wrap gap-x-8 gap-y-2 ${className}`}>
      {tabs.map((t) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            id={tabId(prefix, t.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={hasPanels ? tabPanelId(prefix, t.value) : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={`relative pb-2.5 text-base transition-colors duration-(--dur-fast) ${
              selected
                ? "font-bold text-text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-[2.5px] after:bg-bg-inverse"
                : "font-medium text-text-secondary hover:text-text-primary"
            }`}
          >
            {/* 굵기가 바뀌어도 탭 폭이 흔들리지 않게 굵은 글자 폭을 미리 잡아 둔다 */}
            <span className="grid">
              <span aria-hidden className="invisible col-start-1 row-start-1 font-bold">
                {t.label}
              </span>
              <span className="col-start-1 row-start-1">{t.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

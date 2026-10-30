"use client";

import { useRef } from "react";

/** 슬라이더(Claude Design 'C States'). onChange는 움직이는 동안, onCommit은 손을 뗄 때 한 번(제작 기록용).
 * suggested를 주면 길 위에 AI 제안 자리를 표시하고, 바꾼 뒤에는 '기록됨'과 'AI 제안으로 (값)' 되돌리기를 보인다. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  format = String,
  suggested,
  hint,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  suggested?: number;
  hint?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
  onCommit?: (from: number, to: number) => void;
}) {
  const startRef = useRef<number | null>(null);
  const pct = (v: number) => `${((Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * 100}%`;
  const changed = suggested !== undefined && Math.abs(value - suggested) >= step / 2;

  function begin() {
    if (startRef.current === null) startRef.current = value;
  }

  function commit(to: number) {
    const from = startRef.current;
    startRef.current = null;
    if (from !== null && from !== to) onCommit?.(from, to);
  }

  function reset() {
    if (suggested === undefined) return;
    onChange(suggested);
    onCommit?.(value, suggested);
  }

  return (
    <div className="grid gap-1.5">
      <div className={`flex items-baseline gap-2 text-sm font-bold ${disabled ? "text-muted" : ""}`}>
        <span>{label}</span>
        {changed && <span className="text-13 text-good">기록됨</span>}
        <span className="ml-auto tabular-nums">{format(value)}</span>
        {suggested !== undefined &&
          (changed ? (
            <button
              type="button"
              onClick={reset}
              disabled={disabled}
              className="-my-1.5 -mr-2 min-h-7 rounded-full px-2 text-13 font-semibold underline underline-offset-2 hover:bg-stage"
            >
              AI 제안으로 ({format(suggested)})
            </button>
          ) : (
            <span className="text-13 font-semibold text-muted">AI 제안</span>
          ))}
      </div>
      <div className="relative h-5">
        {changed && <span aria-hidden className="absolute top-1 h-3 w-0.5 bg-muted" style={{ left: pct(suggested!) }} />}
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onPointerDown={begin}
          onKeyDown={begin}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={(e) => commit(Number(e.currentTarget.value))}
          onKeyUp={(e) => commit(Number(e.currentTarget.value))}
          className="ds-range relative block"
          style={{ ["--fill" as string]: pct(value) }}
        />
      </div>
      {hint && <span className="text-13 font-medium text-muted">{hint}</span>}
    </div>
  );
}

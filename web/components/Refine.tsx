"use client";

// 화면 4 전체 다듬기(10/28: 초안 → 폰트 만들기 → 다듬기 순서로 바꾸며 화면 3에서 옮김).
// 값을 바꾸면 미리보기는 바로 바뀌고, 폰트 파일은 화면 4의 '적용해 보기'를 누를 때 다시 만든다(lib/store.tsx markEdited).
// 10/29: 자소 조합을 그만두며 자소별 다듬기는 없앴다(글자마다 따로 그려 자소 하나를 고쳐 전체에 반영할 수 없다).
// 글자 하나하나는 화면 4 '글자 고치기'(그림판처럼)로 고친다.
// 10/29 디자인(Logoche Final 3g): 슬라이더 2×2, AI 제안 자리 표시와 'AI 제안으로' 되돌리기.

import { Slider } from "@/components/Slider";
import { AXES, WEIGHT_CAP, formatAxis } from "@/lib/constants";
import { useApp } from "@/lib/store";

/** 전체 다듬기 슬라이더: 굵기·너비·기울기·자간 */
export function RefineSliders() {
  const { state, dispatch, record } = useApp();
  const axes = (state.style?.axes ?? []).filter((a) => AXES[a.key].stage === "refine");

  return (
    <div className="grid gap-x-7 gap-y-3 sm:grid-cols-2">
      {axes.map((axis) => {
        const def = AXES[axis.key];
        return (
          <Slider
            key={axis.key}
            label={def.label}
            value={axis.value}
            min={def.min}
            max={axis.key === "weight" ? WEIGHT_CAP : def.max}
            step={def.step}
            suggested={axis.suggested}
            format={(v) => formatAxis(axis.key, v)}
            onChange={(value) => dispatch({ type: "setAxis", key: axis.key, value })}
            onCommit={(from, to) => record("selection", `다듬기: ${def.label} ${formatAxis(axis.key, from)}→${formatAxis(axis.key, to)}`)}
          />
        );
      })}
    </div>
  );
}

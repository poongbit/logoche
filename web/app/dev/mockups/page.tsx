import { notFound } from "next/navigation";
import { MockupsPreview } from "./MockupsPreview";

// 개발용(11/6): 시안 세 장면을 서버·폰트 작업 없이 한 화면에 늘어놓고 본다. 배포에서는 열리지 않는다.
// ?font=<CSS font-family>&css=<글꼴 CSS 주소>&name=<가게 이름>&colors=<#hex,#hex,#hex>
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MockupsPreview />;
}

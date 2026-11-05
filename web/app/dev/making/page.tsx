import { notFound } from "next/navigation";
import { MakingPreview } from "./MakingPreview";

// 개발용 목업(11/5): 만드는 중 화면을 서버 없이 시간이 흐르는 가짜 진행으로 보여 준다. 배포에서는 열리지 않는다.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MakingPreview />;
}

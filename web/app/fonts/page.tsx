import type { Metadata } from "next";
import { FontList } from "./FontList";

// 내 폰트 목록(11/2: 메인 화면이 /를 쓰게 되어 /에서 옮겼다).
export const metadata: Metadata = { title: "내 폰트" };

export default function FontsPage() {
  return <FontList />;
}

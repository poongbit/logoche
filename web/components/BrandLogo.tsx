import Image from "next/image";

// 서비스 로고. 11/6 밤: 머리줄(흰 바탕)은 피그마 머리줄(475:1397 · 475:1414, 메인 427:9)과 같은 '로고 반전판'(179:270)
// — 먹 스티커 + 흰 'Logo' + 민트 '체' 태그. 예전 public/logo.png(먹 'Logo' + 먹 태그 안 민트 '체')은 '기본판'이라
// 어두운 바탕(메인 바닥)에 흰 칼선을 둘러 쓰는 쪽이다.
// public/logo-light.svg는 179:270을 SVG로 내보낸 것(634 × 301, 그림자·칼선까지 든 넓이). 피그마 틀(579 × 300)은
// 그림 안 왼쪽 19.75에서 시작하므로, 틀 왼쪽 끝을 본문 시작선에 맞추려고 그만큼(높이의 6.6%) 왼쪽으로 당긴다.
// 크기: 피그마 머리줄의 로고 틀 높이 43.5(데스크톱·모바일 같음) → 2.72rem(1rem = 16px 기준, 큰 화면은 html 글자 크기를 따라 커진다).

export function BrandLogo({ className = "h-[2.72rem] w-auto -ml-[0.18rem]" }: { className?: string }) {
  return <Image src="/logo-light.svg" alt="로고체" width={634} height={301} priority unoptimized className={className} />;
}

import Image from "next/image";

// 서비스 로고. 11/6 밤 결정 — 바탕에 따라 두 판을 나눠 쓴다.
// - 흰·밝은 바탕(머리줄, 메일): 기본판 public/logo.png(먹 'Logo' + 먹 태그 안 민트 '체'). 글자가 꽉 찬 먹색이라 작은 크기에서도 또렷하고,
//   흰 바탕 + 먹 글자라는 사이트 규칙과 맞는다. 반전판을 흰 바탕에 두면 글자 안쪽 흰색이 바탕과 같아져 얇은 먹 테두리만 남는다.
// - 어두운 바탕(메인 바닥줄): 반전판 public/logo-on-dark.svg(피그마 179:270 — 먹 스티커 + 흰 'Logo' + 민트 '체').
// 크기: 피그마 머리줄 로고 틀 폭(약 84px)에 글자 폭을 맞춘 높이(1.75rem, 390에서 약 77px). 큰 화면은 html 글자 크기를 따라 커진다.

export function BrandLogo({ className = "h-[1.75rem] w-auto" }: { className?: string }) {
  return <Image src="/logo.png" alt="로고체" width={962} height={350} priority className={className} />;
}

export function BrandLogoOnDark({ className = "h-[2.62rem] w-auto lg:h-[2.78rem]" }: { className?: string }) {
  return <Image src="/logo-on-dark.svg" alt="로고체" width={634} height={301} unoptimized className={className} />;
}

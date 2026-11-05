import Image from "next/image";

/** 서비스 로고(11/5 새 로고: 검정 'Logo'와 민트 '체'). 투명 PNG라 크림 바탕에 그대로 얹는다. 높이만 정하면 너비는 비율대로 따라온다. */
export function BrandLogo({ className = "h-9 w-auto lg:h-11" }: { className?: string }) {
  return <Image src="/logo.png" alt="로고체" width={962} height={350} priority className={className} />;
}

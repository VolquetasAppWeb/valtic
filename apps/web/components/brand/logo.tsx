import Image from "next/image";

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 36, className }: LogoProps): JSX.Element {
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-black/5 ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.png"
        alt="VALTIC"
        width={size}
        height={size}
        className="h-full w-full object-cover"
        priority
      />
    </div>
  );
}

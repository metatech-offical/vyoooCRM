import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils";

const LOGO_SRC = {
  red: "/branding/vyooo-red-transparent.png",
  white: "/branding/vyooo-white-transparent.png",
} as const;

type VyoooLogoProps = Omit<ImageProps, "src" | "alt"> & {
  variant?: keyof typeof LOGO_SRC;
};

export function VyoooLogo({
  variant = "red",
  className,
  width = 180,
  height = 46,
  ...props
}: VyoooLogoProps) {
  return (
    <Image
      src={LOGO_SRC[variant]}
      alt="Vyooo"
      width={width}
      height={height}
      className={cn("h-auto w-auto object-contain", className)}
      {...props}
    />
  );
}

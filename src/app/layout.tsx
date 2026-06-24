import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vyooo Admin Dashboard",
  description: "Full platform control panel",
  icons: {
    icon: "/branding/vyooo-red-transparent.png",
    apple: "/branding/vyooo-red-transparent.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geist.className} min-h-full bg-zinc-50 text-zinc-900`}>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "로션욤 노래책",
  description: "로션욤 방송에서 부를 수 있는 노래를 빠르게 찾고 저장하는 노래책",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

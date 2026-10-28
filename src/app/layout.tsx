import type { Metadata } from "next";
import { Wix_Madefor_Display, Wix_Madefor_Text } from "next/font/google";
import { BRAND } from "@/core/brand";
import "./globals.css";
import "@/components/site/afinlo-site.css";

const display = Wix_Madefor_Display({ variable: "--font-display", subsets: ["latin"], display: "swap" });
const body = Wix_Madefor_Text({ variable: "--font-body", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: `${BRAND.name}: find your real fans`, template: `%s · ${BRAND.name}` },
  description: BRAND.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Jost } from "next/font/google";
import { brand } from "@/lib/brand";
import "./globals.css";

const jost = Jost({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-jost", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(brand.origin),
  title: brand.name,
  description: brand.description,
  applicationName: brand.name,
  openGraph: { title: brand.name, description: brand.tagline, type: "website" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: brand.themeColor,
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={jost.variable}>
      <body>{children}</body>
    </html>
  );
}

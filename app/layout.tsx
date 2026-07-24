import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AutoMayarStatusUpdater from "@/app/components/AutoMayarStatusUpdater";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Elzade Store System",
  description: "نظام إدارة الطلبات والمخزون والتقارير المالية",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      dir="rtl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AutoMayarStatusUpdater />
        {children}
      </body>
    </html>
  );
}

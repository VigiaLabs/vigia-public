import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const merriweather = Merriweather({
  weight: ["300", "400", "700"],
  subsets: ["latin"],
  variable: "--font-merriweather",
});

export const metadata: Metadata = {
  title: "VIGIA Search",
  description: "Perplexity for Government Infrastructure",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${merriweather.variable} h-full antialiased`}
    >
      <body className="flex h-full min-h-screen">
        <Sidebar />
        <MobileSidebar />
        <main className="flex-1 md:ml-[260px]">{children}</main>
      </body>
    </html>
  );
}

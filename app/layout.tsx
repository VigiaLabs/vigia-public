import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { Sidebar } from "@/components/layout/sidebar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const merriweather = Merriweather({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-merriweather",
});

export const metadata: Metadata = {
  title: "VIGIA Search",
  description: "Perplexity for Government Infrastructure",
  themeColor: "#111827",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VIGIA",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  },
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
      <body className="flex min-h-screen h-full bg-cream text-text-primary">
        <Sidebar />
        <MobileSidebar />
        <main className="flex-1 md:ml-[260px]">{children}</main>
      </body>
    </html>
  );
}
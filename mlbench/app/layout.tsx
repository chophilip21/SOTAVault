import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import { SidebarProvider } from "./components/LayoutContent";
import MainContent from "./components/MainContent";
import { AuthProviderWrapper } from "./components/AuthProviderWrapper";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MLBench Archive",
  description: "Research paper website for MLBench Archive",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50`}
      >
        <AuthProviderWrapper>
          <SidebarProvider>
            <Header />
            <MainContent>{children}</MainContent>
          </SidebarProvider>
        </AuthProviderWrapper>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import { SidebarProvider } from "./components/LayoutContent";
import MainContent from "./components/MainContent";
import { AuthProviderWrapper } from "./components/AuthProviderWrapper";
import ProtectedRoute from "./components/ProtectedRoute";
import BuyMeACoffeeWidget from "./components/BuyMeACoffeeWidget";

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
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
          integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50`}
      >
        <AuthProviderWrapper>
          <SidebarProvider>
            <Header />
            <MainContent>
              <ProtectedRoute>{children}</ProtectedRoute>
            </MainContent>
          </SidebarProvider>
        </AuthProviderWrapper>
        <BuyMeACoffeeWidget />
      </body>
    </html>
  );
}

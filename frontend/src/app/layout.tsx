import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "./i18n/LanguageContext";
import ClientOnly from "./components/ClientOnly";
import { DialogProvider } from "./components/DialogProvider";
import { ConnectorProvider } from "../lib/ConnectorContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LogiFlow Warehouse Management",
  description: "Enterprise operations and logistics control hub",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/icon.png",
    shortcut: "/icon.png",
  },
  other: {
    google: "notranslate",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1d4ed8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      translate="no"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col notranslate" suppressHydrationWarning>
        <LanguageProvider>
          <ClientOnly>
            <DialogProvider>
              <ConnectorProvider>
                {children}
              </ConnectorProvider>
            </DialogProvider>
          </ClientOnly>
        </LanguageProvider>
      </body>
    </html>
  );
}

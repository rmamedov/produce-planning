import type { Metadata, Viewport } from "next";

import "@/app/globals.css";
import "@/app/silpo-fonts.css";

import { AppProvider } from "@/components/providers/app-provider";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: `${env.NEXT_PUBLIC_APP_NAME} | Production Planning`,
  description: "Production planning platform for culinary goods",
  applicationName: "Виробничі задачі",
  appleWebApp: {
    capable: true,
    title: "Задачі",
    statusBarStyle: "default"
  },
  other: {
    // Explicit legacy tag for older iOS standalone launch.
    "apple-mobile-web-app-capable": "yes"
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport: Viewport = {
  themeColor: "#FF8200"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";

import "@/app/globals.css";

import { AppProvider } from "@/components/providers/app-provider";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: `${env.NEXT_PUBLIC_APP_NAME} | Production Planning`,
  description: "Production planning platform for culinary goods"
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

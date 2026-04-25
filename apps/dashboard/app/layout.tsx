import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@feedchat/ui/styles.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Feedchat Dashboard",
  description: "Dashboard authentication app for Feedchat",
  icons: {
    icon: "/assets/favicon.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

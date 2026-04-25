import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { getPublicChatBranding } from "../lib/resolve-public-company-name";
import "@feedchat/ui/styles.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { companyName } = await getPublicChatBranding();
  const title = companyName ? `${companyName} | Feedback` : "Feedback";
  const description = companyName
    ? `Chat with ${companyName}'s AI-powered feedback tool. Share ideas and frustrations.`
    : "Chat with the AI-powered feedback tool. Share ideas and frustrations.";

  return {
    title,
    description,
    icons: {
      icon: "/assets/favicon.png"
    }
  };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const headerList = await headers();
  const { colorPalette } = await getPublicChatBranding();
  const isDarkPalette = colorPalette === "dark";

  return (
    <html className={isDarkPalette ? "chat-page-dark-root" : undefined} lang="en">
      <body
        className={isDarkPalette ? "chat-page-dark-body" : undefined}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}

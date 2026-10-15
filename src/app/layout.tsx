import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Synk — your team workspace",
  description: "Chat, tickets, docs and time. One workspace.",
};

const themeScript = `var t=localStorage.getItem("synk-theme");if(["black","white","forest","lavender"].includes(t))document.documentElement.dataset.theme=t`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="black" className={inter.variable} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}

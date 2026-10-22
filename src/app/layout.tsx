import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Eduvia Marketing", template: "%s · Eduvia Marketing" },
  description: "Forms and automations for Eduvia.",
  robots: { index: false, follow: false },
  icons: { icon: "/brand/favicon.png?v=3", apple: "/brand/apple-touch-icon.png?v=3" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/brand/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/brand/fonts/claston.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

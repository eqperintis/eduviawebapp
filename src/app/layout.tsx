import type { Metadata } from "next";
import { PENCIL_FILTERS } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Quolume Marketing", template: "%s · Quolume Marketing" },
  description: "Forms and automations for Quolume.",
  robots: { index: false, follow: false },
  icons: { icon: "/brand/favicon.png?v=2", apple: "/brand/apple-touch-icon.png?v=2" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/brand/fonts/plus-jakarta-sans.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        {/* Pencil filters from quolume.com: wobble a line, then grain it like graphite. */}
        <div dangerouslySetInnerHTML={{ __html: PENCIL_FILTERS }} />
        {children}
      </body>
    </html>
  );
}

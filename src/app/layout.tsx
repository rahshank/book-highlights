import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2d2a26",
};

export const metadata: Metadata = {
  title: "Book Highlights",
  description: "Track and review your book highlights and notes",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Book Highlights",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        <nav>
          <div className="nav-inner">
            <Link href="/" className="logo">
              Book Highlights
            </Link>
            <Link href="/">Library</Link>
            <Link href="/search">Search</Link>
            <Link href="/import">Import</Link>
          </div>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}

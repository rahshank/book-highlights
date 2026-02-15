import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Book Highlights",
  description: "Track and review your book highlights and notes",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Book an appointment",
  description: "Online booking for small businesses",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

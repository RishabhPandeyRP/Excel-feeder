import type { Viewport } from "next";
import "./globals.css";

export const metadata = {
  title: "RCH Image to Excel AI Studio",
  description: "Extract Hindi and English RCH register images into official Child and Mother Excel schemas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

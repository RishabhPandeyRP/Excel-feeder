import "./globals.css";

export const metadata = {
  title: "RCH Image to Excel",
  description: "Extract RCH register images into the master Excel schema.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

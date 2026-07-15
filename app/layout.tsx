import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { WhatsAppFloatingButton } from "@/components/whatsapp-floating-button";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const siteDescription =
  "Perfumes importados y Ã¡rabes, mates, termos, accesorios y regalos. Te ayudamos a elegir segÃºn tus gustos, ocasiÃ³n y presupuesto.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SFSTORE Importados",
    template: "%s | SFSTORE Importados",
  },
  description: siteDescription,
  keywords: [
    "perfumes importados",
    "perfumes Ã¡rabes",
    "decants",
    "mates",
    "termos",
    "regalos",
    "SFSTORE Importados",
  ],
  authors: [{ name: "SFSTORE Importados" }],
  creator: "SFSTORE Importados",
  openGraph: {
    title: "SFSTORE Importados",
    description: siteDescription,
    url: "/",
    siteName: "SFSTORE Importados",
    images: [
      {
        url: "/logo-sfstore-horizontal.png",
        alt: "SFSTORE Importados",
      },
    ],
    locale: "es_AR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SFSTORE Importados",
    description: siteDescription,
    images: ["/logo-sfstore-horizontal.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-AR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <WhatsAppFloatingButton />
      </body>
    </html>
  );
}


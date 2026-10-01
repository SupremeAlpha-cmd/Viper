import type { Metadata } from "next";
import { Space_Grotesk, Inter, Press_Start_2P } from "next/font/google";
import { Providers } from "../components/Providers";
import { Chrome } from "../components/Chrome";
import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const body = Inter({ subsets: ["latin"], variable: "--font-sans" });
const pixel = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://viper-blast.xyz"),
  title: "Viper — on-chain arcade",
  description:
    "Viper is an on-chain arcade on Robinhood Chain. Snake, Bomber Arena, Chess, Snakes & Ladders and more — one VIPER token, winner takes the pot.",
  icons: { icon: "/logo.png" },
  openGraph: {
    title: "Viper — on-chain arcade",
    description:
      "Six games. One VIPER token. Stake it, outplay everyone, and take the pot — every match settled on-chain.",
    images: ["/opengraph-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${pixel.variable}`}>
      <body className="min-h-screen bg-[#070907] font-sans text-zinc-200 antialiased">
        <Providers>
          <Chrome>{children}</Chrome>
        </Providers>
      </body>
    </html>
  );
}

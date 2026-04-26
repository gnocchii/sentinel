import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Sentinel",
  description: "AI-powered camera placement and security analysis",
  icons: { icon: "/favicon.png", shortcut: "/favicon.png", apple: "/favicon.png" },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="overflow-hidden h-screen w-screen">
        {/* SVG filters used by liquid-glass cards */}
        <svg style={{ display: "none" }} aria-hidden>
          <filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="2" seed="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="40" />
          </filter>
        </svg>
        {children}
      </body>
    </html>
  )
}

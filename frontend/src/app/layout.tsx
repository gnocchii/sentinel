import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "SENTINEL — Physical Security Architect",
  description: "AI-powered camera placement and security analysis",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="overflow-hidden h-screen w-screen">{children}</body>
    </html>
  )
}

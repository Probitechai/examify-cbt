import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Examify',
  description: 'Computer-Based Testing for Nigerian secondary schools',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

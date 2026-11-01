import type { Metadata, Viewport } from 'next'
import { connection } from 'next/server'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: 'Soirée — Plan the celebration, not the spreadsheet',
  description:
    'A thoughtful planning assistant for weddings, birthdays, and community celebrations.',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#fbf8f3',
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Render per request so the CSP nonce from proxy.ts reaches every script tag.
  await connection()
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}

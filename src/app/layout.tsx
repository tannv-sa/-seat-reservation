import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SeatBook',
  description: 'Reserve your seat',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-gray-50 text-gray-900 antialiased">
        <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <a href="/seats" className="font-semibold text-lg tracking-tight">
            SeatBook
          </a>
          <a
            href="/api/auth/signout"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Sign out
          </a>
        </nav>
        <main className="max-w-3xl mx-auto px-4 py-10">{children}</main>
      </body>
    </html>
  )
}

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from '@/components/theme-provider'
import { ERPProvider } from '@/lib/erp/provider'
import { QueryProvider } from '@/lib/queryClient'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })

export const metadata: Metadata = {
  title: 'RecipeFood | ERP System',
  description: 'Enterprise Resource Planning System',
  icons: {
    icon: '/recipefood_icon.png',
    shortcut: '/recipefood_icon.png',
    apple: '/recipefood_icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <QueryProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            <ERPProvider>{children}</ERPProvider>
            <Toaster position="top-right" />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  )
}

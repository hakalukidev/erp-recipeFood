"use client"

import * as React from "react"
import { useServerInsertedHTML } from "next/navigation"

// Minimal drop-in replacement for `next-themes`.
//
// next-themes injects its anti-flash script via `React.createElement("script", ...)`
// inside the component tree. React 19 now warns whenever a <script> tag is
// rendered by a client component ("Encountered a script tag while rendering
// React component..."), so we inject the same script directly into the SSR
// HTML stream with `useServerInsertedHTML` instead — outside the React tree,
// where React never sees it and the warning can't fire.

type Theme = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

type ThemeProviderProps = {
  children: React.ReactNode
  attribute?: "class"
  defaultTheme?: Theme
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
  storageKey?: string
}

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const STORAGE_KEY = "theme"
const MEDIA_QUERY = "(prefers-color-scheme: dark)"

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light"
}

function applyTheme(resolved: ResolvedTheme, disableTransition: boolean) {
  const root = document.documentElement
  let style: HTMLStyleElement | null = null

  if (disableTransition) {
    style = document.createElement("style")
    style.appendChild(
      document.createTextNode("*,*::before,*::after{transition:none!important}")
    )
    document.head.appendChild(style)
  }

  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved

  if (style) {
    // force a reflow so the transition-disabling style above takes effect
    // before it's removed on the next tick
    window.getComputedStyle(root).colorScheme
    const styleToRemove = style
    setTimeout(() => document.head.removeChild(styleToRemove), 1)
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = false,
  storageKey = STORAGE_KEY,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)
  const [systemTheme, setSystemTheme] = React.useState<ResolvedTheme>("light")

  useServerInsertedHTML(() => (
    <script
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var k=${JSON.stringify(
          storageKey
        )},d=${JSON.stringify(defaultTheme)},s=${JSON.stringify(enableSystem)};var t=localStorage.getItem(k)||d;var r=(t==="system"&&s)?(window.matchMedia("${MEDIA_QUERY}").matches?"dark":"light"):t;var c=document.documentElement.classList;c.remove("light","dark");c.add(r);document.documentElement.style.colorScheme=r}catch(e){}})()`,
      }}
    />
  ))

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey) as Theme | null
      if (stored) setThemeState(stored)
    } catch {
      // localStorage unavailable — fall back to defaultTheme
    }
    setSystemTheme(getSystemTheme())
  }, [storageKey])

  React.useEffect(() => {
    if (!enableSystem) return
    const mq = window.matchMedia(MEDIA_QUERY)
    const onChange = () => setSystemTheme(mq.matches ? "dark" : "light")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [enableSystem])

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme

  React.useEffect(() => {
    applyTheme(resolvedTheme, disableTransitionOnChange)
  }, [resolvedTheme, disableTransitionOnChange])

  const setTheme = React.useCallback(
    (next: Theme) => {
      setThemeState(next)
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        // localStorage unavailable — theme just won't persist
      }
    },
    [storageKey]
  )

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) {
    return { theme: "system", resolvedTheme: "light", setTheme: () => {} }
  }
  return ctx
}

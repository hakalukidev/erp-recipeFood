"use client"

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgePercent,
  Bell,
  Boxes,
  Calculator,
  CheckCheck,
  ChevronDown,
  ClipboardCheck,
  FileBarChart,
  HandCoins,
  Handshake,
  LayoutDashboard,
  Library,
  Lock,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PiggyBank,
  ReceiptText,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Tags,
  Truck,
  Undo2,
  Users,
  Wallet,
  Warehouse,
  X,
} from 'lucide-react'

import { ThemeToggle } from '@/components/theme-toggle'
import { buildApprovalQueue } from '@/lib/erp/approvals'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { LoginScreen } from '@/components/auth/LoginScreen'
import { useERP } from '@/lib/erp/provider'
import { cn } from '@/lib/utils'
import { formatDateTime, toArray } from '@/lib/erp/utils'

type NavigationItem = {
  label: string
  description: string
  href: string
  icon: typeof LayoutDashboard
  permission: string
}

type NavigationGroup = {
  title: string
  items: NavigationItem[]
  collapsible?: boolean
}

const navigationGroups: NavigationGroup[] = [
  {
    title: '',
    items: [
      {
        label: 'Dashboard',
        description: 'Company earnings, recent rate cards/expenses, and low stock alerts',
        href: '/admin/dashboard',
        icon: LayoutDashboard,
        permission: 'dashboard:view',
      },
      {
        label: 'Approvals',
        description: 'Input & Authorization — approve or reject every department entry, or track your own submissions',
        href: '/admin/approvals',
        icon: ClipboardCheck,
        permission: 'dashboard:view',
      },
    ],
  },
  {
    title: 'Master Data',
    collapsible: true,
    items: [
      {
        label: 'Product List',
        description: 'Product catalog with name, image, and price, plus stock control',
        href: '/admin/stock/overview',
        icon: Boxes,
        permission: 'products:view',
      },
      {
        label: 'Discount Product List',
        description: 'Flat-rate/commission price list — Dealer Rate, SR commission, TP, and MRP',
        href: '/admin/discount-products',
        icon: BadgePercent,
        permission: 'products:view',
      },
      {
        label: 'Dealer List',
        description: 'Dealer directory — name, address, and phone number',
        href: '/admin/dealers',
        icon: Users,
        permission: 'dealers:view',
      },
      {
        label: 'Depot List',
        description: 'Depot directory — name, address, and phone, linked to dealers to tell depots apart on invoices',
        href: '/admin/depots',
        icon: Warehouse,
        permission: 'dealers:view',
      },
      {
        label: 'Dealer Category',
        description: 'Manage the category names used to group dealers (e.g. Wholesaler, Retailer, Distributor)',
        href: '/admin/dealer-categories',
        icon: Tags,
        permission: 'dealers:view',
      },
      {
        label: 'Vendor',
        description: 'Vendor directory — name, address, phone, and running due',
        href: '/admin/vendors',
        icon: Handshake,
        permission: 'vendor:view',
      },
    ],
  },
  {
    title: 'Transactions',
    collapsible: true,
    items: [
      {
        label: 'Purchase',
        description: 'Raw/packaging material stock and daily purchase entries with vendor due tracking',
        href: '/admin/purchase',
        icon: Truck,
        permission: 'purchase:view',
      },
      {
        label: 'Invoice',
        description: 'Raw material → manufacturing → depot → dealer rate cascade with profit margins, and Company/Depot/Dealer vouchers',
        href: '/admin/rate-card',
        icon: Calculator,
        permission: 'products:view',
      },
      {
        label: 'Product Return',
        description: 'Return goods against an invoice — reduces dealer, depot and company profit, and generates combined + individual return vouchers',
        href: '/admin/product-returns',
        icon: Undo2,
        permission: 'products:view',
      },
      {
        label: 'Expenses',
        description: 'Record and review day-to-day running costs, plus per-employee salary history',
        href: '/admin/finance',
        icon: ReceiptText,
        permission: 'finance:view',
      },
      {
        label: 'Cash Maintenance',
        description: 'Cash In / Cash Out that never touches profit — goods purchase, pouch/packet, depot product transport — plus the Daily Cash Book and reconciliation',
        href: '/admin/cash-maintenance',
        icon: Wallet,
        permission: 'finance:view',
      },
      {
        label: 'Loan Chart',
        description: 'Loan chart per member with running balance, repayments and investors',
        href: '/admin/loans',
        icon: HandCoins,
        permission: 'finance:view',
      },
    ],
  },
  {
    title: 'Reports & Accounts',
    collapsible: true,
    items: [
      {
        label: 'Reports',
        description: 'Reports Hub — Sales, Expense, Purchase, Vendor, and Loan reports, each exportable/printable',
        href: '/admin/reports',
        icon: FileBarChart,
        permission: 'reports:view',
      },
      {
        label: 'Accounting',
        description: 'Chart of Accounts, Journal, Bank, General Ledger, Trial Balance, and Balance Sheet',
        href: '/admin/accounting',
        icon: Library,
        permission: 'accounting:view',
      },
      {
        label: 'Company Earnings',
        description: 'Depot-sale profit vs expenses, with a monthly breakdown',
        href: '/admin/earnings',
        icon: PiggyBank,
        permission: 'finance:view',
      },
    ],
  },
  {
    title: 'Administration',
    items: [
      {
        label: 'User & Role Management',
        description: 'Employee logins and permission matrix',
        href: '/admin/users',
        icon: ShieldCheck,
        permission: 'users:view',
      },
      {
        label: 'Settings',
        description: 'Company profile, currency, and return/refund policy',
        href: '/admin/settings',
        icon: SettingsIcon,
        permission: 'users:view',
      },
    ],
  },
] as const

type AdminShellProps = {
  active: string
  children: ReactNode
  fullWidth?: boolean
}

function SidebarContent({
  active,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: {
  active: string
  onNavigate?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const { hasPermission, currentUser, data } = useERP()

  // Entries this user can authorize right now — shown as a count on the
  // Approvals nav item.
  const pendingApprovalCount = useMemo(() => {
    const records = buildApprovalQueue(data).filter(
      (row) => row.status === 'pending' && hasPermission(row.permission)
    ).length
    const expenses = hasPermission('finance:approve')
      ? Object.values(data?.expenses ?? {}).filter((expense) => expense.approvalStatus === 'pending').length
      : 0
    return records + expenses
  }, [data, hasPermission])

  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasPermission(item.permission)),
    }))
    .filter((group) => group.items.length > 0)

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const activeGroup = navigationGroups.find(
      (group) => group.collapsible && group.items.some((item) => item.label === active)
    )
    return new Set(activeGroup ? [activeGroup.title] : [])
  })

  function toggleGroup(title: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(title)) {
        next.delete(title)
      } else {
        next.add(title)
      }
      return next
    })
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          'flex h-16 items-center border-b border-sidebar-border',
          collapsed ? 'px-3' : 'px-5'
        )}
      >
        <div className={cn('flex w-full items-center gap-2', collapsed ? 'justify-center' : 'justify-between')}>
          <Link
            href="/admin/dashboard"
            className={cn('flex min-w-0 items-center gap-3', collapsed && 'justify-center')}
            onClick={onNavigate}
          >
            <Image src="/recipefood_icon.png" alt="ERP" width={32} height={32} className="h-8 w-8 shrink-0 rounded-md object-contain" />
            {!collapsed ? (
              <div className="min-w-0 leading-tight">
                <h2 className="truncate text-[15px] font-semibold">RecipeFood</h2>
                <p className="text-[11px] text-sidebar-foreground/55">ERP System</p>
              </div>
            ) : null}
          </Link>
          {onToggleCollapse ? (
            <Button
              variant="ghost"
              size="icon"
              className={cn('hidden h-8 w-8 shrink-0 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground lg:inline-flex', collapsed && 'lg:hidden')}
              onClick={onToggleCollapse}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          ) : null}
        </div>
      </div>

      <div className={cn('flex-1 overflow-y-auto overflow-x-hidden py-4', collapsed ? 'px-2' : 'px-3')}>
        {collapsed && onToggleCollapse ? (
          <Button
            variant="ghost"
            size="icon"
            className="mx-auto mb-3 hidden h-8 w-8 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent lg:flex"
            onClick={onToggleCollapse}
            title="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        ) : null}
        <div className="space-y-5">
          {visibleGroups.map((group) => {
            const isCollapsible = Boolean(group.collapsible) && !collapsed
            const isOpen = !isCollapsible || openGroups.has(group.title)

            return (
            <div key={group.title || 'primary'} className="space-y-1">
              {!collapsed && group.title ? (
                isCollapsible ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.title)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/80"
                  >
                    <span>{group.title}</span>
                    <ChevronDown
                      className={cn('h-3.5 w-3.5 transition-transform', !isOpen && '-rotate-90')}
                    />
                  </button>
                ) : (
                  <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                    {group.title}
                  </p>
                )
              ) : null}
              {isOpen ? (
              <nav className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = active === item.label

                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : item.description}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-md text-sm transition-colors',
                        collapsed ? 'h-10 justify-center' : 'h-9 px-3',
                        isActive
                          ? 'bg-sidebar-primary/10 font-semibold text-sidebar-primary'
                          : 'font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                      )}
                    >
                      {isActive && !collapsed ? (
                        <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-sidebar-primary" />
                      ) : null}
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed ? (
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                          <span className="truncate">{item.label}</span>
                          {item.href === '/admin/approvals' && pendingApprovalCount > 0 ? (
                            <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                              {pendingApprovalCount}
                            </span>
                          ) : null}
                        </span>
                      ) : item.href === '/admin/approvals' && pendingApprovalCount > 0 ? (
                        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500" />
                      ) : null}
                    </Link>
                  )
                })}
              </nav>
              ) : null}
            </div>
            )
          })}
        </div>
      </div>

      {!collapsed ? (
        <div className="border-t border-sidebar-border px-5 py-3 text-[11px] text-sidebar-foreground/50">
          Developed by{' '}
          <a href="https://hakaluki.dev" target="_blank" rel="noopener noreferrer" className="hover:text-sidebar-foreground hover:underline">
            hakaluki.dev
          </a>
        </div>
      ) : null}
    </div>
  )
}

function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioContextClass()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.3)
    oscillator.onended = () => void ctx.close()
  } catch {
    // ignore autoplay/audio restrictions
  }
}

function NotificationBell() {
  const { data, currentUser, markNotificationRead, markAllNotificationsRead } = useERP()

  const notifications = Object.values(data?.notifications ?? {})
    .filter((notification) => {
      if (!currentUser || currentUser.roleId === 'super_admin') return true
      if (!notification.roles || notification.roles.length === 0) return true
      return notification.roles.includes(currentUser.roleId)
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())

  const unread = notifications.filter((notification) => !notification.read)
  const unreadKey = unread.map((notification) => notification.id).sort().join(',')
  const seenUnreadIds = useRef<Set<string> | null>(null)

  useEffect(() => {
    const currentUnreadIds = new Set(unread.map((notification) => notification.id))
    if (seenUnreadIds.current) {
      const hasNewNotification = [...currentUnreadIds].some((id) => !seenUnreadIds.current!.has(id))
      if (hasNewNotification) playNotificationSound()
    }
    seenUnreadIds.current = currentUnreadIds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground">
          <Bell className="h-4 w-4" />
          {unread.length > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unread.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => void markAllNotificationsRead(unread.map((notification) => notification.id))}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto border-t border-border/60">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            notifications.slice(0, 20).map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => {
                  if (!notification.read) void markNotificationRead(notification.id)
                }}
                className={cn(
                  'flex w-full flex-col gap-1 border-b border-border/40 px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-accent/60',
                  !notification.read && 'bg-accent/30'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        notification.level === 'critical'
                          ? 'bg-rose-500'
                          : notification.level === 'warning'
                            ? 'bg-amber-500'
                            : 'bg-sky-500'
                      )}
                    />
                    {notification.title}
                  </span>
                  {!notification.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{notification.body}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  {formatDateTime(notification.createdAt)}
                </p>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---- Global Search (Section 83) ------------------------------------------
// One search box, searched across the identifiers a day-to-day user is
// actually likely to type into it — dealer, product,
// batch, PO/GRN number, and bank payment — each result
// jumping to the workspace page that record lives on (there's no single
// "record detail" route yet, so this gets the user to the right list rather
// than a specific row).
type SearchResult = {
  id: string
  category: string
  title: string
  subtitle: string
  href: string
}

function useGlobalSearchResults(query: string): SearchResult[] {
  const { data } = useERP()

  return useMemo(() => {
    const term = query.trim().toLowerCase()
    if (term.length < 2 || !data) return []

    const results: SearchResult[] = []
    const limit = 6

    const dealers = toArray(data.dealers).filter(
      (dealer) =>
        dealer.name.toLowerCase().includes(term) ||
        dealer.proprietorName.toLowerCase().includes(term) ||
        dealer.phone.toLowerCase().includes(term)
    )
    dealers.slice(0, limit).forEach((dealer) =>
      results.push({ id: dealer.id, category: 'Dealer', title: dealer.name, subtitle: dealer.phone, href: '/admin/dealers' })
    )

    const depots = toArray(data.depots).filter(
      (depot) =>
        depot.name.toLowerCase().includes(term) ||
        depot.proprietorName.toLowerCase().includes(term) ||
        depot.phone.toLowerCase().includes(term)
    )
    depots.slice(0, limit).forEach((depot) =>
      results.push({ id: depot.id, category: 'Depot', title: depot.name, subtitle: depot.phone, href: '/admin/depots' })
    )

    const products = toArray(data.products).filter(
      (product) => product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term)
    )
    products.slice(0, limit).forEach((product) =>
      results.push({ id: product.id, category: 'Product', title: product.name, subtitle: product.sku, href: '/admin/stock/overview' })
    )

    const discountProducts = toArray(data.discountProducts).filter((product) =>
      product.name.toLowerCase().includes(term)
    )
    discountProducts.slice(0, limit).forEach((product) =>
      results.push({
        id: product.id,
        category: 'Discount Product',
        title: product.name,
        subtitle: `Dealer Rate ${product.dealerRate}`,
        href: '/admin/discount-products',
      })
    )

    const vendors = toArray(data.vendors).filter(
      (vendor) => vendor.name.toLowerCase().includes(term) || vendor.phone.toLowerCase().includes(term)
    )
    vendors.slice(0, limit).forEach((vendor) =>
      results.push({ id: vendor.id, category: 'Vendor', title: vendor.name, subtitle: vendor.phone, href: '/admin/vendors' })
    )

    const batches = toArray(data.batches).filter(
      (batch) => batch.batchNumber.toLowerCase().includes(term) || batch.productName.toLowerCase().includes(term)
    )
    batches.slice(0, limit).forEach((batch) =>
      results.push({ id: batch.id, category: 'Batch', title: batch.batchNumber, subtitle: batch.productName, href: '/admin/stock/overview' })
    )

    const payments = toArray(data.bankTransactions).filter(
      (transaction) =>
        (transaction.payee ?? '').toLowerCase().includes(term) ||
        (transaction.chequeNumber ?? '').toLowerCase().includes(term) ||
        (transaction.note ?? '').toLowerCase().includes(term)
    )
    payments.slice(0, limit).forEach((transaction) =>
      results.push({
        id: transaction.id,
        category: 'Payment',
        title: transaction.payee || transaction.chequeNumber || transaction.type.replace('_', ' '),
        subtitle: transaction.bankLabel,
        href: '/admin/finance',
      })
    )

    return results
  }, [data, query])
}

function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const results = useGlobalSearchResults(query)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const grouped = useMemo(() => {
    const groups = new Map<string, SearchResult[]>()
    results.forEach((result) => {
      const bucket = groups.get(result.category) ?? []
      bucket.push(result)
      groups.set(result.category, bucket)
    })
    return Array.from(groups.entries())
  }, [results])

  function goTo(result: SearchResult) {
    setOpen(false)
    setQuery('')
    router.push(result.href)
  }

  return (
    <div ref={containerRef} className="relative mr-2 hidden w-56 md:block xl:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search dealer, product, vendor…"
        className="h-9 bg-muted/50 pl-9 pr-8"
      />
      {query ? (
        <button
          type="button"
          onClick={() => setQuery('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {open && query.trim().length >= 2 ? (
        <div className="absolute left-0 top-full z-40 mt-2 max-h-96 w-full min-w-[22rem] overflow-y-auto rounded-lg border border-border bg-popover p-1.5 shadow-lg">
          {grouped.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">No matches for &ldquo;{query}&rdquo;.</p>
          ) : (
            grouped.map(([category, items]) => (
              <div key={category} className="mb-2 last:mb-0">
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </p>
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goTo(item)}
                    className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium text-foreground">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

export function AdminShell({ active, children, fullWidth = false }: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('admin-sidebar-collapsed') === '1'
  })
  const { currentUser, data, logout, hasPermission, loading } = useERP()

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem('admin-sidebar-collapsed', next ? '1' : '0')
      return next
    })
  }

  const allNavigationItems = navigationGroups.flatMap((group) => group.items)

  const currentPage = useMemo(
    () => allNavigationItems.find((item) => item.label === active) ?? allNavigationItems[0],
    [active, allNavigationItems]
  )

  const roleName = currentUser ? data?.roles[currentUser.roleId]?.name ?? currentUser.roleId : 'Loading'

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          Loading workspace...
        </div>
      </main>
    )
  }

  if (!currentUser) {
    return <LoginScreen />
  }

  return (
    <div className="min-h-screen">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            'sticky top-0 hidden h-screen shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block',
            collapsed ? 'w-[68px]' : 'w-[248px]'
          )}
        >
          <SidebarContent active={active} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
            <div className="flex h-16 flex-col justify-center px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                    <SheetTrigger asChild>
                      <Button variant="ghost" size="icon" className="lg:hidden">
                        <Menu className="h-5 w-5" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[260px] border-sidebar-border bg-sidebar p-0">
                      <SheetHeader className="sr-only">
                        <SheetTitle>Navigation</SheetTitle>
                        <SheetDescription>Browse the ERP workspace.</SheetDescription>
                      </SheetHeader>
                      <div className="h-full">
                        <SidebarContent active={active} onNavigate={() => setMobileOpen(false)} />
                      </div>
                    </SheetContent>
                  </Sheet>

                  <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold tracking-tight">{currentPage.label}</h1>
                    <p className="hidden truncate text-xs text-muted-foreground md:block">{currentPage.description}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-2">
                  <GlobalSearch />

                  <NotificationBell />

                  <ThemeToggle className="hidden sm:inline-flex" />

                  <div className="ml-2 hidden items-center gap-2.5 border-l border-border pl-4 sm:flex">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {currentUser.name
                        .split(' ')
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </span>
                    <div className="leading-tight">
                      <p className="max-w-[10rem] truncate text-sm font-medium text-foreground">{currentUser.name}</p>
                      <p className="whitespace-nowrap text-[11px] text-muted-foreground">{roleName}</p>
                    </div>
                  </div>

                  <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={logout} title="Logout">
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className={cn('mx-auto w-full', fullWidth ? 'max-w-full' : 'max-w-7xl')}>
              {hasPermission(currentPage.permission) ? (
                children
              ) : (
                <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-10 text-center">
                  <Lock className="h-8 w-8 text-muted-foreground" />
                  <p className="text-lg font-semibold">Access restricted</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Your role ({roleName}) doesn&apos;t have permission to view {currentPage.label}. Contact an
                    administrator if you need access.
                  </p>
                </div>
              )}
            </div>
          </main>

          <footer className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-6 lg:px-8">
            <p>{data?.settings.companyName ?? 'ERP'} · {data?.settings.timezone ?? 'Asia/Dhaka'}</p>
          </footer>
        </div>
      </div>
    </div>
  )
}


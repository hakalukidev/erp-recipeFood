"use client"

import { useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Landmark,
  Package,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Target,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'

import { AdminShell } from './AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useERP } from '@/lib/erp/provider'
import { Textarea } from '@/components/ui/textarea'
import { buildBusinessAlerts, buildManagingDirectorExtras } from '@/lib/erp/dashboards'
import {
  buildCategoryRevenue,
  buildDashboardSnapshot,
  buildPaymentStatusCounts,
  buildRevenueSeries,
  formatCurrency,
  notificationToneClass,
  RevenueRange,
  toArray,
} from '@/lib/erp/utils'

// Lazy-loaded so recharts (and its own dependencies) never ships in the
// Dashboard's initial bundle — the Dashboard is the first page nearly every
// session loads, so this is the single highest-value code-split in the app.
// ssr: false because recharts measures the DOM (ResizeObserver) and has no
// useful server-rendered output anyway.
const DashboardCharts = dynamic(() => import('./DashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="grid gap-6">
      {[0, 1].map((row) => (
        <div key={row} className="grid gap-6 xl:grid-cols-2">
          <div className="h-72 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
          <div className="h-72 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
        </div>
      ))}
    </div>
  ),
})

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: 'hsl(var(--chart-1))',
  ready: 'hsl(var(--chart-5))',
  shipped: 'hsl(var(--chart-4))',
  completed: 'hsl(var(--chart-2))',
  hold: 'hsl(var(--chart-3))',
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  paid: 'hsl(var(--chart-2))',
  partial: 'hsl(var(--chart-5))',
  unpaid: 'hsl(var(--chart-3))',
}

function getKpiValueFontSize(value: string | number) {
  const characterCount = String(value).length

  return `${Math.max(8, Math.min(18, 160 / characterCount))}px`
}

export function DashboardScreen() {
  const { data, loading, error, currentUser, saveInvestor, hasPermission } = useERP()
  const snapshot = buildDashboardSnapshot(data, currentUser?.roleId)
  const overduePayments = toArray(data?.orders).filter(
    (order) => order.due > 0 && new Date(order.paymentDueDate).getTime() < Date.now()
  ).length
  // Section 55 — Managing Director Dashboard: the rest of the bullet list
  // (finance/target figures) beyond what buildDashboardSnapshot
  // already covers, shown only to roles that can see finance data.
  const canViewExecutiveOverview = hasPermission('finance:view')
  const mdExtras = useMemo(() => buildManagingDirectorExtras(data), [data])
  // Section 61 — Real-time Business Intelligence: Critical/Warning/Normal
  // alerts for the Management Dashboard.
  const businessAlerts = useMemo(() => buildBusinessAlerts(data), [data])
  const totalAlertCount = businessAlerts.critical.length + businessAlerts.warning.length + businessAlerts.normal.length

  const [revenueRange, setRevenueRange] = useState<RevenueRange>('6m')
  const [investorOpen, setInvestorOpen] = useState(false)
  const [investorForm, setInvestorForm] = useState({ name: '', location: '', mobile: '', products: '', amount: '', note: '' })
  const [investorFeedback, setInvestorFeedback] = useState<string | null>(null)
  const [productQuery, setProductQuery] = useState('')
  const [salesRange, setSalesRange] = useState<'today' | 'week' | 'month' | 'year'>('today')
  const revenueSeries = useMemo(() => buildRevenueSeries(data, revenueRange), [data, revenueRange])
  const categoryRevenue = useMemo(() => buildCategoryRevenue(data, revenueRange), [data, revenueRange])
  const investors = useMemo(() => toArray(data?.investors).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data?.investors])
  const productSales = useMemo(() => {
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    if (salesRange === 'week') start.setDate(start.getDate() - 6)
    if (salesRange === 'month') start.setMonth(start.getMonth() - 1)
    if (salesRange === 'year') start.setFullYear(start.getFullYear() - 1)
    const query = productQuery.trim().toLowerCase()

    return toArray(data?.orders).flatMap((order) => {
      if (new Date(order.createdAt) < start) return []
      return order.items
        .filter((item) => !query || item.productName.toLowerCase().includes(query))
        .map((item) => ({
          key: `${order.id}-${item.productId}`,
          date: order.createdAt,
          productName: item.productName,
          quantity: item.quantity,
          amount: item.quantity * item.unitPrice,
          customerName: order.customerName,
          billNumber: order.billNumber,
        }))
    }).sort((a, b) => b.date.localeCompare(a.date))
  }, [data?.orders, productQuery, salesRange])
  const productSalesQuantity = productSales.reduce((sum, row) => sum + row.quantity, 0)
  const productSalesAmount = productSales.reduce((sum, row) => sum + row.amount, 0)

  async function handleInvestorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setInvestorFeedback(null)
    try {
      await saveInvestor({ ...investorForm, amount: Number(investorForm.amount) })
      setInvestorForm({ name: '', location: '', mobile: '', products: '', amount: '', note: '' })
      setInvestorOpen(false)
      setInvestorFeedback('Investor added successfully.')
    } catch (reason) {
      setInvestorFeedback(reason instanceof Error ? reason.message : 'Unable to save investor.')
    }
  }
  const paymentStatusData = Object.entries(buildPaymentStatusCounts(data)).map(([status, total]) => ({
    status: status.charAt(0).toUpperCase() + status.slice(1),
    total,
    color: PAYMENT_STATUS_COLORS[status] ?? 'hsl(var(--chart-1))',
  }))

  const orderStatusData = Object.entries(snapshot.orderStatusCounts).map(([status, total]) => ({
    status: status.charAt(0).toUpperCase() + status.slice(1),
    total,
    color: ORDER_STATUS_COLORS[status] ?? 'hsl(var(--chart-1))',
  }))

  const kpis = [
    { key: 'todaySales', label: "Today's sales", icon: Wallet, value: formatCurrency(snapshot.metrics.todaySales, data?.settings.currency), tone: 'chart-1' },
    { key: 'todayProfit', label: "Today's profit", icon: TrendingUp, value: formatCurrency(snapshot.metrics.todayProfit, data?.settings.currency), tone: 'chart-2' },
    { key: 'todaysOrders', label: "Today's orders", icon: ShoppingCart, value: snapshot.metrics.todaysOrders, tone: 'chart-4' },
    { key: 'pendingDelivery', label: 'Pending deliveries', icon: Package, value: snapshot.metrics.pendingDelivery, tone: 'chart-5' },
    { key: 'overduePayments', label: 'Overdue payments', icon: AlertTriangle, value: overduePayments, tone: 'destructive' },
    { key: 'lowStockCount', label: 'Low stock items', icon: AlertTriangle, value: snapshot.metrics.lowStockCount, tone: 'chart-3' },
  ] as const

  return (
    <AdminShell active="Dashboard">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setInvestorOpen(true)} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" /> Add investor
          </Button>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href="/admin/stock/overview">Add inventory</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href="/admin/sales">Open sales</Link>
          </Button>
        </div>

        {error ? (
          <Card className="border-rose-200 bg-rose-500/5">
            <CardContent className="p-5 text-sm text-rose-700 dark:text-rose-300">{error}</CardContent>
          </Card>
        ) : null}

        {investorFeedback ? (
          <Card className="border-border/70 bg-primary/5"><CardContent className="p-4 text-sm text-primary">{investorFeedback}</CardContent></Card>
        ) : null}

        {loading ? (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-6 text-sm text-muted-foreground">Loading realtime dashboard data...</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {kpis.map((item) => {
            const Icon = item.icon

            return (
              <Card
                key={item.key}
                className="overflow-hidden border-border/70 shadow-sm transition-transform hover:-translate-y-0.5"
                style={{ borderTopWidth: 3, borderTopColor: `hsl(var(--${item.tone}))` }}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `hsl(var(--${item.tone}) / 0.15)`, color: `hsl(var(--${item.tone}))` }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p
                      className="mt-1 max-w-full break-words font-semibold leading-tight tracking-tight"
                      style={{ fontSize: getKpiValueFontSize(item.value), overflowWrap: 'anywhere' }}
                    >
                      {item.value}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Section 61: Real-time Business Intelligence — Critical/Warning/Normal alerts, gated on finance:view like the executive overview below. */}
        {canViewExecutiveOverview && totalAlertCount > 0 ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Real-time alerts</CardTitle>
              <CardDescription>Business-critical conditions across stock, credit, cash, and targets, refreshed live.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              {(
                [
                  { key: 'critical', label: 'Critical', items: businessAlerts.critical, tone: 'destructive' as const },
                  { key: 'warning', label: 'Warning', items: businessAlerts.warning, tone: 'chart-3' as const },
                  { key: 'normal', label: 'Normal', items: businessAlerts.normal, tone: 'chart-2' as const },
                ] as const
              ).map((group) => (
                <div key={group.key} className="space-y-3 rounded-2xl border border-border/70 p-4">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `hsl(var(--${group.tone}))` }} />
                      {group.label}
                    </p>
                    <Badge variant="outline" className="rounded-full">{group.items.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {group.items.length ? (
                      group.items.map((alert) => (
                        <div key={alert.id} className="rounded-xl bg-muted/30 p-3">
                          <p className="text-sm font-medium">{alert.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{alert.message}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">Nothing to report.</p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* Section 55: Managing Director Dashboard — executive figures, gated on finance:view. */}
        {canViewExecutiveOverview ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Executive overview</CardTitle>
              <CardDescription>Sales, finance and target figures for this month.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
                {[
                  { label: 'Monthly sales', value: formatCurrency(mdExtras.monthlySales, data?.settings.currency), icon: TrendingUp },
                  { label: 'Yearly sales', value: formatCurrency(mdExtras.yearlySales, data?.settings.currency), icon: TrendingUp },
                  { label: 'Collection', value: formatCurrency(mdExtras.collection, data?.settings.currency), icon: Wallet },
                  { label: 'Outstanding', value: formatCurrency(mdExtras.outstanding, data?.settings.currency), icon: AlertTriangle },
                  { label: 'Purchase', value: formatCurrency(mdExtras.purchase, data?.settings.currency), icon: ShoppingCart },
                  { label: 'Inventory value', value: formatCurrency(mdExtras.inventoryValue, data?.settings.currency), icon: Package },
                  { label: 'Gross profit', value: formatCurrency(mdExtras.grossProfit, data?.settings.currency), icon: TrendingUp },
                  { label: 'Net profit', value: formatCurrency(mdExtras.netProfit, data?.settings.currency), icon: mdExtras.netProfit >= 0 ? TrendingUp : TrendingDown },
                  { label: 'Expense', value: formatCurrency(mdExtras.expense, data?.settings.currency), icon: ReceiptText },
                  { label: 'Cash', value: formatCurrency(mdExtras.cash, data?.settings.currency), icon: Banknote },
                  { label: 'Bank', value: formatCurrency(mdExtras.bank, data?.settings.currency), icon: Landmark },
                  { label: 'Receivable', value: formatCurrency(mdExtras.receivable, data?.settings.currency), icon: Users },
                  { label: 'Payable', value: formatCurrency(mdExtras.payable, data?.settings.currency), icon: Truck },
                ].map((stat) => {
                  const Icon = stat.icon
                  return (
                    <div key={stat.label} className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card px-4 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{stat.label}</span></div>
                      <p className="mt-1 truncate font-semibold tracking-tight" style={{ fontSize: getKpiValueFontSize(stat.value) }}>{stat.value}</p>
                    </div>
                  )
                })}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Target className="h-4 w-4" /> Sales target vs achievement (this month)</div>
                  <p className="mt-2 text-xl font-semibold">
                    {formatCurrency(mdExtras.monthlySales, data?.settings.currency)} / {formatCurrency(mdExtras.salesTarget, data?.settings.currency)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{mdExtras.salesTarget > 0 ? `${mdExtras.achievementPercent.toFixed(1)}% achieved` : 'No sales target set for this month.'}</p>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-medium text-foreground">Top customers</p>
                  <div className="space-y-2">
                    {mdExtras.topCustomers.length ? mdExtras.topCustomers.map((customer) => (
                      <div key={customer.id} className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                        <p className="font-medium">{customer.name}</p>
                        <p className="font-semibold">{formatCurrency(customer.totalSpend, data?.settings.currency)}</p>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">No customer sales recorded yet.</p>}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-foreground">Near expiry stock</p>
                  <div className="space-y-2">
                    {mdExtras.nearExpiryBatches.length ? mdExtras.nearExpiryBatches.slice(0, 5).map((batch) => (
                      <div key={batch.id} className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                        <div><p className="font-medium">{batch.productName}</p><p className="text-xs text-muted-foreground">Batch {batch.batchNumber} · Qty {batch.quantity}</p></div>
                        <p className="text-sm text-amber-600 dark:text-amber-400">{new Date(batch.expiryDate).toLocaleDateString('en-BD')}</p>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">Nothing expiring within 30 days.</p>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1.85fr]">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Investors</CardTitle>
                <CardDescription>Name, contact, products and invested amount.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => setInvestorOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Add</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {investors.length ? investors.slice(0, 5).map((investor) => (
                <div key={investor.id} className="rounded-xl border border-border/70 p-3">
                  <div className="flex justify-between gap-3">
                    <div><p className="font-semibold">{investor.name}</p><p className="text-xs text-muted-foreground">{investor.mobile} · {investor.location || 'No location'}</p></div>
                    <p className="font-semibold">{formatCurrency(investor.amount, data?.settings.currency)}</p>
                  </div>
                  <p className="mt-2 text-sm">Products: {investor.products || 'N/A'}</p>
                  {investor.note ? <p className="mt-1 text-xs text-muted-foreground">{investor.note}</p> : null}
                </div>
              )) : <p className="text-sm text-muted-foreground">No investors added yet.</p>}
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Product sales lookup</CardTitle>
              <CardDescription>Search a product to see quantity, sales amount and customers for the selected period.</CardDescription>
              <div className="grid gap-3 pt-2 sm:grid-cols-[1fr_160px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} className="pl-9" placeholder="Search product name" />
                </div>
                <Select value={salesRange} onValueChange={(value) => setSalesRange(value as typeof salesRange)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">Last 7 days</SelectItem>
                    <SelectItem value="month">Last month</SelectItem>
                    <SelectItem value="year">Last year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Quantity sold</p><p className="mt-1 text-xl font-semibold">{productSalesQuantity}</p></div>
                <div className="rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Sales amount</p><p className="mt-1 text-xl font-semibold">{formatCurrency(productSalesAmount, data?.settings.currency)}</p></div>
              </div>
              <div className="max-h-72 overflow-auto rounded-xl border border-border/70">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted"><tr><th className="p-3 text-left">Date</th><th className="p-3 text-left">Product</th><th className="p-3 text-left">Customer</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Amount</th></tr></thead>
                  <tbody>{productSales.map((row) => <tr key={row.key} className="border-t border-border/70"><td className="p-3">{new Date(row.date).toLocaleDateString('en-BD')}</td><td className="p-3 font-medium">{row.productName}<span className="block text-xs font-normal text-muted-foreground">{row.billNumber}</span></td><td className="p-3">{row.customerName}</td><td className="p-3 text-right">{row.quantity}</td><td className="p-3 text-right">{formatCurrency(row.amount, data?.settings.currency)}</td></tr>)}</tbody>
                </table>
                {!productSales.length ? <p className="p-6 text-center text-sm text-muted-foreground">No matching sales found.</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <DashboardCharts
          revenueSeries={revenueSeries}
          categoryRevenue={categoryRevenue}
          orderStatusData={orderStatusData}
          paymentStatusData={paymentStatusData}
          revenueRange={revenueRange}
          onRevenueRangeChange={setRevenueRange}
          currency={data?.settings.currency}
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Top selling products</CardTitle>
              <CardDescription>Products with the strongest sales contribution so far.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {snapshot.topProducts.length ? (
                snapshot.topProducts.map((product) => (
                  <div key={product.id} className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{product.name}</p>
                        <p className="text-sm text-muted-foreground">{product.sold} sold · {product.stockQty} in stock</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(product.revenue, data?.settings.currency)}</p>
                        <p className="text-sm text-muted-foreground">Revenue</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No sales recorded yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Low stock items</CardTitle>
              <CardDescription>Products that need replenishment soon.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot.lowStock.length ? (
                snapshot.lowStock.slice(0, 5).map((product) => (
                  <div key={product.id} className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/30 p-4">
                    <div>
                      <p className="font-semibold">{product.name}</p>
                      <p className="text-sm text-muted-foreground">Minimum {product.minStock} · Available {product.stockQty}</p>
                    </div>
                    <Button asChild variant="outline" className="rounded-full">
                      <Link href="/admin/stock/overview">
                        Restock
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No low stock products right now.</p>
              )}
            </CardContent>
          </Card>
        </div>

    
      </div>

      <Dialog open={investorOpen} onOpenChange={setInvestorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add investor</DialogTitle><DialogDescription>Record investor contact, products, amount and notes.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={handleInvestorSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><p className="text-sm font-medium">Investor name<span className="text-rose-500">*</span></p><Input value={investorForm.name} onChange={(event) => setInvestorForm((current) => ({ ...current, name: event.target.value }))} required /></div>
              <div className="space-y-2"><p className="text-sm font-medium">Mobile<span className="text-rose-500">*</span></p><Input value={investorForm.mobile} onChange={(event) => setInvestorForm((current) => ({ ...current, mobile: event.target.value }))} required /></div>
              <div className="space-y-2"><p className="text-sm font-medium">Location</p><Input value={investorForm.location} onChange={(event) => setInvestorForm((current) => ({ ...current, location: event.target.value }))} /></div>
              <div className="space-y-2"><p className="text-sm font-medium">Amount ({data?.settings.currency ?? 'BDT'})<span className="text-rose-500">*</span></p><Input type="number" min="0.01" step="0.01" value={investorForm.amount} onChange={(event) => setInvestorForm((current) => ({ ...current, amount: event.target.value }))} required /></div>
              <div className="space-y-2 sm:col-span-2"><p className="text-sm font-medium">Products</p><Input value={investorForm.products} onChange={(event) => setInvestorForm((current) => ({ ...current, products: event.target.value }))} placeholder="Product names or categories" /></div>
              <div className="space-y-2 sm:col-span-2"><p className="text-sm font-medium">Note</p><Textarea value={investorForm.note} onChange={(event) => setInvestorForm((current) => ({ ...current, note: event.target.value }))} rows={3} /></div>
            </div>
            <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setInvestorOpen(false)}>Cancel</Button><Button type="submit">Save investor</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

"use client"

import { useMemo } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Package,
  PiggyBank,
  Plus,
  ReceiptText,
  TrendingUp,
  Users,
} from 'lucide-react'

import { AdminShell } from './AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import { buildCompanyEarningsSummary, buildOperationsOverview, formatCurrency, formatDate } from '@/lib/erp/utils'

// Lazy-loaded so recharts never ships in the Dashboard's initial bundle — the
// Dashboard is the first page nearly every session loads, so this is the
// single highest-value code-split in the app. Reuses the same chart the
// Company Earnings page renders, just fed a shorter window here.
const CompanyEarningsChart = dynamic(() => import('./CompanyEarningsChart'), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />,
})

function getKpiValueFontSize(value: string | number) {
  const characterCount = String(value).length
  return `${Math.max(8, Math.min(18, 160 / characterCount))}px`
}

function netToneClass(value: number) {
  return value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
}

const QUICK_ACTIONS = [
  { label: 'New rate card', href: '/admin/rate-card', icon: Calculator },
  { label: 'Add expense', href: '/admin/finance', icon: ReceiptText },
  { label: 'Add dealer', href: '/admin/dealers', icon: Users },
  { label: 'Add product', href: '/admin/stock/overview', icon: Package },
] as const

export function DashboardScreen() {
  const { data, loading, error } = useERP()
  const overview = useMemo(() => buildOperationsOverview(data), [data])
  const earnings = useMemo(() => buildCompanyEarningsSummary(data), [data])
  const currency = data?.settings.currency

  const kpis = [
    { key: 'products', label: 'Products', icon: Package, value: overview.counts.products, tone: 'chart-1' },
    { key: 'dealers', label: 'Dealers', icon: Users, value: overview.counts.dealers, tone: 'chart-4' },
    { key: 'rateCards', label: 'Rate cards', icon: Calculator, value: overview.counts.rateCards, tone: 'chart-5' },
    { key: 'lowStock', label: 'Low stock items', icon: AlertTriangle, value: overview.counts.lowStock, tone: 'chart-3' },
    { key: 'earning', label: 'Total earning', icon: TrendingUp, value: formatCurrency(earnings.totalEarning, currency), tone: 'chart-2' },
    {
      key: 'netProfit',
      label: 'Net profit',
      icon: PiggyBank,
      value: formatCurrency(earnings.netProfit, currency),
      tone: earnings.netProfit >= 0 ? 'chart-2' : 'destructive',
    },
  ] as const

  return (
    <AdminShell active="Dashboard">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <Button key={action.label} asChild variant="outline" className="rounded-xl">
                <Link href={action.href}>
                  <Icon className="mr-2 h-4 w-4" /> {action.label}
                </Link>
              </Button>
            )
          })}
        </div>

        {error ? (
          <Card className="border-rose-200 bg-rose-500/5">
            <CardContent className="p-5 text-sm text-rose-700 dark:text-rose-300">{error}</CardContent>
          </Card>
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

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Company earnings</CardTitle>
              <CardDescription>Depot-sale profit (Usable money) against expenses, last 6 months.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="rounded-xl">
              <Link href="/admin/earnings">
                Full report <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Total earning</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(earnings.totalEarning, currency)}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Total expenses</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(earnings.totalExpense, currency)}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Net profit</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${netToneClass(earnings.netProfit)}`}>
                  {formatCurrency(earnings.netProfit, currency)}
                </p>
              </div>
            </div>
            <CompanyEarningsChart title="Monthly earning vs expense" data={earnings.monthly} xKey="month" currency={currency} bare />
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Recent rate cards</CardTitle>
                <CardDescription>Latest costing sheets, most recent first.</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/rate-card">
                  View all <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {overview.recentRateCards.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Dealer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Goods amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.recentRateCards.map((card) => (
                        <TableRow key={card.id}>
                          <TableCell className="font-medium">{card.invoiceNo}</TableCell>
                          <TableCell>{card.recipientName}</TableCell>
                          <TableCell>{formatDate(card.date)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(card.dealerRateTotal, currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No rate cards created yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Recent expenses</CardTitle>
                <CardDescription>Latest recorded running costs.</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/finance">
                  View all <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {overview.recentExpenses.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview.recentExpenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>{formatDate(expense.date)}</TableCell>
                          <TableCell className="font-medium">{expense.category}</TableCell>
                          <TableCell className="capitalize text-muted-foreground">{expense.approvalStatus}</TableCell>
                          <TableCell className="text-right">{formatCurrency(expense.amount, currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Top dealers</CardTitle>
            <CardDescription>Highest Rate Card sales value (Goods Amount), all time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.topDealers.length ? (
              overview.topDealers.map((dealer) => (
                <div key={dealer.name} className="flex items-center justify-between rounded-xl border border-border/70 p-3">
                  <p className="font-medium">{dealer.name}</p>
                  <p className="font-semibold">{formatCurrency(dealer.total, currency)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No dealer sales recorded yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Top selling products</CardTitle>
            <CardDescription>By Rate Card sales value (pieces × Dealer rate), all time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {overview.topProducts.length ? (
              overview.topProducts.map((product) => (
                <div key={product.name} className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{product.name}</p>
                      <p className="text-sm text-muted-foreground">{product.qty.toLocaleString('en-BD')} pieces sold</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(product.revenue, currency)}</p>
                      <p className="text-sm text-muted-foreground">Revenue</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No rate card sales recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}

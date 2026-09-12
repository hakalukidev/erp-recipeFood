"use client"

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Percent, PiggyBank, ReceiptText, TrendingUp, Undo2 } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import { buildCompanyEarningsSummary, formatCurrency } from '@/lib/erp/utils'

// Lazy-loaded so recharts never ships in this page's initial bundle — same
// component (and the same reasoning) as the chart embedded on the Dashboard.
const CompanyEarningsChart = dynamic(() => import('./CompanyEarningsChart'), {
  ssr: false,
  loading: () => <div className="h-80 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />,
})

function netToneClass(value: number) {
  return value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
}

export function CompanyEarningsScreen() {
  const { data } = useERP()
  const summary = useMemo(() => buildCompanyEarningsSummary(data), [data])
  const currency = data?.settings.currency

  return (
    <AdminShell active="Company Earnings">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Total earning</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(summary.totalEarning, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Company margin from Depot-sale rate cards, net of returns</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Undo2 className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Product returns</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(summary.totalReturns, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Company profit given back on returned goods</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <ReceiptText className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Total expenses</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(summary.totalExpense, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">All recorded expenses (excluding rejected)</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <PiggyBank className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Net profit</p>
                <p className={`mt-1 text-2xl font-semibold tracking-tight ${netToneClass(summary.netProfit)}`}>
                  {formatCurrency(summary.netProfit, currency)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Earning minus expenses</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Percent className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Avg profit ratio</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{summary.avgProfitRatioPercent.toFixed(2)}%</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Total profit ÷ total dealer value sales ({formatCurrency(summary.totalDealerValueSales, currency)})
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <CompanyEarningsChart
          title="Monthly earning vs expense"
          description="Depot-sale profit (Usable money) against recorded expenses, by month."
          data={summary.monthly}
          xKey="month"
          currency={currency}
        />

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Monthly breakdown</CardTitle>
            <CardDescription>Same figures as the chart above, month by month.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Earning</TableHead>
                    <TableHead className="text-right">Expense</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.monthly.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.earning, currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.expense, currency)}</TableCell>
                      <TableCell className={`text-right font-semibold ${netToneClass(row.net)}`}>
                        {formatCurrency(row.net, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <CompanyEarningsChart
          title="Yearly earning vs expense"
          description="Same as above, rolled up by calendar year — the company's full history."
          data={summary.yearly}
          xKey="year"
          currency={currency}
        />

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Yearly breakdown</CardTitle>
            <CardDescription>Every year with a rate card or expense on record.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead className="text-right">Earning</TableHead>
                    <TableHead className="text-right">Expense</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.yearly.map((row) => (
                    <TableRow key={row.year}>
                      <TableCell className="font-medium">{row.year}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.earning, currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.expense, currency)}</TableCell>
                      <TableCell className={`text-right font-semibold ${netToneClass(row.net)}`}>
                        {formatCurrency(row.net, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}

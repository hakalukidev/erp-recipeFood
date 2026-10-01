"use client"

import { Fragment, useMemo, type ReactNode } from 'react'
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

// Icon sits beside the label (not the value) so the amount gets the card's
// full width — long BDT figures with 3 decimals overflowed the 5-column row.
function StatCard({
  icon,
  iconClassName,
  label,
  value,
  valueClassName = '',
  hint,
}: {
  icon: ReactNode
  iconClassName: string
  label: string
  value: string
  valueClassName?: string
  hint: string
}) {
  return (
    <Card className="min-w-0 border-border/70 shadow-sm">
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center gap-2">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}>{icon}</span>
          <p className="truncate text-sm text-muted-foreground">{label}</p>
        </div>
        {/* Never truncate or split the amount mid-number: the currency code
            and the number are separate no-wrap pieces, so on a cramped card
            the number drops below "BDT" instead of breaking between digits.
            The leading "-" becomes a real minus sign (U+2212). */}
        <p className={`text-xl font-semibold tabular-nums tracking-tight xl:text-lg 2xl:text-2xl ${valueClassName}`}>
          {value
            .replace(/^-/, '\u2212')
            .split(' ')
            .map((part, index) => (
              <Fragment key={index}>
                {index > 0 ? ' ' : null}
                <span className="whitespace-nowrap">{part}</span>
              </Fragment>
            ))}
        </p>
        <p className="break-words text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

export function CompanyEarningsScreen() {
  const { data } = useERP()
  const summary = useMemo(() => buildCompanyEarningsSummary(data), [data])
  const currency = data?.settings.currency

  return (
    <AdminShell active="Company Earnings">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            iconClassName="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            label="Total earning"
            value={formatCurrency(summary.totalEarning, currency)}
            hint="Company margin from Depot-sale rate cards, net of returns"
          />
          <StatCard
            icon={<Undo2 className="h-4 w-4" />}
            iconClassName="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            label="Product returns"
            value={formatCurrency(summary.totalReturns, currency)}
            hint="Company profit given back on returned goods"
          />
          <StatCard
            icon={<ReceiptText className="h-4 w-4" />}
            iconClassName="bg-destructive/10 text-destructive"
            label="Total expenses"
            value={formatCurrency(summary.totalExpense, currency)}
            hint="All recorded expenses (excluding rejected)"
          />
          <StatCard
            icon={<PiggyBank className="h-4 w-4" />}
            iconClassName="bg-primary/10 text-primary"
            label="Net profit"
            value={formatCurrency(summary.netProfit, currency)}
            valueClassName={netToneClass(summary.netProfit)}
            hint="Earning minus expenses"
          />
          <StatCard
            icon={<Percent className="h-4 w-4" />}
            iconClassName="bg-sky-500/10 text-sky-600 dark:text-sky-400"
            label="Avg profit ratio"
            value={`${summary.avgProfitRatioPercent.toFixed(2)}%`}
            hint={`Total profit ÷ total dealer value sales (${formatCurrency(summary.totalDealerValueSales, currency)})`}
          />
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

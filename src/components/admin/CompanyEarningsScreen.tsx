"use client"

import { Fragment, useMemo, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { CalendarDays, Percent, PiggyBank, ReceiptText, TrendingUp, Undo2 } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import { buildCompanyEarningsForPeriod, buildCompanyEarningsSummary, dhakaTodayIso, formatCurrency, formatDate } from '@/lib/erp/utils'

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

  // Period selector (2026-10-04 client request): the stat cards and the
  // day-wise table follow it; the charts/monthly/yearly tables below stay
  // full history. Empty month/day input falls back to All time.
  const [mode, setMode] = useState<'monthly' | 'daily' | 'all'>('monthly')
  const [month, setMonth] = useState(() => dhakaTodayIso().slice(0, 7))
  const [day, setDay] = useState(() => dhakaTodayIso())
  const period = useMemo(() => {
    if (mode === 'monthly' && month) {
      const [year, monthIndex] = month.split('-').map(Number)
      const lastDay = new Date(year, monthIndex, 0).getDate()
      return {
        from: `${month}-01`,
        to: `${month}-${String(lastDay).padStart(2, '0')}`,
        label: new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      }
    }
    if (mode === 'daily' && day) return { from: day, to: day, label: formatDate(day) }
    return { from: '', to: '', label: 'All time' }
  }, [mode, month, day])
  const periodSummary = useMemo(() => buildCompanyEarningsForPeriod(data, period.from, period.to), [data, period])

  return (
    <AdminShell active="Company Earnings">
      <div className="space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Period:</span>
              <span className="text-muted-foreground">{period.label}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
              {mode === 'monthly' ? (
                <Input className="w-full sm:w-44" type="month" value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Month" />
              ) : null}
              {mode === 'daily' ? (
                <Input className="w-full sm:w-44" type="date" value={day} onChange={(event) => setDay(event.target.value)} aria-label="Day" />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            iconClassName="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            label="Total earning"
            value={formatCurrency(periodSummary.totalEarning, currency)}
            hint={`${period.label} · ${periodSummary.invoiceCount} invoice(s), ${formatCurrency(periodSummary.grossEarning, currency)} margin before returns`}
          />
          <StatCard
            icon={<Undo2 className="h-4 w-4" />}
            iconClassName="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            label="Product returns"
            value={formatCurrency(periodSummary.totalReturns, currency)}
            hint={`${period.label} · ${periodSummary.returnCount} return(s) — company profit given back`}
          />
          <StatCard
            icon={<ReceiptText className="h-4 w-4" />}
            iconClassName="bg-destructive/10 text-destructive"
            label="Total expenses"
            value={formatCurrency(periodSummary.totalExpense, currency)}
            hint={`${period.label} · ${periodSummary.expenseCount} entries (excluding rejected)`}
          />
          <StatCard
            icon={<PiggyBank className="h-4 w-4" />}
            iconClassName="bg-primary/10 text-primary"
            label="Net profit"
            value={formatCurrency(periodSummary.netProfit, currency)}
            valueClassName={netToneClass(periodSummary.netProfit)}
            hint={`${period.label} · earning minus expenses`}
          />
          <StatCard
            icon={<Percent className="h-4 w-4" />}
            iconClassName="bg-sky-500/10 text-sky-600 dark:text-sky-400"
            label="Avg profit ratio"
            value={`${periodSummary.avgProfitRatioPercent.toFixed(2)}%`}
            hint={`Profit ÷ dealer value sales (${formatCurrency(periodSummary.totalDealerValueSales, currency)}) · ${period.label}`}
          />
        </div>

        {mode !== 'daily' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Day-wise breakdown — {period.label}</CardTitle>
              <CardDescription>Every day with an invoice, product return or expense in the selected period, newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[480px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Earning</TableHead>
                      <TableHead className="text-right">Returns</TableHead>
                      <TableHead className="text-right">Expense</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periodSummary.daily.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell className="font-medium">{formatDate(row.date)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.earning, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.returns, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.expense, currency)}</TableCell>
                        <TableCell className={`text-right font-semibold tabular-nums ${netToneClass(row.net)}`}>
                          {formatCurrency(row.net, currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {periodSummary.daily.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                          No invoices, returns or expenses in {period.label}.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                  {periodSummary.daily.length > 0 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">Total</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(periodSummary.grossEarning, currency)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(periodSummary.totalReturns, currency)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(periodSummary.totalExpense, currency)}</TableCell>
                        <TableCell className={`text-right font-semibold tabular-nums ${netToneClass(periodSummary.netProfit)}`}>
                          {formatCurrency(periodSummary.netProfit, currency)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}

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

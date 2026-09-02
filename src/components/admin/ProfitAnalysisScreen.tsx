"use client"

import { useMemo, useState } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import { buildProfitAnalysis, type ProfitAnalysisDimension } from '@/lib/erp/dashboards'
import { formatCurrency } from '@/lib/erp/utils'

// Section 60 — Profit Analysis: Product Sales - COGS = Gross Profit, sliced
// Company/Product/Product Category/Customer/Dealer/Territory/Sales
// Officer/Invoice-wise (see buildProfitAnalysis in lib/erp/dashboards.ts).
const DIMENSIONS: Array<{ id: ProfitAnalysisDimension; label: string; column: string }> = [
  { id: 'companyWise', label: 'Company-wise', column: 'Company' },
  { id: 'productWise', label: 'Product-wise', column: 'Product' },
  { id: 'categoryWise', label: 'Product Category-wise', column: 'Category' },
  { id: 'customerWise', label: 'Customer-wise', column: 'Customer' },
  { id: 'dealerWise', label: 'Dealer-wise', column: 'Dealer' },
  { id: 'territoryWise', label: 'Territory-wise', column: 'Territory' },
  { id: 'salesOfficerWise', label: 'Sales Officer-wise', column: 'Sales Officer' },
  { id: 'invoiceWise', label: 'Invoice-wise', column: 'Invoice' },
]

export function ProfitAnalysisScreen() {
  const { data, hasPermission } = useERP()
  const currency = data?.settings.currency
  const canView = hasPermission('reports:view')
  const canExport = hasPermission('reports:export')

  const [dimensionId, setDimensionId] = useState<ProfitAnalysisDimension>('productWise')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const dimension = DIMENSIONS.find((entry) => entry.id === dimensionId) ?? DIMENSIONS[0]

  const inPeriod = useMemo(() => {
    return (date: string) => {
      const value = date.slice(0, 10)
      if (dateFrom && value < dateFrom) return false
      if (dateTo && value > dateTo) return false
      return true
    }
  }, [dateFrom, dateTo])

  const analysis = useMemo(() => buildProfitAnalysis(data, inPeriod), [data, inPeriod])
  const rows = analysis[dimensionId]

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({ sales: acc.sales + row.sales, cogs: acc.cogs + row.cogs, grossProfit: acc.grossProfit + row.grossProfit }),
        { sales: 0, cogs: 0, grossProfit: 0 }
      ),
    [rows]
  )
  const marginPercent = totals.sales > 0 ? (totals.grossProfit / totals.sales) * 100 : 0

  function handleExportCsv() {
    const header = [dimension.column, 'Orders', 'Sales', 'COGS', 'Gross Profit', 'Margin %']
    const lines = rows.map((row) =>
      [row.label, row.orders, row.sales.toFixed(2), row.cogs.toFixed(2), row.grossProfit.toFixed(2), row.marginPercent.toFixed(1)]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(',')
    )
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `profit-analysis-${dimension.id}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!canView) {
    return (
      <AdminShell active="Profit Analysis">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Profit analysis</CardTitle>
            <CardDescription>Your role doesn&apos;t have permission to view profit analysis.</CardDescription>
          </CardHeader>
        </Card>
      </AdminShell>
    )
  }

  return (
    <AdminShell active="Profit Analysis">
      <div className="space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <Badge variant="outline" className="rounded-full">Section 60</Badge>
              <CardTitle>Profit analysis</CardTitle>
              <CardDescription>Gross profit (Sales − COGS) sliced by company, product, category, customer, dealer, territory, sales officer, and invoice.</CardDescription>
            </div>
            {canExport ? (
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex h-9 items-center rounded-xl border border-border/70 px-4 text-sm font-medium hover:bg-muted"
              >
                Export CSV
              </button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <Select value={dimensionId} onValueChange={(value) => setDimensionId(value as ProfitAnalysisDimension)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIMENSIONS.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>{entry.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} placeholder="From date" />
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} placeholder="To date" />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">Product sales</p>
                <p className="mt-1 text-xl font-semibold">{formatCurrency(totals.sales, currency)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">COGS</p>
                <p className="mt-1 text-xl font-semibold">{formatCurrency(totals.cogs, currency)}</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {totals.grossProfit >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  Gross profit
                </div>
                <p className={`mt-1 text-xl font-semibold ${totals.grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {formatCurrency(totals.grossProfit, currency)}
                </p>
                <p className="text-xs text-muted-foreground">{marginPercent.toFixed(1)}% margin</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/70">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>{dimension.column}</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                      <TableHead className="text-right">COGS</TableHead>
                      <TableHead className="text-right">Gross Profit</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                          No sales found for this dimension in the selected period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-right">{row.orders}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.sales, currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.cogs, currency)}</TableCell>
                          <TableCell className={`text-right font-medium ${row.grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {formatCurrency(row.grossProfit, currency)}
                          </TableCell>
                          <TableCell className="text-right">{row.marginPercent.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  )
}

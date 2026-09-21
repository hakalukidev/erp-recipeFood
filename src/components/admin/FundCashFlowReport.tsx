"use client"

import { useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, Landmark, PiggyBank, Printer, Undo2 } from 'lucide-react'

import { ExportMenu } from './ExportMenu'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_HELPLINE,
  COMPANY_INVOICE_FOOTER_NOTE,
  COMPANY_NAME,
} from '@/lib/erp/companyInfo'
import { useERP } from '@/lib/erp/provider'
import { buildFundCashFlowReport, formatCurrency, formatDate } from '@/lib/erp/utils'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function openPrintWindow(html: string) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(html)
  printWindow.document.close()
}

function monthStartValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

function todayValue(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function netToneClass(value: number) {
  return value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
}

// The full, single-document printout the client asked for ("পুরো রিপোর্টের
// একটি প্রিন্টআউট নেওয়ার সুবিধা থাকতে হবে") — every section of the report
// screen below, in the same order, under one company letterhead.
function buildFundReportHtml(
  periodLabel: string,
  report: ReturnType<typeof buildFundCashFlowReport>,
  currency: string | undefined
) {
  const row = (label: string, value: string, strong = false) => `
    <tr${strong ? ' class="totals"' : ''}><td>${escapeHtml(label)}</td><td class="numeric">${escapeHtml(value)}</td></tr>
  `

  const categoryRows = report.outflow.byCategory
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.category)}</td>
        <td class="numeric">${item.expenseAmount > 0 ? formatCurrency(item.expenseAmount, currency) : '-'}</td>
        <td class="numeric">${item.cashAmount > 0 ? formatCurrency(item.cashAmount, currency) : '-'}</td>
        <td class="numeric">${formatCurrency(item.total, currency)}</td>
      </tr>
    `
    )
    .join('')

  const vendorRows = report.vendorWise
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.vendorName)}</td>
        <td class="numeric">${item.purchaseCount}</td>
        <td class="numeric">${formatCurrency(item.totalAmount, currency)}</td>
        <td class="numeric">${formatCurrency(item.paid, currency)}</td>
        <td class="numeric">${formatCurrency(item.due, currency)}</td>
      </tr>
    `
    )
    .join('')

  const itemRows = report.itemWise
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.materialName)}</td>
        <td>${escapeHtml(item.category)}</td>
        <td class="numeric">${item.qty.toFixed(2)} ${escapeHtml(item.unit)}</td>
        <td class="numeric">${formatCurrency(item.totalAmount, currency)}</td>
      </tr>
    `
    )
    .join('')

  const productRows = report.productWise
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.productName)}</td>
        <td class="numeric">${item.qty.toFixed(2)}</td>
        <td class="numeric">${formatCurrency(item.totalAmount, currency)}</td>
      </tr>
    `
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Fund / Cash Flow Report</title>
        <style>
          * { box-sizing: border-box; }
          @page { margin: 12mm 16mm; size: A4; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 0; }
          .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; color: #0f766e; }
          .company-meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
          .subtitle { text-align: center; color: #4b5563; font-size: 13px; margin: 10px 0 16px; }
          h2 { font-size: 14px; margin: 20px 0 8px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
          table.doc { border-collapse: collapse; width: 100%; margin-bottom: 8px; }
          table.doc th, table.doc td { border: 1px solid #d1d5db; padding: 5px 7px; font-size: 12.5px; }
          table.doc th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
          .numeric { text-align: right; white-space: nowrap; }
          tr.totals td { font-weight: 700; border-top: 2px solid #111827; background: #fef9c3; }
          .footnote { text-align: center; font-style: italic; font-size: 11.5px; color: #4b5563; margin-top: 16px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <p class="title">${escapeHtml(COMPANY_NAME)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_ADDRESS)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_EMAIL)} &middot; Help Line: ${escapeHtml(COMPANY_HELPLINE)}</p>
        <p class="subtitle">Fund / Cash Flow Report — ${escapeHtml(periodLabel)}</p>

        <h2>Fund Summary</h2>
        <table class="doc">
          <tbody>
            ${row('Opening balance', formatCurrency(report.openingBalance, currency))}
            ${row('Total Inflow (Sales collection + Loan withdrawal + Other cash received)', formatCurrency(report.inflow.total, currency))}
            ${row('Total Outflow (Expenses + Cash Maintenance)', formatCurrency(report.outflow.total, currency))}
            ${row('Closing balance', formatCurrency(report.closingBalance, currency), true)}
          </tbody>
        </table>

        <h2>Inflow breakdown</h2>
        <table class="doc">
          <tbody>
            ${row('Sales collection (cash received from dealers)', formatCurrency(report.inflow.sales, currency))}
            ${row('Loan withdrawal', formatCurrency(report.inflow.loans, currency))}
            ${row('Other cash received (Cash Maintenance)', formatCurrency(report.inflow.other, currency))}
            ${row('Total Inflow', formatCurrency(report.inflow.total, currency), true)}
          </tbody>
        </table>

        <h2>Outflow breakdown — by category</h2>
        <table class="doc">
          <thead><tr><th>Category</th><th>Expense</th><th>Cash Maintenance</th><th>Total</th></tr></thead>
          <tbody>
            ${categoryRows}
            <tr class="totals"><td colspan="3">Total Outflow</td><td class="numeric">${formatCurrency(report.outflow.total, currency)}</td></tr>
          </tbody>
        </table>

        <h2>Product Returns (deducted from earning)</h2>
        <table class="doc">
          <tbody>
            ${row('Returns recorded', String(report.productReturns.count))}
            ${row('Returned goods value (Depot rate)', formatCurrency(report.productReturns.totalReturnedValue, currency))}
            ${row('Company profit deducted', formatCurrency(report.productReturns.totalDeducted, currency), true)}
          </tbody>
        </table>

        <h2>Profit &amp; Loss</h2>
        <table class="doc">
          <tbody>
            ${row('Total earning (net of returns)', formatCurrency(report.profitLoss.totalEarning, currency))}
            ${row('Total expense', formatCurrency(report.profitLoss.totalExpense, currency))}
            ${row('Net profit', formatCurrency(report.profitLoss.netProfit, currency), true)}
          </tbody>
        </table>

        <h2>Vendor-wise purchase breakdown</h2>
        <table class="doc">
          <thead><tr><th>Vendor</th><th>Purchases</th><th>Total</th><th>Paid</th><th>Due</th></tr></thead>
          <tbody>${vendorRows || '<tr><td colspan="5" style="text-align:center;color:#6b7280;">No purchases for this range.</td></tr>'}</tbody>
        </table>

        <h2>Item-wise purchase breakdown (materials)</h2>
        <table class="doc">
          <thead><tr><th>Material</th><th>Category</th><th>Qty</th><th>Total</th></tr></thead>
          <tbody>${itemRows || '<tr><td colspan="4" style="text-align:center;color:#6b7280;">No purchases for this range.</td></tr>'}</tbody>
        </table>

        <h2>Item-wise sales breakdown (products)</h2>
        <table class="doc">
          <thead><tr><th>Product</th><th>Qty (pcs)</th><th>Total (Depot sale rate)</th></tr></thead>
          <tbody>${productRows || '<tr><td colspan="3" style="text-align:center;color:#6b7280;">No sales for this range.</td></tr>'}</tbody>
        </table>

        <p class="footnote">${escapeHtml(COMPANY_INVOICE_FOOTER_NOTE)}</p>
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

// ---- Fund / Cash Flow Report (client request, 2026-09-14) ----------------
// One consolidated screen tying together every inflow source (sales money
// actually collected + loan withdrawal) against every outflow head (Expense
// chart + Cash Maintenance chart — which includes goods/packaging purchases,
// depot rent, loan repayment, depot commission, etc.), the P&L impact of product
// returns, and vendor-wise/item-wise breakdowns underneath — everything the
// Loan & Cash Maintenance, Company Earnings, and Reports Hub pages already
// track individually, but never showed together on one printable page. See
// buildFundCashFlowReport in utils.ts for the underlying numbers.
export function FundCashFlowReport() {
  const { data } = useERP()
  const currency = data?.settings.currency
  const [from, setFrom] = useState(monthStartValue())
  const [to, setTo] = useState(todayValue())

  const report = useMemo(() => buildFundCashFlowReport(data, from, to), [data, from, to])
  const periodLabel = from || to ? `${from ? formatDate(from) : 'Beginning'} to ${to ? formatDate(to) : 'Now'}` : 'All time'

  const categoryHeaders = ['Category', 'Expense', 'Cash Maintenance', 'Total']
  const categoryRows = report.outflow.byCategory.map((row) => [row.category, row.expenseAmount, row.cashAmount, row.total])

  const vendorHeaders = ['Vendor', 'Purchases', 'Total', 'Paid', 'Due']
  const vendorRows = report.vendorWise.map((row) => [row.vendorName, row.purchaseCount, row.totalAmount, row.paid, row.due])

  const itemHeaders = ['Material', 'Category', 'Qty', 'Unit', 'Total']
  const itemRows = report.itemWise.map((row) => [row.materialName, row.category, row.qty, row.unit, row.totalAmount])

  const productHeaders = ['Product', 'Qty (pcs)', 'Total']
  const productRows = report.productWise.map((row) => [row.productName, row.qty, row.totalAmount])

  return (
    <div className="space-y-6">
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-4.5 w-4.5" /> Fund / Cash Flow Report
            </CardTitle>
            <CardDescription>
              Every inflow (sales collection, loan withdrawal, other cash received) against every outflow (expenses, cash maintenance), with
              product returns and P&amp;L netted in — one place, one printout.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" className="w-40" value={from} onChange={(event) => setFrom(event.target.value)} />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" className="w-40" value={to} onChange={(event) => setTo(event.target.value)} />
            {from || to ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom('')
                  setTo('')
                }}
              >
                All time
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => openPrintWindow(buildFundReportHtml(periodLabel, report, currency))}
            >
              <Printer className="mr-2 h-4 w-4" />
              Print full report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Opening balance</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(report.openingBalance, currency)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-emerald-500/5 p-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-600" /> Total Inflow
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(report.inflow.total, currency)}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-destructive/5 p-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowDownCircle className="h-3.5 w-3.5 text-destructive" /> Total Outflow
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-destructive">{formatCurrency(report.outflow.total, currency)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-primary/5 p-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <PiggyBank className="h-3.5 w-3.5 text-primary" /> Closing balance
              </p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${netToneClass(report.closingBalance)}`}>
                {formatCurrency(report.closingBalance, currency)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Inflow breakdown</CardTitle>
            <CardDescription>Where the fund's money came from this period.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Sales collection (cash received)</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(report.inflow.sales, currency)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Loan withdrawal</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(report.inflow.loans, currency)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Other cash received (Cash Maintenance)</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(report.inflow.other, currency)}</TableCell>
                </TableRow>
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell>Total Inflow</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(report.inflow.total, currency)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Undo2 className="h-4 w-4" /> Product Returns
            </CardTitle>
            <CardDescription>Deducted from company earning for this period — never a separate cash-out entry.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Returns recorded</TableCell>
                  <TableCell className="text-right tabular-nums">{report.productReturns.count}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Returned goods value (Depot rate)</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(report.productReturns.totalReturnedValue, currency)}</TableCell>
                </TableRow>
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell>Company profit deducted</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(report.productReturns.totalDeducted, currency)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Profit &amp; Loss</CardTitle>
          <CardDescription>Same basis as the Company Earnings page, scoped to this date range.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Total earning (net of returns)</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(report.profitLoss.totalEarning, currency)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Total expense</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(report.profitLoss.totalExpense, currency)}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Net profit</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${netToneClass(report.profitLoss.netProfit)}`}>
                {formatCurrency(report.profitLoss.netProfit, currency)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-base">Outflow — by category</CardTitle>
            <CardDescription>Every sector the fund's money went to this period — Expense and Cash Maintenance combined.</CardDescription>
          </div>
          <ExportMenu filenameBase="fund-outflow-by-category" title="Outflow by category" headers={categoryHeaders} rows={categoryRows} />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Expense</TableHead>
                  <TableHead className="text-right">Cash Maintenance</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.outflow.byCategory.map((row) => (
                  <TableRow key={row.category}>
                    <TableCell className="font-medium">{row.category}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.expenseAmount > 0 ? formatCurrency(row.expenseAmount, currency) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.cashAmount > 0 ? formatCurrency(row.cashAmount, currency) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(row.total, currency)}</TableCell>
                  </TableRow>
                ))}
                {report.outflow.byCategory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                      No outflow for this range.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-base">Vendor-wise purchase breakdown</CardTitle>
            <CardDescription>Every vendor purchased from this period, with paid/due.</CardDescription>
          </div>
          <ExportMenu filenameBase="fund-vendor-wise" title="Vendor-wise purchases" headers={vendorHeaders} rows={vendorRows} />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Purchases</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.vendorWise.map((row) => (
                  <TableRow key={row.vendorId}>
                    <TableCell className="font-medium">{row.vendorName}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.purchaseCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.totalAmount, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.paid, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.due, currency)}</TableCell>
                  </TableRow>
                ))}
                {report.vendorWise.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                      No purchases for this range.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">Item-wise — materials purchased</CardTitle>
              <CardDescription>Raw &amp; packaging material bought this period.</CardDescription>
            </div>
            <ExportMenu filenameBase="fund-item-wise-purchase" title="Item-wise purchases" headers={itemHeaders} rows={itemRows} />
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Material</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.itemWise.map((row) => (
                    <TableRow key={`${row.materialId}:${row.unit}`}>
                      <TableCell className="font-medium">{row.materialName}</TableCell>
                      <TableCell className="text-muted-foreground">{row.category}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.qty.toFixed(2)} {row.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.totalAmount, currency)}</TableCell>
                    </TableRow>
                  ))}
                  {report.itemWise.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                        No purchases for this range.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">Item-wise — products sold</CardTitle>
              <CardDescription>Depot-sale value per product this period.</CardDescription>
            </div>
            <ExportMenu filenameBase="fund-item-wise-sales" title="Item-wise sales" headers={productHeaders} rows={productRows} />
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty (pcs)</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.productWise.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell className="font-medium">{row.productName}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.qty.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.totalAmount, currency)}</TableCell>
                    </TableRow>
                  ))}
                  {report.productWise.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                        No sales for this range.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

"use client"

import { useMemo, useState } from 'react'
import { CalendarDays, FileBarChart, HandCoins, ReceiptText, Search, ShoppingCart, Truck } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { ExportMenu } from './ExportMenu'
import { FundCashFlowReport } from './FundCashFlowReport'
import { SalesReportsContent } from './SalesReportsScreen'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_HELPLINE,
  COMPANY_INVOICE_FOOTER_NOTE,
  COMPANY_NAME,
} from '@/lib/erp/companyInfo'
import { useERP } from '@/lib/erp/provider'
import { computeVendorDue, dhakaTodayIso, expenseCategoryLabel, formatCurrency, formatDate, isCashMaintenanceOut, isCountedEntry, loanTransactionTypeLabel, sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type SectionId = 'fund' | 'sales' | 'expense' | 'purchase' | 'vendor' | 'loan'

const SECTIONS: Array<{ id: SectionId; label: string; description: string }> = [
  { id: 'fund', label: 'Fund / Cash Flow', description: 'Inflow vs outflow, returns, and P&L — one consolidated printable report' },
  { id: 'sales', label: 'Sales', description: 'Dealer/product/category invoice reports' },
  { id: 'expense', label: 'Expense', description: 'Every recorded expense, by date range' },
  { id: 'purchase', label: 'Purchase', description: 'Every procurement transaction, by date range' },
  { id: 'vendor', label: 'Vendor', description: 'Vendor directory and current due' },
  { id: 'loan', label: 'Loan', description: 'Every loan withdrawal/repayment, by date range' },
]

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

// One shared report-print layout for every tab in this hub (Sales keeps its
// own richer voucher-style prints inside SalesReportsContent) — a plain
// column/row table under the company letterhead, same family as
// buildExpenseReportHtml in app/admin/finance/page.tsx.
function buildGenericReportHtml(title: string, headers: string[], rows: (string | number)[][], totalsRow?: (string | number)[]) {
  const headerRow = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')
  const bodyRows = rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, index) => `<td class="${typeof cell === 'number' && index > 0 ? 'numeric' : ''}">${escapeHtml(String(cell))}</td>`)
          .join('')}</tr>`
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          @page { margin: 12mm 16mm; size: A4; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 0; }
          .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; color: #0f766e; }
          .company-meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
          .subtitle { text-align: center; color: #4b5563; font-size: 13px; margin: 10px 0 16px; }
          table.doc { border-collapse: collapse; width: 100%; }
          table.doc th, table.doc td { border: 1px solid #d1d5db; padding: 5px 7px; font-size: 12.5px; }
          table.doc th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
          .numeric { text-align: right; white-space: nowrap; }
          .footnote { text-align: center; font-style: italic; font-size: 11.5px; color: #4b5563; margin-top: 16px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <p class="title">${escapeHtml(COMPANY_NAME)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_ADDRESS)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_EMAIL)} &middot; Help Line: ${escapeHtml(COMPANY_HELPLINE)}</p>
        <p class="subtitle">${escapeHtml(title)}</p>
        <table class="doc">
          <thead><tr>${headerRow}</tr></thead>
          <tbody>${bodyRows}</tbody>
          ${
            totalsRow
              ? `<tfoot><tr>${totalsRow
                  .map((cell, index) => `<th class="${typeof cell === 'number' && index > 0 ? 'numeric' : ''}">${escapeHtml(String(cell))}</th>`)
                  .join('')}</tr></tfoot>`
              : ''
          }
        </table>
        <p class="footnote">${escapeHtml(COMPANY_INVOICE_FOOTER_NOTE)}</p>
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FileBarChart
  title: string
  description: string
}) {
  return (
    <div>
      <CardTitle className="flex items-center gap-2">
        <Icon className="h-4.5 w-4.5" /> {title}
      </CardTitle>
      <CardDescription>{description}</CardDescription>
    </div>
  )
}

// ---- Shared report period (2026-10-04 client request) --------------------
// One Monthly / Daily / Custom range / All time selector at the top of the
// hub, applied to every date-scoped tab (Fund, Sales, Expense, Purchase,
// Loan) so picking a month shows that month's detail + totals everywhere.
type PeriodMode = 'monthly' | 'daily' | 'range' | 'all'

function monthEnd(month: string) {
  const [year, monthIndex] = month.split('-').map(Number)
  const lastDay = new Date(year, monthIndex, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}`
}

function monthLabelOf(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

// Resolves the selector to an inclusive from/to ('' = open-ended) + label.
function resolvePeriod(mode: PeriodMode, month: string, day: string, rangeFrom: string, rangeTo: string) {
  if (mode === 'monthly' && month) return { from: `${month}-01`, to: monthEnd(month), label: monthLabelOf(month) }
  if (mode === 'daily' && day) return { from: day, to: day, label: formatDate(day) }
  if (mode === 'range' && (rangeFrom || rangeTo)) {
    return {
      from: rangeFrom,
      to: rangeTo,
      label: `${rangeFrom ? formatDate(rangeFrom) : 'Beginning'} – ${rangeTo ? formatDate(rangeTo) : 'Now'}`,
    }
  }
  return { from: '', to: '', label: 'All time' }
}

function inRange(date: string, from: string, to: string) {
  const value = date.slice(0, 10)
  if (from && value < from) return false
  if (to && value > to) return false
  return true
}

// ---- Reports Hub (2026-09-12 client request) ------------------------------
// "রিপোর্ট বিভাগ" — one place to pull every module's records out as a
// report: Sales keeps its own richer screen (SalesReportsContent); Expense,
// Purchase, Vendor, and Loan are simple date-range-filtered tables built
// straight off the same data.* collections every other admin page already
// reads, each with Export (Excel/CSV/PDF) and Print.
export function ReportsHubScreen() {
  const { data } = useERP()
  const currency = data?.settings.currency
  const [section, setSection] = useState<SectionId>('fund')

  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly')
  const [periodMonth, setPeriodMonth] = useState(() => dhakaTodayIso().slice(0, 7))
  const [periodDay, setPeriodDay] = useState(() => dhakaTodayIso())
  const [rangeFrom, setRangeFrom] = useState(() => `${dhakaTodayIso().slice(0, 7)}-01`)
  const [rangeTo, setRangeTo] = useState(() => dhakaTodayIso())
  const period = useMemo(
    () => resolvePeriod(periodMode, periodMonth, periodDay, rangeFrom, rangeTo),
    [periodMode, periodMonth, periodDay, rangeFrom, rangeTo]
  )
  const periodFrom = period.from
  const periodTo = period.to
  const periodLabel = period.label

  // ---- Expense report (client request, 2026-09-13) -----------------------
  // Sector-wise summary + a single combined detail list, always visible —
  // no date filter needs to be applied first. Merges in Cash Maintenance's
  // own cash-out categories (পণ্য ক্রয়, প্যাকেজিং মেটেরিয়ালস ক্রয়, etc. —
  // see CASH_MAINTENANCE_CATEGORIES in standardChartOfAccounts.ts) alongside
  // the Expense (P&L) chart: purchases/packaging/depot product transport are entered
  // directly on Cash Maintenance instead of Expenses, so without this merge
  // the client's own daily cash tally — which treats every taka that left
  // the till the same way — never matched what this report showed. Direct-
  // expense rows are included (isCashMaintenanceOut, since 2026-09-29).

  type CombinedExpenseRow = {
    date: string
    category: string
    amount: number
    source: 'Expense' | 'Cash Maintenance'
    note?: string
  }

  const combinedExpenseRows = useMemo<CombinedExpenseRow[]>(() => {
    const fromExpenses: CombinedExpenseRow[] = toArray(data?.expenses)
      .filter((expense) => expense.approvalStatus !== 'rejected')
      .map((expense) => ({
        date: expense.date,
        category: expenseCategoryLabel(data, expense.category),
        amount: expense.amount,
        source: 'Expense',
        note: expense.note,
      }))
    const fromCashMaintenance: CombinedExpenseRow[] = toArray(data?.cashMaintenance)
      .filter(isCashMaintenanceOut)
      .map((entry) => ({
        date: entry.date,
        category: entry.category,
        amount: entry.amount,
        source: 'Cash Maintenance',
        note: entry.note,
      }))
    return [...fromExpenses, ...fromCashMaintenance]
  }, [data?.expenses, data?.cashMaintenance])

  const filteredExpenses = useMemo(
    () =>
      combinedExpenseRows
        .filter((row) => inRange(row.date, periodFrom, periodTo))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [combinedExpenseRows, periodFrom, periodTo]
  )
  const expenseTotal = useMemo(() => filteredExpenses.reduce((sum, row) => sum + row.amount, 0), [filteredExpenses])

  type ExpenseCategorySummaryRow = { category: string; expenseAmount: number; cashAmount: number; total: number }
  const expenseCategorySummary = useMemo(() => {
    const map = new Map<string, ExpenseCategorySummaryRow>()
    for (const row of filteredExpenses) {
      const existing = map.get(row.category) ?? { category: row.category, expenseAmount: 0, cashAmount: 0, total: 0 }
      if (row.source === 'Expense') existing.expenseAmount += row.amount
      else existing.cashAmount += row.amount
      existing.total += row.amount
      map.set(row.category, existing)
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [filteredExpenses])

  const expenseSourceTotals = useMemo(
    () => ({
      expense: filteredExpenses.filter((row) => row.source === 'Expense').reduce((sum, row) => sum + row.amount, 0),
      cash: filteredExpenses.filter((row) => row.source === 'Cash Maintenance').reduce((sum, row) => sum + row.amount, 0),
    }),
    [filteredExpenses]
  )

  // Day-by-day totals for the period — the "details" view when a whole
  // month (or a range) is picked.
  const expenseDailyTotals = useMemo(() => {
    const map = new Map<string, { date: string; count: number; total: number }>()
    for (const row of filteredExpenses) {
      const date = row.date.slice(0, 10)
      const existing = map.get(date) ?? { date, count: 0, total: 0 }
      existing.count += 1
      existing.total += row.amount
      map.set(date, existing)
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date))
  }, [filteredExpenses])

  const expenseHeaders = ['Date', 'Category', 'Source', 'Amount', 'Note']
  const expenseRows = useMemo(
    () => filteredExpenses.map((row) => [formatDate(row.date), row.category, row.source, row.amount, row.note ?? '']),
    [filteredExpenses]
  )

  // ---- Purchase report ---------------------------------------------------
  const filteredPurchases = useMemo(() => {
    return sortByCreatedAtDesc(toArray(data?.purchases)).filter((purchase) => inRange(purchase.date, periodFrom, periodTo))
  }, [data?.purchases, periodFrom, periodTo])
  // Totals skip rejected purchases (isCountedEntry); the rows still list them.
  const purchaseTotals = useMemo(() => {
    const counted = filteredPurchases.filter(isCountedEntry)
    return {
      count: counted.length,
      items: counted.reduce((sum, purchase) => sum + purchase.items.length, 0),
      total: counted.reduce((sum, purchase) => sum + purchase.totalAmount, 0),
      paid: counted.reduce((sum, purchase) => sum + purchase.paid, 0),
      due: counted.reduce((sum, purchase) => sum + purchase.due, 0),
    }
  }, [filteredPurchases])
  // Vendor payments (per-purchase or vendor-level) dated inside the period.
  const vendorPaymentsInPeriod = useMemo(
    () =>
      toArray(data?.vendorPayments)
        .filter((payment) => isCountedEntry(payment) && inRange(payment.date, periodFrom, periodTo))
        .reduce((sum, payment) => sum + payment.amount, 0),
    [data?.vendorPayments, periodFrom, periodTo]
  )
  const purchaseHeaders = ['Purchase No', 'Vendor', 'Date', 'Items', 'Total', 'Paid', 'Due']
  const purchaseRows = useMemo(
    () =>
      filteredPurchases.map((purchase) => [
        purchase.purchaseNumber,
        purchase.vendorName,
        formatDate(purchase.date),
        purchase.items.length,
        purchase.totalAmount.toFixed(2),
        purchase.paid.toFixed(2),
        purchase.due.toFixed(2),
      ]),
    [filteredPurchases]
  )
  const purchaseTotalsRow = [
    `Total — ${periodLabel}`,
    '',
    '',
    purchaseTotals.items,
    purchaseTotals.total.toFixed(2),
    purchaseTotals.paid.toFixed(2),
    purchaseTotals.due.toFixed(2),
  ]

  // ---- Vendor report ------------------------------------------------------
  // No date range — "current due" is always a point-in-time figure, not
  // something a period can meaningfully scope (same directory the Vendor
  // page itself shows).
  const [vendorQuery, setVendorQuery] = useState('')
  const vendors = useMemo(() => sortByCreatedAtDesc(toArray(data?.vendors)), [data?.vendors])
  const vendorDueById = useMemo(() => {
    const map = new Map<string, number>()
    vendors.forEach((vendor) => map.set(vendor.id, computeVendorDue(data ?? null, vendor.id)))
    return map
  }, [data, vendors])
  const filteredVendors = useMemo(() => {
    const normalized = vendorQuery.trim().toLowerCase()
    if (!normalized) return vendors
    return vendors.filter((vendor) => [vendor.name, vendor.proprietorName ?? '', vendor.phone].join(' ').toLowerCase().includes(normalized))
  }, [vendors, vendorQuery])
  const vendorPeriodById = useMemo(() => {
    const map = new Map<string, { purchased: number; paid: number }>()
    for (const purchase of toArray(data?.purchases)) {
      if (!isCountedEntry(purchase) || !inRange(purchase.date, periodFrom, periodTo)) continue
      const row = map.get(purchase.vendorId) ?? { purchased: 0, paid: 0 }
      row.purchased += purchase.totalAmount
      map.set(purchase.vendorId, row)
    }
    for (const payment of toArray(data?.vendorPayments)) {
      if (!payment.vendorId || !isCountedEntry(payment) || !inRange(payment.date, periodFrom, periodTo)) continue
      const row = map.get(payment.vendorId) ?? { purchased: 0, paid: 0 }
      row.paid += payment.amount
      map.set(payment.vendorId, row)
    }
    return map
  }, [data?.purchases, data?.vendorPayments, periodFrom, periodTo])
  const vendorPeriodTotals = useMemo(
    () =>
      filteredVendors.reduce(
        (totals, vendor) => ({
          purchased: totals.purchased + (vendorPeriodById.get(vendor.id)?.purchased ?? 0),
          paid: totals.paid + (vendorPeriodById.get(vendor.id)?.paid ?? 0),
        }),
        { purchased: 0, paid: 0 }
      ),
    [filteredVendors, vendorPeriodById]
  )
  const vendorTotalDue = useMemo(
    () => filteredVendors.reduce((sum, vendor) => sum + (vendorDueById.get(vendor.id) ?? 0), 0),
    [filteredVendors, vendorDueById]
  )
  const vendorHeaders = ['Vendor Name', 'Proprietor', 'Phone', 'Address', 'Purchased (period)', 'Payments (period)', 'Current Due']
  const vendorRows = useMemo(
    () =>
      filteredVendors.map((vendor) => [
        vendor.name,
        vendor.proprietorName ?? '',
        vendor.phone,
        vendor.address,
        (vendorPeriodById.get(vendor.id)?.purchased ?? 0).toFixed(2),
        (vendorPeriodById.get(vendor.id)?.paid ?? 0).toFixed(2),
        (vendorDueById.get(vendor.id) ?? 0).toFixed(2),
      ]),
    [filteredVendors, vendorDueById, vendorPeriodById]
  )
  const vendorTotalsRow = [
    `Total — ${periodLabel}`,
    '',
    '',
    '',
    vendorPeriodTotals.purchased.toFixed(2),
    vendorPeriodTotals.paid.toFixed(2),
    vendorTotalDue.toFixed(2),
  ]

  // ---- Loan report --------------------------------------------------------
  const filteredLoanTransactions = useMemo(() => {
    return sortByCreatedAtDesc(toArray(data?.loanTransactions)).filter((entry) => inRange(entry.date, periodFrom, periodTo))
  }, [data?.loanTransactions, periodFrom, periodTo])
  // Totals skip rejected transactions (isCountedEntry), same as the Loan Chart.
  const loanWithdrawals = useMemo(
    () =>
      filteredLoanTransactions
        .filter((entry) => entry.type === 'withdrawal' && isCountedEntry(entry))
        .reduce((sum, entry) => sum + entry.amount, 0),
    [filteredLoanTransactions]
  )
  const loanRepayments = useMemo(
    () =>
      filteredLoanTransactions
        .filter((entry) => entry.type === 'repayment' && isCountedEntry(entry))
        .reduce((sum, entry) => sum + entry.amount, 0),
    [filteredLoanTransactions]
  )
  // Loan balance owed at the end of the period (every counted transaction
  // up to periodTo) — the closing figure for the selected month/day.
  const loanClosingBalance = useMemo(
    () =>
      toArray(data?.loanTransactions)
        .filter((entry) => isCountedEntry(entry) && (!periodTo || entry.date.slice(0, 10) <= periodTo))
        .reduce((sum, entry) => sum + (entry.type === 'withdrawal' ? entry.amount : -entry.amount), 0),
    [data?.loanTransactions, periodTo]
  )
  // Member-wise breakdown for the period.
  const loanMemberSummary = useMemo(() => {
    const map = new Map<string, { member: string; withdrawn: number; repaid: number }>()
    for (const entry of filteredLoanTransactions) {
      if (!isCountedEntry(entry)) continue
      const row = map.get(entry.loanAccountId) ?? { member: entry.memberName, withdrawn: 0, repaid: 0 }
      if (entry.type === 'withdrawal') row.withdrawn += entry.amount
      else row.repaid += entry.amount
      map.set(entry.loanAccountId, row)
    }
    return Array.from(map.values()).sort((a, b) => a.member.localeCompare(b.member))
  }, [filteredLoanTransactions])
  const loanHeaders = ['Date', 'Member', 'Type', 'Amount', 'Note']
  const loanRows = useMemo(
    () =>
      filteredLoanTransactions.map((entry) => [
        formatDate(entry.date),
        entry.memberName,
        loanTransactionTypeLabel(entry),
        entry.amount.toFixed(2),
        entry.note ?? '',
      ]),
    [filteredLoanTransactions]
  )

  return (
    <AdminShell active="Reports">
      <div className="space-y-6">
        <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-border/70 bg-muted/30 p-1">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                section === item.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Report period:</span>
              <span className="text-muted-foreground">{periodLabel}</span>
              {section === 'vendor' ? (
                <span className="text-xs text-muted-foreground">(Current Due is always as of today)</span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={periodMode} onValueChange={(value) => setPeriodMode(value as PeriodMode)}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="range">Custom range</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
              {periodMode === 'monthly' ? (
                <Input className="w-full sm:w-44" type="month" value={periodMonth} onChange={(event) => setPeriodMonth(event.target.value)} aria-label="Month" />
              ) : null}
              {periodMode === 'daily' ? (
                <Input className="w-full sm:w-44" type="date" value={periodDay} onChange={(event) => setPeriodDay(event.target.value)} aria-label="Day" />
              ) : null}
              {periodMode === 'range' ? (
                <>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    From
                    <Input className="w-full sm:w-40" type="date" value={rangeFrom} max={rangeTo || undefined} onChange={(event) => setRangeFrom(event.target.value)} />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    To
                    <Input className="w-full sm:w-40" type="date" value={rangeTo} min={rangeFrom || undefined} onChange={(event) => setRangeTo(event.target.value)} />
                  </label>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {section === 'fund' ? <FundCashFlowReport from={periodFrom} to={periodTo} periodLabel={periodLabel} /> : null}

        {section === 'sales' ? <SalesReportsContent from={periodFrom} to={periodTo} periodLabel={periodLabel} /> : null}

        {section === 'expense' ? (
          <div className="space-y-6">
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
                <SectionHeader
                  icon={ReceiptText}
                  title="Expense Report"
                  description="Every recorded expense plus Cash Maintenance's own cash-out categories (Product Purchase, Packaging, etc.) — sector-wise summary and full detail together, no filter needed."
                />
                <div className="flex flex-wrap items-center gap-3">
                  <ExportMenu filenameBase={`expense-report-${periodFrom || 'all'}`} title={`Expense Report — ${periodLabel}`} headers={expenseHeaders} rows={expenseRows} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={expenseRows.length === 0}
                    onClick={() =>
                      openPrintWindow(
                        buildGenericReportHtml(`Expense Report — ${periodLabel}`, expenseHeaders, expenseRows, [
                          `Total (${filteredExpenses.length} entries)`,
                          '',
                          '',
                          expenseTotal.toFixed(2),
                          '',
                        ])
                      )
                    }
                  >
                    Print
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                    <span className="text-muted-foreground">Total — {periodLabel}</span>
                    <p className="mt-1 text-lg font-semibold">{formatCurrency(expenseTotal, currency)}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                    <span className="text-muted-foreground">From Expenses</span>
                    <p className="mt-1 text-lg font-semibold">{formatCurrency(expenseSourceTotals.expense, currency)}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                    <span className="text-muted-foreground">From Cash Maintenance</span>
                    <p className="mt-1 text-lg font-semibold">{formatCurrency(expenseSourceTotals.cash, currency)}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                    <span className="text-muted-foreground">Entries</span>
                    <p className="mt-1 text-lg font-semibold">{filteredExpenses.length.toLocaleString('en-BD')}</p>
                  </div>
                </div>

                <p className="mb-2 text-sm font-medium text-foreground">Sector-wise summary</p>
                <div className="mb-6 overflow-x-auto rounded-2xl border border-border/70">
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
                      {expenseCategorySummary.map((row) => (
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
                      {expenseCategorySummary.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                            No expenses for this period.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                    {expenseCategorySummary.length > 0 ? (
                      <TableFooter>
                        <TableRow>
                          <TableCell className="font-semibold">Total</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(expenseSourceTotals.expense, currency)}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(expenseSourceTotals.cash, currency)}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(expenseTotal, currency)}</TableCell>
                        </TableRow>
                      </TableFooter>
                    ) : null}
                  </Table>
                </div>

                {expenseDailyTotals.length > 1 ? (
                  <>
                    <p className="mb-2 text-sm font-medium text-foreground">Day-wise total</p>
                    <div className="mb-6 overflow-x-auto rounded-2xl border border-border/70">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Entries</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {expenseDailyTotals.map((row) => (
                            <TableRow key={row.date}>
                              <TableCell>{formatDate(row.date)}</TableCell>
                              <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(row.total, currency)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : null}

                <p className="mb-2 text-sm font-medium text-foreground">Date-wise detail</p>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.map((row, index) => (
                        <TableRow key={`${row.source}-${row.date}-${index}`}>
                          <TableCell>{formatDate(row.date)}</TableCell>
                          <TableCell className="font-medium">{row.category}</TableCell>
                          <TableCell className="text-muted-foreground">{row.source}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(row.amount, currency)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{row.note || '-'}</TableCell>
                        </TableRow>
                      ))}
                      {filteredExpenses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                            No expenses for this period.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                    {filteredExpenses.length > 0 ? (
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={3} className="font-semibold">Total — {periodLabel}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(expenseTotal, currency)}</TableCell>
                          <TableCell />
                        </TableRow>
                      </TableFooter>
                    ) : null}
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {section === 'purchase' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionHeader icon={ShoppingCart} title="Purchase Report" description="Every procurement transaction in the selected period — rejected purchases are listed but not counted in totals." />
              <div className="flex flex-wrap items-center gap-3">
                <ExportMenu filenameBase={`purchase-report-${periodFrom || 'all'}`} title={`Purchase Report — ${periodLabel}`} headers={purchaseHeaders} rows={purchaseRows} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={purchaseRows.length === 0}
                  onClick={() => openPrintWindow(buildGenericReportHtml(`Purchase Report — ${periodLabel}`, purchaseHeaders, purchaseRows, purchaseTotalsRow))}
                >
                  Print
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">Total purchased — {periodLabel}</span>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(purchaseTotals.total, currency)}</p>
                  <p className="text-xs text-muted-foreground">{purchaseTotals.count} purchase(s)</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">Paid on these purchases</span>
                  <p className="mt-1 text-lg font-semibold text-emerald-600">{formatCurrency(purchaseTotals.paid, currency)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">Still due on these purchases</span>
                  <p className="mt-1 text-lg font-semibold text-destructive">{formatCurrency(purchaseTotals.due, currency)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">Vendor payments made in period</span>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(vendorPaymentsInPeriod, currency)}</p>
                  <p className="text-xs text-muted-foreground">Later payments, by payment date</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Purchase No</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPurchases.map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell className="font-medium">{purchase.purchaseNumber}</TableCell>
                        <TableCell>{purchase.vendorName}</TableCell>
                        <TableCell>{formatDate(purchase.date)}</TableCell>
                        <TableCell className="text-right tabular-nums">{purchase.items.length}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(purchase.totalAmount, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(purchase.paid, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(purchase.due, currency)}</TableCell>
                      </TableRow>
                    ))}
                    {filteredPurchases.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                          No purchases for this period.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                  {filteredPurchases.length > 0 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3} className="font-semibold">Total — {periodLabel}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{purchaseTotals.items}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(purchaseTotals.total, currency)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(purchaseTotals.paid, currency)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(purchaseTotals.due, currency)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === 'vendor' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionHeader icon={Truck} title="Vendor Report" description="Vendor directory — purchases and payments in the selected period, plus each vendor's current due (always as of today)." />
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={vendorQuery} onChange={(event) => setVendorQuery(event.target.value)} className="w-56 pl-9" placeholder="Search vendor" />
                </div>
                <ExportMenu filenameBase="vendor-report" title="Vendor Report" headers={vendorHeaders} rows={vendorRows} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={vendorRows.length === 0}
                  onClick={() => openPrintWindow(buildGenericReportHtml(`Vendor Report — ${periodLabel}`, vendorHeaders, vendorRows, vendorTotalsRow))}
                >
                  Print
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">Purchased — {periodLabel}</span>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(vendorPeriodTotals.purchased, currency)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">Vendor payments — {periodLabel}</span>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(vendorPeriodTotals.paid, currency)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">Total current due (filtered vendors)</span>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(vendorTotalDue, currency)}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Vendor</TableHead>
                      <TableHead>Proprietor</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead className="text-right">Purchased</TableHead>
                      <TableHead className="text-right">Payments</TableHead>
                      <TableHead className="text-right">Current Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVendors.map((vendor) => (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">{vendor.name}</TableCell>
                        <TableCell className="text-muted-foreground">{vendor.proprietorName || '—'}</TableCell>
                        <TableCell>{vendor.phone || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{vendor.address || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(vendorPeriodById.get(vendor.id)?.purchased ?? 0, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(vendorPeriodById.get(vendor.id)?.paid ?? 0, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(vendorDueById.get(vendor.id) ?? 0, currency)}</TableCell>
                      </TableRow>
                    ))}
                    {filteredVendors.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                          No vendors found.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                  {filteredVendors.length > 0 ? (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={4} className="font-semibold">Total — {periodLabel}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(vendorPeriodTotals.purchased, currency)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(vendorPeriodTotals.paid, currency)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(vendorTotalDue, currency)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  ) : null}
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === 'loan' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionHeader icon={HandCoins} title="Loan Report" description="Every withdrawal and repayment in the selected period — rejected entries are listed but not counted in totals." />
              <div className="flex flex-wrap items-center gap-3">
                <ExportMenu filenameBase={`loan-report-${periodFrom || 'all'}`} title={`Loan Report — ${periodLabel}`} headers={loanHeaders} rows={loanRows} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loanRows.length === 0}
                  onClick={() =>
                    openPrintWindow(
                      buildGenericReportHtml(`Loan Report — ${periodLabel}`, loanHeaders, loanRows, [
                        'Total',
                        '',
                        `Withdrawn ${loanWithdrawals.toFixed(2)} / Repaid ${loanRepayments.toFixed(2)}`,
                        (loanWithdrawals - loanRepayments).toFixed(2),
                        `Balance at period end: ${loanClosingBalance.toFixed(2)}`,
                      ])
                    )
                  }
                >
                  Print
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">Withdrawn — {periodLabel}</span>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(loanWithdrawals, currency)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">Repaid — {periodLabel}</span>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(loanRepayments, currency)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">Net change</span>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(loanWithdrawals - loanRepayments, currency)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">Loan balance at period end</span>
                  <p className="mt-1 text-lg font-semibold text-destructive">{formatCurrency(loanClosingBalance, currency)}</p>
                </div>
              </div>

              {loanMemberSummary.length > 0 ? (
                <>
                  <p className="mb-2 text-sm font-medium text-foreground">Member-wise summary</p>
                  <div className="mb-6 overflow-x-auto rounded-2xl border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead>Member</TableHead>
                          <TableHead className="text-right">Withdrawn</TableHead>
                          <TableHead className="text-right">Repaid</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {loanMemberSummary.map((row) => (
                          <TableRow key={row.member}>
                            <TableCell className="font-medium">{row.member}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(row.withdrawn, currency)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatCurrency(row.repaid, currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell className="font-semibold">Total</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(loanWithdrawals, currency)}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(loanRepayments, currency)}</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                  <p className="mb-2 text-sm font-medium text-foreground">Transaction detail</p>
                </>
              ) : null}
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Date</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLoanTransactions.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{formatDate(entry.date)}</TableCell>
                        <TableCell className="font-medium">{entry.memberName}</TableCell>
                        <TableCell>
                          {loanTransactionTypeLabel(entry)}
                          {entry.approvalStatus === 'rejected' ? <span className="ml-1.5 text-xs text-destructive">(rejected)</span> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(entry.amount, currency)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.note || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {filteredLoanTransactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No loan transactions for this period.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  )
}

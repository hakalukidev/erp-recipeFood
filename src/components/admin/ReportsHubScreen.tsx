"use client"

import { useMemo, useState } from 'react'
import { FileBarChart, HandCoins, ReceiptText, Search, ShoppingCart, Truck } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { ExportMenu } from './ExportMenu'
import { SalesReportsContent } from './SalesReportsScreen'
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
import { computeVendorDue, formatCurrency, formatDate, sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type SectionId = 'sales' | 'expense' | 'purchase' | 'vendor' | 'loan'

const SECTIONS: Array<{ id: SectionId; label: string; description: string }> = [
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
function buildGenericReportHtml(title: string, headers: string[], rows: (string | number)[][]) {
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

// A date range filter shared by the Expense/Purchase/Loan tabs — empty
// from/to means "no filter" (show everything on file).
function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="date" className="w-40" value={from} onChange={(event) => onFromChange(event.target.value)} />
      <span className="text-sm text-muted-foreground">to</span>
      <Input type="date" className="w-40" value={to} onChange={(event) => onToChange(event.target.value)} />
      {from || to ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onFromChange('')
            onToChange('')
          }}
        >
          Clear
        </Button>
      ) : null}
    </div>
  )
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
  const [section, setSection] = useState<SectionId>('sales')

  // ---- Expense report --------------------------------------------------
  const [expenseFrom, setExpenseFrom] = useState('')
  const [expenseTo, setExpenseTo] = useState('')
  const filteredExpenses = useMemo(() => {
    return sortByCreatedAtDesc(toArray(data?.expenses)).filter((expense) => inRange(expense.date, expenseFrom, expenseTo))
  }, [data?.expenses, expenseFrom, expenseTo])
  const expenseTotal = useMemo(() => filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0), [filteredExpenses])
  const expenseHeaders = ['Date', 'Category', 'Amount', 'Payment method', 'Note']
  const expenseRows = useMemo(
    () =>
      filteredExpenses.map((expense) => [
        expense.date.slice(0, 10),
        expense.category,
        expense.amount,
        expense.paymentMethod ?? 'cash',
        expense.note ?? '',
      ]),
    [filteredExpenses]
  )

  // ---- Purchase report ---------------------------------------------------
  const [purchaseFrom, setPurchaseFrom] = useState('')
  const [purchaseTo, setPurchaseTo] = useState('')
  const filteredPurchases = useMemo(() => {
    return sortByCreatedAtDesc(toArray(data?.purchases)).filter((purchase) => inRange(purchase.date, purchaseFrom, purchaseTo))
  }, [data?.purchases, purchaseFrom, purchaseTo])
  const purchaseTotal = useMemo(() => filteredPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0), [filteredPurchases])
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
  const vendorTotalDue = useMemo(
    () => filteredVendors.reduce((sum, vendor) => sum + (vendorDueById.get(vendor.id) ?? 0), 0),
    [filteredVendors, vendorDueById]
  )
  const vendorHeaders = ['Vendor Name', 'Proprietor', 'Phone', 'Address', 'Current Due']
  const vendorRows = useMemo(
    () =>
      filteredVendors.map((vendor) => [
        vendor.name,
        vendor.proprietorName ?? '',
        vendor.phone,
        vendor.address,
        (vendorDueById.get(vendor.id) ?? 0).toFixed(2),
      ]),
    [filteredVendors, vendorDueById]
  )

  // ---- Loan report --------------------------------------------------------
  const [loanFrom, setLoanFrom] = useState('')
  const [loanTo, setLoanTo] = useState('')
  const filteredLoanTransactions = useMemo(() => {
    return sortByCreatedAtDesc(toArray(data?.loanTransactions)).filter((entry) => inRange(entry.date, loanFrom, loanTo))
  }, [data?.loanTransactions, loanFrom, loanTo])
  const loanWithdrawals = useMemo(
    () => filteredLoanTransactions.filter((entry) => entry.type === 'withdrawal').reduce((sum, entry) => sum + entry.amount, 0),
    [filteredLoanTransactions]
  )
  const loanRepayments = useMemo(
    () => filteredLoanTransactions.filter((entry) => entry.type === 'repayment').reduce((sum, entry) => sum + entry.amount, 0),
    [filteredLoanTransactions]
  )
  const loanHeaders = ['Date', 'Member', 'Type', 'Amount', 'Note']
  const loanRows = useMemo(
    () =>
      filteredLoanTransactions.map((entry) => [
        formatDate(entry.date),
        entry.memberName,
        entry.type === 'withdrawal' ? 'Withdrawal' : 'Repayment',
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

        {section === 'sales' ? <SalesReportsContent /> : null}

        {section === 'expense' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionHeader icon={ReceiptText} title="Expense Report" description="Every recorded expense, optionally scoped to a date range." />
              <div className="flex flex-wrap items-center gap-3">
                <DateRangeFilter from={expenseFrom} to={expenseTo} onFromChange={setExpenseFrom} onToChange={setExpenseTo} />
                <ExportMenu filenameBase="expense-report" title="Expense Report" headers={expenseHeaders} rows={expenseRows} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={expenseRows.length === 0}
                  onClick={() => openPrintWindow(buildGenericReportHtml('Expense Report', expenseHeaders, expenseRows))}
                >
                  Print
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                <span className="text-muted-foreground">Total for this range</span>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(expenseTotal, currency)}</p>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{formatDate(expense.date)}</TableCell>
                        <TableCell className="font-medium">{expense.category}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(expense.amount, currency)}</TableCell>
                        <TableCell className="capitalize text-muted-foreground">{expense.paymentMethod ?? 'cash'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{expense.note || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {filteredExpenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No expenses for this range.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === 'purchase' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionHeader icon={ShoppingCart} title="Purchase Report" description="Every procurement transaction, optionally scoped to a date range." />
              <div className="flex flex-wrap items-center gap-3">
                <DateRangeFilter from={purchaseFrom} to={purchaseTo} onFromChange={setPurchaseFrom} onToChange={setPurchaseTo} />
                <ExportMenu filenameBase="purchase-report" title="Purchase Report" headers={purchaseHeaders} rows={purchaseRows} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={purchaseRows.length === 0}
                  onClick={() => openPrintWindow(buildGenericReportHtml('Purchase Report', purchaseHeaders, purchaseRows))}
                >
                  Print
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                <span className="text-muted-foreground">Total for this range</span>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(purchaseTotal, currency)}</p>
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
                          No purchases for this range.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === 'vendor' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionHeader icon={Truck} title="Vendor Report" description="Vendor directory with current due — a point-in-time figure, not date-scoped." />
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
                  onClick={() => openPrintWindow(buildGenericReportHtml('Vendor Report', vendorHeaders, vendorRows))}
                >
                  Print
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                <span className="text-muted-foreground">Total due (filtered vendors)</span>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(vendorTotalDue, currency)}</p>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Vendor</TableHead>
                      <TableHead>Proprietor</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Address</TableHead>
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
                        <TableCell className="text-right tabular-nums">{formatCurrency(vendorDueById.get(vendor.id) ?? 0, currency)}</TableCell>
                      </TableRow>
                    ))}
                    {filteredVendors.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No vendors found.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === 'loan' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionHeader icon={HandCoins} title="Loan Report" description="Every withdrawal and repayment, optionally scoped to a date range." />
              <div className="flex flex-wrap items-center gap-3">
                <DateRangeFilter from={loanFrom} to={loanTo} onFromChange={setLoanFrom} onToChange={setLoanTo} />
                <ExportMenu filenameBase="loan-report" title="Loan Report" headers={loanHeaders} rows={loanRows} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loanRows.length === 0}
                  onClick={() => openPrintWindow(buildGenericReportHtml('Loan Report', loanHeaders, loanRows))}
                >
                  Print
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">Total withdrawn</span>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(loanWithdrawals, currency)}</p>
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                  <span className="text-muted-foreground">Total repaid</span>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(loanRepayments, currency)}</p>
                </div>
              </div>
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
                        <TableCell className="capitalize">{entry.type}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(entry.amount, currency)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.note || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {filteredLoanTransactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          No loan transactions for this range.
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

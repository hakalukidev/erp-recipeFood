"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { ListChecks, Pencil, Plus, Printer, Tags, Trash2, UserCheck } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_HELPLINE,
  COMPANY_INVOICE_FOOTER_NOTE,
  COMPANY_NAME,
} from '@/lib/erp/companyInfo'
import { EXPENSE_CATEGORIES, EXPENSE_LOAN_REPAYMENT_CATEGORY, EXPENSE_SALARY_CATEGORY } from '@/lib/erp/standardChartOfAccounts'
import type { ExpenseInput, ExpenseRecord } from '@/lib/erp/types'
import { useERP } from '@/lib/erp/provider'
import { computeEmployeeSalaryTotals, formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

const ALL_CATEGORIES = '__all__'

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

// Report-style printable voucher for the Expense chart — category-wise
// summary followed by the detailed list, scoped to whatever period/category
// filter is currently on screen (see filteredExpenses/categoryTotals in
// ExpensesPage). Same layout family as buildCategoryInvoiceHtml in
// SalesReportsScreen.tsx.
function buildExpenseReportHtml(
  periodLabel: string,
  categoryTotals: Array<{ category: string; count: number; total: number }>,
  expenses: ExpenseRecord[],
  currency: string | undefined,
  grandTotal: number
) {
  const summaryRows = categoryTotals
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.category)}</td>
        <td class="numeric">${row.count}</td>
        <td class="numeric">${formatCurrency(row.total, currency)}</td>
      </tr>
    `
    )
    .join('')

  const detailRows = expenses
    .map(
      (expense, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${formatDate(expense.date)}</td>
        <td>${escapeHtml(expense.category)}</td>
        <td>${escapeHtml(expense.loanMemberName || expense.employeeName || '-')}</td>
        <td class="numeric">${formatCurrency(expense.amount, currency)}</td>
        <td>${escapeHtml(expense.note || '-')}</td>
      </tr>
    `
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Expense Report</title>
        <style>
          * { box-sizing: border-box; }
          @page { margin: 12mm 16mm; size: A4; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 0; }
          .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; color: #0f766e; }
          .company-meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
          .subtitle { text-align: center; color: #4b5563; font-size: 13px; margin: 10px 0 16px; }
          h2 { font-size: 14px; margin: 18px 0 8px; }
          table.doc { border-collapse: collapse; width: 100%; margin-bottom: 12px; }
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
        <p class="subtitle">Expense Report — ${escapeHtml(periodLabel)}</p>
        <h2>By category</h2>
        <table class="doc">
          <thead>
            <tr><th>Category</th><th>Entries</th><th>Total</th></tr>
          </thead>
          <tbody>
            ${summaryRows}
            <tr class="totals"><td>Grand Total</td><td class="numeric">${expenses.length}</td><td class="numeric">${formatCurrency(grandTotal, currency)}</td></tr>
          </tbody>
        </table>
        <h2>Detail</h2>
        <table class="doc">
          <thead>
            <tr><th>SL</th><th>Date</th><th>Category</th><th>Employee/Loan</th><th>Amount</th><th>Note</th></tr>
          </thead>
          <tbody>${detailRows}</tbody>
        </table>
        <p class="footnote">${escapeHtml(COMPANY_INVOICE_FOOTER_NOTE)}</p>
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

function dateInputValue(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function monthInputValue(date = new Date()) {
  return date.toISOString().slice(0, 7)
}

function isSameDate(value: string, target: string) {
  return value.slice(0, 10) === target
}

function isSameMonth(value: string, target: string) {
  return value.slice(0, 7) === target
}

const emptyExpenseForm = {
  category: EXPENSE_CATEGORIES[0] as string,
  amount: '0',
  note: '',
  date: dateInputValue(),
  paymentMethod: 'cash' as 'cash' | 'bank',
  employeeId: '',
  loanAccountId: '',
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ListChecks
  title: string
  description: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

export default function ExpensesPage() {
  const { data, users, saveExpense, deleteExpense } = useERP()
  const [mode, setMode] = useState<'daily' | 'monthly'>('daily')
  const [selectedDate, setSelectedDate] = useState(dateInputValue())
  const [selectedMonth, setSelectedMonth] = useState(monthInputValue())
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)

  const expenses = useMemo(
    () => toArray(data?.expenses).sort((left, right) => right.date.localeCompare(left.date)),
    [data?.expenses]
  )
  const currency = data?.settings.currency
  const employeeOptions: ComboboxOption[] = useMemo(
    () => users.map((user) => ({ value: user.id, label: user.name, sublabel: user.title || user.loginId })),
    [users]
  )
  const loanAccountOptions: ComboboxOption[] = useMemo(
    () =>
      toArray(data?.loanAccounts)
        .map((account) => ({ value: account.id, label: account.memberName, sublabel: account.phone }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [data?.loanAccounts]
  )

  // Period-scoped but NOT category-scoped — this is what the "By category"
  // breakdown below sums, so switching the category filter (which only
  // narrows the detail table) never changes the breakdown itself.
  const periodExpenses = useMemo(() => {
    return expenses.filter((expense) =>
      mode === 'daily' ? isSameDate(expense.date, selectedDate) : isSameMonth(expense.date, selectedMonth)
    )
  }, [mode, expenses, selectedDate, selectedMonth])

  const filteredExpenses = useMemo(() => {
    return selectedCategory === ALL_CATEGORIES
      ? periodExpenses
      : periodExpenses.filter((expense) => expense.category === selectedCategory)
  }, [periodExpenses, selectedCategory])

  const expenseTotal = useMemo(
    () => filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    [filteredExpenses]
  )

  // ক্যাটাগরি-ওয়াইজ ফিল্টার (2026-09-12 client request): "কোন সেক্টরে কত
  // খরচ হচ্ছে" at a glance — always scoped to the period only, so it stays a
  // full breakdown even while the detail table above is narrowed to one
  // category.
  const categoryTotals = useMemo(() => {
    const rows = new Map<string, { category: string; count: number; total: number }>()
    periodExpenses.forEach((expense) => {
      const existing = rows.get(expense.category)
      if (existing) {
        existing.count += 1
        existing.total += expense.amount
      } else {
        rows.set(expense.category, { category: expense.category, count: 1, total: expense.amount })
      }
    })
    return Array.from(rows.values()).sort((left, right) => right.total - left.total)
  }, [periodExpenses])

  const periodLabel = mode === 'daily' ? formatDate(selectedDate) : selectedMonth

  // ---- Salary History (Loan/Cash Maintenance spec, Section 5) -------------
  const salaryTotals = useMemo(() => computeEmployeeSalaryTotals(data ?? null), [data])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const selectedEmployeeEntries = useMemo(
    () => expenses.filter((expense) => expense.employeeId === selectedEmployeeId),
    [expenses, selectedEmployeeId]
  )

  async function handleExpenseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    try {
      const input: ExpenseInput = {
        category: expenseForm.category,
        amount: Number(expenseForm.amount),
        note: expenseForm.note,
        date: expenseForm.date,
        paymentMethod: expenseForm.paymentMethod,
        employeeId: expenseForm.category === EXPENSE_SALARY_CATEGORY ? expenseForm.employeeId || undefined : undefined,
        loanAccountId:
          expenseForm.category === EXPENSE_LOAN_REPAYMENT_CATEGORY ? expenseForm.loanAccountId || undefined : undefined,
      }
      await saveExpense(input, editingExpenseId ?? undefined)
      setExpenseForm({ ...emptyExpenseForm, date: expenseForm.date })
      setFeedback(editingExpenseId ? 'Expense updated.' : 'Expense recorded.')
      setEditingExpenseId(null)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record expense.')
    }
  }

  function handleEditExpense(expense: (typeof expenses)[number]) {
    setFeedback(null)
    setEditingExpenseId(expense.id)
    setExpenseForm({
      category: expense.category,
      amount: String(expense.amount),
      note: expense.note ?? '',
      date: expense.date.slice(0, 10),
      paymentMethod: expense.paymentMethod ?? 'cash',
      employeeId: expense.employeeId ?? '',
      loanAccountId: expense.loanAccountId ?? '',
    })
  }

  function handleCancelEditExpense() {
    setEditingExpenseId(null)
    setExpenseForm({ ...emptyExpenseForm, date: expenseForm.date })
  }

  async function handleDeleteExpense(expenseId: string) {
    setFeedback(null)

    try {
      await deleteExpense(expenseId)
      if (editingExpenseId === expenseId) {
        setEditingExpenseId(null)
        setExpenseForm({ ...emptyExpenseForm, date: expenseForm.date })
      }
      setFeedback('Expense removed.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete expense.')
    }
  }

  return (
    <AdminShell active="Expenses">
      <div className="space-y-8">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Reporting period</p>
            <p className="text-xs text-muted-foreground">Choose a day or month, and optionally one category, to scope the expenses below.</p>
          </div>
          <div className="flex flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
            <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
            {mode === 'daily' ? (
              <Input className="w-full sm:w-48" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            ) : (
              <Input className="w-full sm:w-48" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            )}
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
                {EXPENSE_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ExportMenu
              filenameBase="expenses"
              title="Expenses"
              headers={['Date', 'Category', 'Employee/Loan', 'Amount', 'Payment method', 'Note']}
              rows={filteredExpenses.map((expense) => [
                expense.date.slice(0, 10),
                expense.category,
                expense.loanMemberName || expense.employeeName || '',
                expense.amount,
                expense.paymentMethod ?? 'cash',
                expense.note ?? '',
              ])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={filteredExpenses.length === 0}
              onClick={() =>
                openPrintWindow(
                  buildExpenseReportHtml(periodLabel, categoryTotals, filteredExpenses, currency, expenseTotal)
                )
              }
            >
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <section className="space-y-4">
          <SectionHeader
            icon={Tags}
            title="By category"
            description="Which sector the money for this period actually went to — independent of the category filter above."
          />
          <Card className="border-border/70 shadow-sm">
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Entries</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryTotals.map((row) => (
                      <TableRow
                        key={row.category}
                        className={cn('cursor-pointer', selectedCategory === row.category && 'bg-muted/40')}
                        onClick={() => setSelectedCategory(selectedCategory === row.category ? ALL_CATEGORIES : row.category)}
                      >
                        <TableCell className="font-medium">{row.category}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.total, currency)}</TableCell>
                      </TableRow>
                    ))}
                    {categoryTotals.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                          No expenses recorded for this period.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <SectionHeader
            icon={ListChecks}
            title="Expenses"
            description="Record and review day-to-day running costs."
          />

          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>{editingExpenseId ? 'Edit expense' : 'Record expense'}</CardTitle>
                <CardDescription>Daily or monthly running costs (rent, transport, utilities, etc.).</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleExpenseSubmit}>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Category<span className="ml-0.5 text-rose-500">*</span>
                    </p>
                    <Select
                      value={expenseForm.category}
                      onValueChange={(value) =>
                        setExpenseForm((current) => ({ ...current, category: value, employeeId: '', loanAccountId: '' }))
                      }
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>{category}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {expenseForm.category === EXPENSE_SALARY_CATEGORY ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Employee <span className="font-normal text-muted-foreground">(optional)</span>
                      </p>
                      <Combobox
                        options={employeeOptions}
                        value={expenseForm.employeeId}
                        onChange={(value) => setExpenseForm((current) => ({ ...current, employeeId: value }))}
                        placeholder="Select employee"
                        searchPlaceholder="Search employee"
                      />
                    </div>
                  ) : null}
                  {expenseForm.category === EXPENSE_LOAN_REPAYMENT_CATEGORY ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Loan account <span className="font-normal text-muted-foreground">(optional)</span>
                      </p>
                      <Combobox
                        options={loanAccountOptions}
                        value={expenseForm.loanAccountId}
                        onChange={(value) => setExpenseForm((current) => ({ ...current, loanAccountId: value }))}
                        placeholder="Select loan account"
                        searchPlaceholder="Search loan account"
                      />
                      <p className="text-xs text-muted-foreground">
                        Tagging an account also records this as a repayment on the Loan &amp; Investment ledger.
                      </p>
                    </div>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Amount ({currency ?? 'BDT'})<span className="ml-0.5 text-rose-500">*</span>
                      </p>
                      <Input
                        type="number"
                        min="1"
                        value={expenseForm.amount}
                        onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))}
                        placeholder="0"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Date<span className="ml-0.5 text-rose-500">*</span>
                      </p>
                      <Input
                        type="date"
                        value={expenseForm.date}
                        onChange={(event) => setExpenseForm((current) => ({ ...current, date: event.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Paid from</p>
                    <Select
                      value={expenseForm.paymentMethod}
                      onValueChange={(value) => setExpenseForm((current) => ({ ...current, paymentMethod: value as 'cash' | 'bank' }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Note <span className="font-normal text-muted-foreground">(optional)</span>
                    </p>
                    <Input
                      value={expenseForm.note}
                      onChange={(event) => setExpenseForm((current) => ({ ...current, note: event.target.value }))}
                      placeholder="Short note about this expense"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="submit" className="rounded-xl">
                      <Plus className="mr-2 h-4 w-4" />
                      {editingExpenseId ? 'Update expense' : 'Save expense'}
                    </Button>
                    {editingExpenseId ? (
                      <Button type="button" variant="outline" className="rounded-xl" onClick={handleCancelEditExpense}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Expenses this period</CardTitle>
                <CardDescription>
                  Total: {formatCurrency(expenseTotal, currency)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Date</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>{formatDate(expense.date)}</TableCell>
                          <TableCell className="font-medium">{expense.category}</TableCell>
                          <TableCell>{formatCurrency(expense.amount, currency)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{expense.note || '-'}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => handleEditExpense(expense)}
                                aria-label="Edit expense"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                onClick={() => void handleDeleteExpense(expense.id)}
                                aria-label="Delete expense"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredExpenses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                            No expenses recorded for this period.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeader
            icon={UserCheck}
            title="Salary History"
            description="Per-employee running total of every সেলারি expense — a quick spot-check against a payslip or cheque history."
          />
          <Card className="border-border/70 shadow-sm">
            <CardContent className="space-y-4 pt-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Entries</TableHead>
                      <TableHead className="text-right">Total Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salaryTotals.map((row) => (
                      <TableRow
                        key={row.employeeId}
                        className={cn('cursor-pointer', selectedEmployeeId === row.employeeId && 'bg-muted/40')}
                        onClick={() => setSelectedEmployeeId(row.employeeId === selectedEmployeeId ? '' : row.employeeId)}
                      >
                        <TableCell className="font-medium">{row.employeeName}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.total, currency)}</TableCell>
                      </TableRow>
                    ))}
                    {salaryTotals.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                          No salary entries tagged to an employee yet — pick an employee when recording a সেলারি expense above.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>

              {selectedEmployeeId ? (
                <div className="overflow-x-auto rounded-xl border border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedEmployeeEntries.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>{formatDate(expense.date)}</TableCell>
                          <TableCell className="text-muted-foreground">{expense.note || '-'}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(expense.amount, currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </div>
    </AdminShell>
  )
}

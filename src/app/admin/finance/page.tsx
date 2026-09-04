"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { ListChecks, Plus, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EXPENSE_CATEGORIES } from '@/lib/erp/standardChartOfAccounts'
import type { ExpenseInput } from '@/lib/erp/types'
import { useERP } from '@/lib/erp/provider'
import { formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

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
  const { data, hasPermission, saveExpense, updateExpenseApproval, deleteExpense } = useERP()
  const canApproveExpense = hasPermission('finance:edit')
  const [mode, setMode] = useState<'daily' | 'monthly'>('daily')
  const [selectedDate, setSelectedDate] = useState(dateInputValue())
  const [selectedMonth, setSelectedMonth] = useState(monthInputValue())
  const [feedback, setFeedback] = useState<string | null>(null)
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm)

  const expenses = useMemo(
    () => toArray(data?.expenses).sort((left, right) => right.date.localeCompare(left.date)),
    [data?.expenses]
  )
  const currency = data?.settings.currency

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) =>
      mode === 'daily' ? isSameDate(expense.date, selectedDate) : isSameMonth(expense.date, selectedMonth)
    )
  }, [mode, expenses, selectedDate, selectedMonth])

  const expenseTotal = useMemo(
    () => filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0),
    [filteredExpenses]
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
      }
      await saveExpense(input)
      setExpenseForm({ ...emptyExpenseForm, date: expenseForm.date })
      setFeedback('Expense recorded.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record expense.')
    }
  }

  async function handleDeleteExpense(expenseId: string) {
    setFeedback(null)

    try {
      await deleteExpense(expenseId)
      setFeedback('Expense removed.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete expense.')
    }
  }

  async function handleExpenseApproval(expenseId: string, approvalStatus: 'approved' | 'rejected') {
    setFeedback(null)

    try {
      await updateExpenseApproval(expenseId, approvalStatus)
      setFeedback(approvalStatus === 'approved' ? 'Expense approved.' : 'Expense rejected.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to update expense approval.')
    }
  }

  return (
    <AdminShell active="Expenses">
      <div className="space-y-8">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Reporting period</p>
            <p className="text-xs text-muted-foreground">Choose a day or month to scope the expenses below.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
            {mode === 'daily' ? (
              <Input className="w-full sm:w-52" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            ) : (
              <Input className="w-full sm:w-52" type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
            )}
          </div>
        </div>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <section className="space-y-4">
          <SectionHeader
            icon={ListChecks}
            title="Expenses"
            description="Record and review day-to-day running costs."
          />

          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Record expense</CardTitle>
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
                      onValueChange={(value) => setExpenseForm((current) => ({ ...current, category: value }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>{category}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                  <Button type="submit" className="rounded-xl">
                    <Plus className="mr-2 h-4 w-4" />
                    Save expense
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Expenses this period</CardTitle>
                <CardDescription>
                  Total: {formatCurrency(expenseTotal, currency)} · every entry sits at Pending until someone with Finance edit access approves or rejects it.
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
                        <TableHead>Approval</TableHead>
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
                            <Badge
                              variant="outline"
                              className={cn(
                                'rounded-full capitalize',
                                expense.approvalStatus === 'approved' &&
                                  'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
                                expense.approvalStatus === 'rejected' &&
                                  'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300',
                                expense.approvalStatus === 'pending' &&
                                  'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
                              )}
                            >
                              {expense.approvalStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {expense.approvalStatus === 'pending' && canApproveExpense ? (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg"
                                    onClick={() => void handleExpenseApproval(expense.id, 'approved')}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg text-destructive hover:text-destructive"
                                    onClick={() => void handleExpenseApproval(expense.id, 'rejected')}
                                  >
                                    Reject
                                  </Button>
                                </>
                              ) : null}
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
                          <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
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
      </div>
    </AdminShell>
  )
}

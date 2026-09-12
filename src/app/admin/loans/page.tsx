"use client"

import { useMemo, useState } from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarClock,
  HandCoins,
  Landmark,
  Pencil,
  Plus,
  Scale,
  Search,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import { CASH_MAINTENANCE_CATEGORIES, DIRECT_EXPENSE_CATEGORY } from '@/lib/erp/standardChartOfAccounts'
import type { CashMaintenanceRecord, InvestorRecord, LoanAccountRecord, LoanTransactionRecord, LoanTransactionType } from '@/lib/erp/types'
import {
  computeLoanBalance,
  computeLoanMonthlySchedule,
  formatCurrency,
  formatDate,
  sortByCreatedAtDesc,
  toArray,
} from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
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

const CASH_CATEGORY_OPTIONS = [...CASH_MAINTENANCE_CATEGORIES, DIRECT_EXPENSE_CATEGORY]

const emptyLoanAccountForm = { memberName: '', phone: '', address: '' }
type LoanAccountFormState = typeof emptyLoanAccountForm

const emptyLoanTransactionForm = {
  loanAccountId: '',
  type: 'withdrawal' as LoanTransactionType,
  amount: '',
  date: todayIso(),
  note: '',
}
type LoanTransactionFormState = typeof emptyLoanTransactionForm

const emptyCashForm = {
  category: CASH_MAINTENANCE_CATEGORIES[0] as string,
  amount: '',
  date: todayIso(),
  note: '',
}
type CashFormState = typeof emptyCashForm

const emptyInvestorForm = { name: '', location: '', mobile: '', products: '', amount: '', note: '' }
type InvestorFormState = typeof emptyInvestorForm

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof HandCoins
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

export default function LoanAndCashMaintenancePage() {
  const {
    data,
    saveLoanAccount,
    deleteLoanAccount,
    saveLoanTransaction,
    deleteLoanTransaction,
    saveCashMaintenance,
    deleteCashMaintenance,
    saveInvestor,
    deleteInvestor,
  } = useERP()

  const currency = data?.settings.currency

  const loanAccounts = useMemo(() => sortByCreatedAtDesc(toArray(data?.loanAccounts)), [data?.loanAccounts])
  const loanTransactions = useMemo(() => sortByCreatedAtDesc(toArray(data?.loanTransactions)), [data?.loanTransactions])
  const cashEntries = useMemo(() => sortByCreatedAtDesc(toArray(data?.cashMaintenance)), [data?.cashMaintenance])
  const investors = useMemo(() => sortByCreatedAtDesc(toArray(data?.investors)), [data?.investors])
  // Expenses (P&L chart) feed the reconciliation check below alongside Cash
  // Maintenance — both are real cash out, just posted to two different
  // charts (see CashMaintenanceRecord comment in types.ts).
  const expenses = useMemo(
    () => toArray(data?.expenses).filter((expense) => expense.approvalStatus !== 'rejected'),
    [data?.expenses]
  )
  const rateCards = useMemo(() => toArray(data?.rateCards), [data?.rateCards])

  const loanAccountOptions: ComboboxOption[] = useMemo(
    () => loanAccounts.map((account) => ({ value: account.id, label: account.memberName, sublabel: account.phone })),
    [loanAccounts]
  )

  // ---- Loan Accounts (Loan Chart) ------------------------------------------
  const [memberQuery, setMemberQuery] = useState('')
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [accountForm, setAccountForm] = useState<LoanAccountFormState>(emptyLoanAccountForm)
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)

  const filteredAccounts = useMemo(() => {
    const normalized = memberQuery.trim().toLowerCase()
    if (!normalized) return loanAccounts
    return loanAccounts.filter((account) =>
      [account.memberName, account.phone, account.address].join(' ').toLowerCase().includes(normalized)
    )
  }, [loanAccounts, memberQuery])

  const totalLoanBalance = useMemo(
    () => loanAccounts.reduce((sum, account) => sum + computeLoanBalance(data ?? null, account.id).balance, 0),
    [loanAccounts, data]
  )

  function openCreateAccount() {
    setEditingAccountId(null)
    setAccountForm(emptyLoanAccountForm)
    setAccountError(null)
    setAccountDialogOpen(true)
  }

  function openEditAccount(account: LoanAccountRecord) {
    setEditingAccountId(account.id)
    setAccountForm({ memberName: account.memberName, phone: account.phone, address: account.address ?? '' })
    setAccountError(null)
    setAccountDialogOpen(true)
  }

  async function handleSaveAccount() {
    setAccountError(null)
    setAccountSaving(true)
    try {
      await saveLoanAccount(accountForm, editingAccountId ?? undefined)
      setAccountDialogOpen(false)
    } catch (reason) {
      setAccountError(reason instanceof Error ? reason.message : 'Unable to save loan member.')
    } finally {
      setAccountSaving(false)
    }
  }

  async function handleDeleteAccount(account: LoanAccountRecord) {
    try {
      await deleteLoanAccount(account.id)
    } catch (reason) {
      setAccountError(reason instanceof Error ? reason.message : 'Unable to delete loan member.')
    }
  }

  // ---- Monthly Schedule (2026-09-12 client request) ------------------------
  // Toggled per loan member — click "Monthly schedule" on a member row to
  // show/hide a Sept→Dec-style running table for that one member, derived
  // fresh from computeLoanMonthlySchedule (never stored, see utils.ts).
  const [scheduleAccountId, setScheduleAccountId] = useState<string | null>(null)
  const scheduleAccount = scheduleAccountId ? loanAccounts.find((account) => account.id === scheduleAccountId) : null
  const monthlySchedule = useMemo(
    () => (scheduleAccountId ? computeLoanMonthlySchedule(data ?? null, scheduleAccountId) : []),
    [data, scheduleAccountId]
  )

  function toggleSchedule(accountId: string) {
    setScheduleAccountId((current) => (current === accountId ? null : accountId))
  }

  // ---- Loan Transactions (withdrawal / repayment) --------------------------
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false)
  const [transactionForm, setTransactionForm] = useState<LoanTransactionFormState>(emptyLoanTransactionForm)
  const [transactionSaving, setTransactionSaving] = useState(false)
  const [transactionError, setTransactionError] = useState<string | null>(null)

  function openCreateTransaction(type: LoanTransactionType, loanAccountId?: string) {
    setTransactionForm({ ...emptyLoanTransactionForm, type, loanAccountId: loanAccountId ?? '' })
    setTransactionError(null)
    setTransactionDialogOpen(true)
  }

  async function handleSaveTransaction() {
    setTransactionError(null)
    if (!transactionForm.loanAccountId) {
      setTransactionError('Pick a loan member.')
      return
    }
    const amount = Number(transactionForm.amount) || 0
    if (amount <= 0) {
      setTransactionError('Amount must be greater than zero.')
      return
    }
    setTransactionSaving(true)
    try {
      await saveLoanTransaction({
        loanAccountId: transactionForm.loanAccountId,
        type: transactionForm.type,
        amount,
        date: transactionForm.date,
        note: transactionForm.note || undefined,
      })
      setTransactionDialogOpen(false)
    } catch (reason) {
      setTransactionError(reason instanceof Error ? reason.message : 'Unable to record transaction.')
    } finally {
      setTransactionSaving(false)
    }
  }

  async function handleDeleteTransaction(transaction: LoanTransactionRecord) {
    try {
      await deleteLoanTransaction(transaction.id)
    } catch (reason) {
      setTransactionError(reason instanceof Error ? reason.message : 'Unable to delete transaction.')
    }
  }

  // ---- Investors -------------------------------------------------------------
  const [investorQuery, setInvestorQuery] = useState('')
  const [investorDialogOpen, setInvestorDialogOpen] = useState(false)
  const [editingInvestorId, setEditingInvestorId] = useState<string | null>(null)
  const [investorForm, setInvestorForm] = useState<InvestorFormState>(emptyInvestorForm)
  const [investorSaving, setInvestorSaving] = useState(false)
  const [investorError, setInvestorError] = useState<string | null>(null)

  const filteredInvestors = useMemo(() => {
    const normalized = investorQuery.trim().toLowerCase()
    if (!normalized) return investors
    return investors.filter((investor) =>
      [investor.name, investor.location, investor.mobile, investor.products].join(' ').toLowerCase().includes(normalized)
    )
  }, [investors, investorQuery])

  const totalInvested = useMemo(() => investors.reduce((sum, investor) => sum + investor.amount, 0), [investors])

  function openCreateInvestor() {
    setEditingInvestorId(null)
    setInvestorForm(emptyInvestorForm)
    setInvestorError(null)
    setInvestorDialogOpen(true)
  }

  function openEditInvestor(investor: InvestorRecord) {
    setEditingInvestorId(investor.id)
    setInvestorForm({
      name: investor.name,
      location: investor.location,
      mobile: investor.mobile,
      products: investor.products,
      amount: String(investor.amount),
      note: investor.note,
    })
    setInvestorError(null)
    setInvestorDialogOpen(true)
  }

  async function handleSaveInvestor() {
    setInvestorError(null)
    const amount = Number(investorForm.amount) || 0
    if (amount <= 0) {
      setInvestorError('Investment amount must be greater than zero.')
      return
    }
    setInvestorSaving(true)
    try {
      await saveInvestor(
        {
          name: investorForm.name,
          location: investorForm.location || undefined,
          mobile: investorForm.mobile,
          products: investorForm.products || undefined,
          amount,
          note: investorForm.note || undefined,
        },
        editingInvestorId ?? undefined
      )
      setInvestorDialogOpen(false)
    } catch (reason) {
      setInvestorError(reason instanceof Error ? reason.message : 'Unable to save investor.')
    } finally {
      setInvestorSaving(false)
    }
  }

  async function handleDeleteInvestor(investor: InvestorRecord) {
    try {
      await deleteInvestor(investor.id)
    } catch (reason) {
      setInvestorError(reason instanceof Error ? reason.message : 'Unable to delete investor.')
    }
  }

  // ---- Cash Maintenance Chart -----------------------------------------------
  const [cashMode, setCashMode] = useState<'daily' | 'monthly'>('monthly')
  const [cashDate, setCashDate] = useState(dateInputValue())
  const [cashMonth, setCashMonth] = useState(monthInputValue())
  const [cashDialogOpen, setCashDialogOpen] = useState(false)
  const [editingCashId, setEditingCashId] = useState<string | null>(null)
  const [cashForm, setCashForm] = useState<CashFormState>(emptyCashForm)
  const [cashSaving, setCashSaving] = useState(false)
  const [cashError, setCashError] = useState<string | null>(null)

  const filteredCashEntries = useMemo(() => {
    return cashEntries.filter((entry) =>
      cashMode === 'daily' ? isSameDate(entry.date, cashDate) : isSameMonth(entry.date, cashMonth)
    )
  }, [cashEntries, cashMode, cashDate, cashMonth])

  const cashOutTotal = useMemo(
    () => filteredCashEntries.filter((entry) => !entry.isDirectExpense).reduce((sum, entry) => sum + entry.amount, 0),
    [filteredCashEntries]
  )
  const directExpenseTotal = useMemo(
    () => filteredCashEntries.filter((entry) => entry.isDirectExpense).reduce((sum, entry) => sum + entry.amount, 0),
    [filteredCashEntries]
  )

  function openCreateCash() {
    setEditingCashId(null)
    setCashForm(emptyCashForm)
    setCashError(null)
    setCashDialogOpen(true)
  }

  function openEditCash(entry: CashMaintenanceRecord) {
    setEditingCashId(entry.id)
    setCashForm({
      category: entry.category,
      amount: String(entry.amount),
      date: entry.date,
      note: entry.note ?? '',
    })
    setCashError(null)
    setCashDialogOpen(true)
  }

  async function handleSaveCash() {
    setCashError(null)
    const amount = Number(cashForm.amount) || 0
    if (amount <= 0) {
      setCashError('Amount must be greater than zero.')
      return
    }
    setCashSaving(true)
    try {
      await saveCashMaintenance(
        {
          category: cashForm.category,
          amount,
          date: cashForm.date,
          note: cashForm.note || undefined,
        },
        editingCashId ?? undefined
      )
      setCashDialogOpen(false)
    } catch (reason) {
      setCashError(reason instanceof Error ? reason.message : 'Unable to record cash entry.')
    } finally {
      setCashSaving(false)
    }
  }

  async function handleDeleteCash(entry: CashMaintenanceRecord) {
    try {
      await deleteCashMaintenance(entry.id)
    } catch (reason) {
      setCashError(reason instanceof Error ? reason.message : 'Unable to delete cash entry.')
    }
  }

  // ---- Reconciliation (line 4 of the spec) ---------------------------------
  // Total cash-out = the Expense chart (P&L costs — Rent, Salary, Transport,
  // etc.) + the Cash Maintenance chart above (excluding direct-expense rows)
  // — both are real cash leaving the business, just posted to two different
  // charts. Total cash-in = new loan withdrawals + sales money/invoiced
  // amount, for the same period. A sanity check, not a posted figure — a gap
  // beyond a few taka flags a likely bookkeeping mismatch.
  const expenseTotalThisPeriod = useMemo(
    () =>
      expenses
        .filter((expense) => (cashMode === 'daily' ? isSameDate(expense.date, cashDate) : isSameMonth(expense.date, cashMonth)))
        .reduce((sum, expense) => sum + expense.amount, 0),
    [expenses, cashMode, cashDate, cashMonth]
  )
  const totalCashOut = cashOutTotal + expenseTotalThisPeriod
  const loanWithdrawalsThisPeriod = useMemo(
    () =>
      loanTransactions
        .filter((entry) => entry.type === 'withdrawal')
        .filter((entry) => (cashMode === 'daily' ? isSameDate(entry.date, cashDate) : isSameMonth(entry.date, cashMonth)))
        .reduce((sum, entry) => sum + entry.amount, 0),
    [loanTransactions, cashMode, cashDate, cashMonth]
  )
  const salesMoneyThisPeriod = useMemo(
    () =>
      rateCards
        .filter((card) => (cashMode === 'daily' ? isSameDate(card.date, cashDate) : isSameMonth(card.date, cashMonth)))
        .reduce((sum, card) => sum + card.dealerRateTotal, 0),
    [rateCards, cashMode, cashDate, cashMonth]
  )
  const totalCashIn = loanWithdrawalsThisPeriod + salesMoneyThisPeriod
  const reconciliationGap = totalCashIn - totalCashOut
  const isBalanced = Math.abs(reconciliationGap) < 1

  return (
    <AdminShell active="Loan & Cash Maintenance">
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Loan members</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{loanAccounts.length.toLocaleString('en-BD')}</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total loan balance outstanding</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">
                {formatCurrency(totalLoanBalance, currency)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Cash-out this period</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{formatCurrency(totalCashOut, currency)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Reconciliation</p>
              <p
                className={cn(
                  'mt-2 text-2xl font-semibold tracking-tight',
                  isBalanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                )}
              >
                {isBalanced ? 'Balanced' : formatCurrency(reconciliationGap, currency)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Loan Chart */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeader
              icon={Users}
              title="Loan Chart"
              description="Members/lenders the company has borrowed from — running balance falls with every repayment until it hits zero."
            />
            <div className="flex flex-wrap gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} className="pl-9" placeholder="Search member" />
              </div>
              <Button variant="outline" onClick={() => openCreateTransaction('withdrawal')}>
                <ArrowUpCircle className="mr-2 h-4 w-4" /> New Loan Withdrawal
              </Button>
              <Button onClick={openCreateAccount}>
                <HandCoins className="mr-2 h-4 w-4" /> Add Loan Member
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {accountError ? <p className="mb-3 text-sm text-destructive">{accountError}</p> : null}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Total Withdrawn</TableHead>
                    <TableHead className="text-right">Total Repaid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((account) => {
                    const totals = computeLoanBalance(data ?? null, account.id)
                    return (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.memberName}</TableCell>
                        <TableCell>{account.phone || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(totals.totalWithdrawn, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(totals.totalRepaid, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {totals.balance > 0 ? (
                            <Badge variant="outline" className="border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300">
                              {formatCurrency(totals.balance, currency)}
                            </Badge>
                          ) : totals.balance < 0 ? (
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">
                              Overpaid {formatCurrency(Math.abs(totals.balance), currency)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">Settled</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                Actions
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openCreateTransaction('withdrawal', account.id)}>
                                <ArrowUpCircle className="mr-2 h-4 w-4" /> New withdrawal
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openCreateTransaction('repayment', account.id)}>
                                <ArrowDownCircle className="mr-2 h-4 w-4" /> Record repayment
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleSchedule(account.id)}>
                                <CalendarClock className="mr-2 h-4 w-4" />
                                {scheduleAccountId === account.id ? 'Hide monthly schedule' : 'Monthly schedule'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditAccount(account)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteAccount(account)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {filteredAccounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        No loan members yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Schedule */}
        {scheduleAccount ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <SectionHeader
                icon={CalendarClock}
                title={`Monthly Schedule — ${scheduleAccount.memberName}`}
                description="Every calendar month from the first transaction through today — a month's closing balance is next month's opening, carrying straight across a year boundary."
              />
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Opening</TableHead>
                      <TableHead className="text-right">Withdrawn</TableHead>
                      <TableHead className="text-right">Repaid</TableHead>
                      <TableHead className="text-right">Closing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlySchedule.map((row, index) => {
                      const isLastRow = index === monthlySchedule.length - 1
                      const paidOff = isLastRow && row.closing <= 0
                      return (
                        <TableRow key={row.period}>
                          <TableCell className="font-medium">{row.monthLabel}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(row.opening, currency)}</TableCell>
                          <TableCell className="text-right tabular-nums text-amber-700 dark:text-amber-300">
                            {row.withdrawals > 0 ? formatCurrency(row.withdrawals, currency) : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                            {row.repayments > 0 ? formatCurrency(row.repayments, currency) : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {paidOff ? (
                              <Badge variant="outline" className="border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">
                                Paid off
                              </Badge>
                            ) : (
                              formatCurrency(row.closing, currency)
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {monthlySchedule.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                          No transactions recorded for this member yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Loan Transactions */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <SectionHeader
              icon={HandCoins}
              title="Loan Transactions"
              description="Every withdrawal and repayment, newest first — each repayment automatically brings the member's balance above down."
            />
          </CardHeader>
          <CardContent>
            {transactionError ? <p className="mb-3 text-sm text-destructive">{transactionError}</p> : null}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loanTransactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-medium">{transaction.memberName}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'rounded-full',
                            transaction.type === 'withdrawal'
                              ? 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
                              : 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                          )}
                        >
                          {transaction.type === 'withdrawal' ? 'Withdrawal' : 'Repayment'}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(transaction.date)}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground">{transaction.note || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(transaction.amount, currency)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteTransaction(transaction)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {loanTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        No loan transactions recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Investors */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeader
              icon={Landmark}
              title="Investors"
              description="Who has invested in the business, and how much — each investment also posts to the Cash Maintenance chart below."
            />
            <div className="flex flex-wrap gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={investorQuery}
                  onChange={(event) => setInvestorQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search investor, location, or product"
                />
              </div>
              <Button onClick={openCreateInvestor}>
                <Plus className="mr-2 h-4 w-4" /> Add Investor
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {investorError ? <p className="mb-3 text-sm text-destructive">{investorError}</p> : null}
            <div className="mb-4 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
              <span className="text-muted-foreground">Total invested</span>
              <p className="mt-1 text-lg font-semibold">{formatCurrency(totalInvested, currency)}</p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Investor</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvestors.map((investor) => (
                    <TableRow key={investor.id}>
                      <TableCell className="font-medium">{investor.name}</TableCell>
                      <TableCell className="text-muted-foreground">{investor.location || '—'}</TableCell>
                      <TableCell>{investor.mobile || '—'}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground">{investor.products || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(investor.amount, currency)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditInvestor(investor)} aria-label={`Edit ${investor.name}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteInvestor(investor)}
                            aria-label={`Delete ${investor.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredInvestors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        <Landmark className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        No investors on file yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Cash Maintenance Chart */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeader
              icon={Wallet}
              title="Cash Maintenance Chart"
              description="Loan repayment, new market investment, goods/packaging purchase, depot commission, and dealer payment for product transport — cash movements that don't post to the Expense chart."
            />
            <div className="flex flex-wrap gap-3">
              <Select value={cashMode} onValueChange={(value) => setCashMode(value as typeof cashMode)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
              {cashMode === 'daily' ? (
                <Input className="w-44" type="date" value={cashDate} onChange={(event) => setCashDate(event.target.value)} />
              ) : (
                <Input className="w-44" type="month" value={cashMonth} onChange={(event) => setCashMonth(event.target.value)} />
              )}
              <ExportMenu
                filenameBase="cash-maintenance"
                title="Cash Maintenance Chart"
                headers={['Date', 'Category', 'Amount', 'Direct Expense', 'Note']}
                rows={filteredCashEntries.map((entry) => [
                  entry.date,
                  entry.category,
                  entry.amount,
                  entry.isDirectExpense ? 'Yes' : 'No',
                  entry.note ?? '',
                ])}
              />
              <Button onClick={openCreateCash}>
                <Wallet className="mr-2 h-4 w-4" /> Record Cash Entry
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {cashError ? <p className="text-sm text-destructive">{cashError}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                <span className="text-muted-foreground">Cash-out total (excl. direct expense)</span>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(cashOutTotal, currency)}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                <span className="text-muted-foreground">Direct-expense entries (for reconciling only)</span>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(directExpenseTotal, currency)}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCashEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDate(entry.date)}</TableCell>
                      <TableCell className="font-medium">
                        {entry.category}
                        {entry.isDirectExpense ? (
                          <Badge variant="outline" className="ml-2 rounded-full text-[10px]">
                            Direct
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{entry.note || '-'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(entry.amount, currency)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditCash(entry)} aria-label="Edit cash entry">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteCash(entry)}
                            aria-label="Delete cash entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredCashEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No cash entries recorded for this period.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Reconciliation */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <SectionHeader
              icon={Scale}
              title="Cash Reconciliation"
              description="Total cash-in (new loan withdrawals + sales money) vs. total cash-out for the selected period — a gap flags a bookkeeping mismatch."
            />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-border/60 p-4">
                <p className="text-sm font-medium text-foreground">Cash In</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">New loan withdrawals</span>
                  <span className="tabular-nums">{formatCurrency(loanWithdrawalsThisPeriod, currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sales money (invoiced)</span>
                  <span className="tabular-nums">{formatCurrency(salesMoneyThisPeriod, currency)}</span>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-2 text-sm font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(totalCashIn, currency)}</span>
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-border/60 p-4">
                <p className="text-sm font-medium text-foreground">Cash Out</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Expense chart total</span>
                  <span className="tabular-nums">{formatCurrency(expenseTotalThisPeriod, currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cash Maintenance chart total</span>
                  <span className="tabular-nums">{formatCurrency(cashOutTotal, currency)}</span>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-2 text-sm font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(totalCashOut, currency)}</span>
                </div>
              </div>
            </div>
            <div
              className={cn(
                'mt-4 flex items-center justify-between rounded-xl border p-4 text-sm',
                isBalanced
                  ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                  : 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
              )}
            >
              <span className="font-medium">{isBalanced ? 'Books balanced for this period.' : 'Mismatch found for this period.'}</span>
              <span className="tabular-nums font-semibold">{formatCurrency(reconciliationGap, currency)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loan member dialog */}
      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAccountId ? 'Edit loan member' : 'Add loan member'}</DialogTitle>
            <DialogDescription>Who the company has borrowed (or will borrow) from.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {accountError ? <p className="text-sm text-destructive">{accountError}</p> : null}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Member name</label>
              <Input value={accountForm.memberName} onChange={(event) => setAccountForm((current) => ({ ...current, memberName: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input value={accountForm.phone} onChange={(event) => setAccountForm((current) => ({ ...current, phone: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Address</label>
              <Textarea value={accountForm.address} onChange={(event) => setAccountForm((current) => ({ ...current, address: event.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAccount} disabled={accountSaving}>
              {accountSaving ? 'Saving…' : 'Save member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loan transaction dialog */}
      <Dialog open={transactionDialogOpen} onOpenChange={setTransactionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{transactionForm.type === 'withdrawal' ? 'New loan withdrawal' : 'Record loan repayment'}</DialogTitle>
            <DialogDescription>
              {transactionForm.type === 'withdrawal'
                ? 'Raises the member’s outstanding balance.'
                : 'Lowers the member’s outstanding balance — reaches zero once fully repaid.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {transactionError ? <p className="text-sm text-destructive">{transactionError}</p> : null}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Loan member</label>
              <Combobox
                options={loanAccountOptions}
                value={transactionForm.loanAccountId}
                onChange={(value) => setTransactionForm((current) => ({ ...current, loanAccountId: value }))}
                placeholder="Select member"
                searchPlaceholder="Search member"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select
                value={transactionForm.type}
                onValueChange={(value) => setTransactionForm((current) => ({ ...current, type: value as LoanTransactionType }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="withdrawal">New withdrawal</SelectItem>
                  <SelectItem value="repayment">Repayment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Amount</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={transactionForm.amount}
                  onChange={(event) => setTransactionForm((current) => ({ ...current, amount: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input type="date" value={transactionForm.date} onChange={(event) => setTransactionForm((current) => ({ ...current, date: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Note</label>
              <Textarea value={transactionForm.note} onChange={(event) => setTransactionForm((current) => ({ ...current, note: event.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTransaction} disabled={transactionSaving}>
              {transactionSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cash Maintenance dialog */}
      <Dialog open={cashDialogOpen} onOpenChange={setCashDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCashId ? 'Edit cash entry' : 'Record cash entry'}</DialogTitle>
            <DialogDescription>
              Pick “{DIRECT_EXPENSE_CATEGORY}” for an entry that&apos;s only for matching the books — it won&apos;t count against the cash-out total.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {cashError ? <p className="text-sm text-destructive">{cashError}</p> : null}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Category<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Select value={cashForm.category} onValueChange={(value) => setCashForm((current) => ({ ...current, category: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CASH_CATEGORY_OPTIONS.map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Amount</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashForm.amount}
                  onChange={(event) => setCashForm((current) => ({ ...current, amount: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input type="date" value={cashForm.date} onChange={(event) => setCashForm((current) => ({ ...current, date: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Note</label>
              <Textarea value={cashForm.note} onChange={(event) => setCashForm((current) => ({ ...current, note: event.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCashDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCash} disabled={cashSaving}>
              {cashSaving ? 'Saving…' : 'Save entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Investor dialog */}
      <Dialog open={investorDialogOpen} onOpenChange={setInvestorDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingInvestorId ? 'Edit investor' : 'Add investor'}</DialogTitle>
            <DialogDescription>Name, mobile, and amount are required; location, products, and note are optional.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {investorError ? <p className="text-sm text-destructive">{investorError}</p> : null}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Investor name</label>
              <Input value={investorForm.name} onChange={(event) => setInvestorForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Mobile</label>
                <Input value={investorForm.mobile} onChange={(event) => setInvestorForm((current) => ({ ...current, mobile: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Location</label>
                <Input value={investorForm.location} onChange={(event) => setInvestorForm((current) => ({ ...current, location: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Products</label>
              <Input
                value={investorForm.products}
                onChange={(event) => setInvestorForm((current) => ({ ...current, products: event.target.value }))}
                placeholder="Which product(s) this investment is tied to, if any"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Amount</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={investorForm.amount}
                onChange={(event) => setInvestorForm((current) => ({ ...current, amount: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Note</label>
              <Textarea value={investorForm.note} onChange={(event) => setInvestorForm((current) => ({ ...current, note: event.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvestorDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveInvestor} disabled={investorSaving}>
              {investorSaving ? 'Saving…' : 'Save investor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

"use client"

import { useMemo, useState } from 'react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarClock,
  HandCoins,
  History,
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
import {
  CASH_DEFAULT_OUT_CATEGORY,
  CASH_IN_CATEGORIES,
  CASH_MAINTENANCE_CATEGORIES,
  CASH_QUICK_CATEGORIES,
  DIRECT_EXPENSE_CATEGORY,
} from '@/lib/erp/standardChartOfAccounts'
import type { CashDirection, CashMaintenanceRecord, InvestorRecord, LoanAccountRecord, LoanTransactionRecord, LoanTransactionType } from '@/lib/erp/types'
import {
  computeLoanBalance,
  computeLoanMonthlySchedule,
  formatCurrency,
  formatDate,
  isCashMaintenanceIn,
  isCashMaintenanceOut,
  sortByCreatedAtDesc,
  toArray,
} from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

// Asia/Dhaka calendar date (the company's timezone), not UTC — toISOString()
// gave the previous day for anything entered before 6am local time.
const dhakaDateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' })

function todayIso() {
  return dhakaDateFormat.format(new Date())
}

function dateInputValue(date = new Date()) {
  return dhakaDateFormat.format(date)
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

function isBeforeDate(value: string, target: string) {
  return value.slice(0, 10) < target
}

const CASH_OUT_CATEGORY_OPTIONS: string[] = [...CASH_MAINTENANCE_CATEGORIES, DIRECT_EXPENSE_CATEGORY]
const CASH_IN_CATEGORY_OPTIONS: string[] = [...CASH_IN_CATEGORIES]

const emptyLoanAccountForm = { memberName: '', phone: '', address: '' }
type LoanAccountFormState = typeof emptyLoanAccountForm

const emptyLoanTransactionForm = {
  loanAccountId: '',
  type: 'withdrawal' as LoanTransactionType,
  amount: '',
  date: todayIso(),
  note: '',
  isOpeningBalance: false,
  // Only meaningful when type === 'repayment' — which chart the repayment's
  // real cash-out posts to (2026-09-15 client request).
  postAs: 'cash_maintenance' as 'cash_maintenance' | 'expense',
}
type LoanTransactionFormState = typeof emptyLoanTransactionForm

// A function, not a constant: the date must be "today" when the dialog opens,
// not when this module first loaded.
function newCashForm() {
  return {
    direction: 'out' as CashDirection,
    category: CASH_DEFAULT_OUT_CATEGORY as string,
    amount: '',
    date: todayIso(),
    note: '',
  }
}
type CashFormState = ReturnType<typeof newCashForm>

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

// One screen, two sidebar entries (2026-09-22 client request): 'loans' shows
// the Loan Chart / repayments / investors, 'cash' shows only the Cash
// Maintenance chart + Daily Cash Book/reconciliation, so cash entries aren't
// buried under the loan tables.
export type LoansCashView = 'loans' | 'cash'

export function LoansCashScreen({ view }: { view: LoansCashView }) {
  const showLoans = view === 'loans'
  const showCash = view === 'cash'
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
  // Repayments posted "as Expense" (client request, 2026-09-15): unlike a
  // repayment posted "as Cash Maintenance" — which shows up in the Cash
  // Maintenance Chart section below — one posted as Expense only ever lived
  // on the separate Finance/Expenses page, invisible from here. Mirrors that
  // Cash Maintenance Chart section so both paths are visible and editable
  // on this same page; editing goes through the loan transaction (not a
  // separate expense form) since saveLoanTransaction is what keeps the
  // linked expense + ledger entries in sync.
  const expenseRepayments = useMemo(
    () =>
      loanTransactions
        .filter((transaction) => transaction.type === 'repayment' && transaction.expenseId)
        .map((transaction) => ({
          transaction,
          approvalStatus: data?.expenses?.[transaction.expenseId!]?.approvalStatus ?? 'pending',
        })),
    [loanTransactions, data?.expenses]
  )
  const cashEntries = useMemo(() => sortByCreatedAtDesc(toArray(data?.cashMaintenance)), [data?.cashMaintenance])
  const investors = useMemo(() => sortByCreatedAtDesc(toArray(data?.investors)), [data?.investors])
  const collections = useMemo(() => toArray(data?.collections), [data?.collections])
  // Expenses (P&L chart) feed the reconciliation check below alongside Cash
  // Maintenance — both are real cash out, just posted to two different
  // charts (see CashMaintenanceRecord comment in types.ts).
  const expenses = useMemo(
    () => toArray(data?.expenses).filter((expense) => expense.approvalStatus !== 'rejected'),
    [data?.expenses]
  )
  const rateCards = useMemo(() => toArray(data?.rateCards), [data?.rateCards])
  // Actual cash collected from dealers (client request, 2026-09-13 — the
  // Reconciliation card below used to sum invoiced value, not cash actually
  // received, which is why it never matched the manual daily tally): the
  // amount paid at invoice-creation time (attributed to the invoice's own
  // date) plus every CollectionRecord since (attributed to its own
  // collection date) — mirrors saveRateCard/recordCollection's paid/due
  // split in provider.tsx exactly.
  const collectedCashRows = useMemo(() => {
    const collectionsByRateCardId = new Map<string, number>()
    for (const collection of collections) {
      collectionsByRateCardId.set(collection.rateCardId, (collectionsByRateCardId.get(collection.rateCardId) ?? 0) + collection.amount)
    }
    const rows: Array<{ date: string; amount: number }> = []
    for (const card of rateCards) {
      const initialPaid = (card.paid ?? 0) - (collectionsByRateCardId.get(card.id) ?? 0)
      if (initialPaid > 0) rows.push({ date: card.date, amount: initialPaid })
    }
    for (const collection of collections) {
      rows.push({ date: collection.collectionDate, amount: collection.amount })
    }
    return rows
  }, [rateCards, collections])

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
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null)
  const [transactionForm, setTransactionForm] = useState<LoanTransactionFormState>(emptyLoanTransactionForm)
  const [transactionSaving, setTransactionSaving] = useState(false)
  const [transactionError, setTransactionError] = useState<string | null>(null)

  function openCreateTransaction(type: LoanTransactionType, loanAccountId?: string, isOpeningBalance?: boolean) {
    setEditingTransactionId(null)
    setTransactionForm({
      ...emptyLoanTransactionForm,
      type,
      loanAccountId: loanAccountId ?? '',
      isOpeningBalance: Boolean(isOpeningBalance),
    })
    setTransactionError(null)
    setTransactionDialogOpen(true)
  }

  function openEditTransaction(transaction: LoanTransactionRecord) {
    setEditingTransactionId(transaction.id)
    setTransactionForm({
      loanAccountId: transaction.loanAccountId,
      type: transaction.type,
      amount: String(transaction.amount),
      date: transaction.date.slice(0, 10),
      note: transaction.note ?? '',
      isOpeningBalance: Boolean(transaction.isOpeningBalance),
      postAs: transaction.expenseId ? 'expense' : 'cash_maintenance',
    })
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
      await saveLoanTransaction(
        {
          loanAccountId: transactionForm.loanAccountId,
          type: transactionForm.type,
          amount,
          date: transactionForm.date,
          note: transactionForm.note || undefined,
          isOpeningBalance: transactionForm.isOpeningBalance,
          postAs: transactionForm.postAs,
        },
        editingTransactionId ?? undefined
      )
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
  const [cashForm, setCashForm] = useState<CashFormState>(newCashForm)
  const [cashSaving, setCashSaving] = useState(false)
  const [cashError, setCashError] = useState<string | null>(null)

  const filteredCashEntries = useMemo(() => {
    return cashEntries.filter((entry) =>
      cashMode === 'daily' ? isSameDate(entry.date, cashDate) : isSameMonth(entry.date, cashMonth)
    )
  }, [cashEntries, cashMode, cashDate, cashMonth])

  const cashOutTotal = useMemo(
    () => filteredCashEntries.filter(isCashMaintenanceOut).reduce((sum, entry) => sum + entry.amount, 0),
    [filteredCashEntries]
  )
  const cashMaintenanceInTotal = useMemo(
    () => filteredCashEntries.filter(isCashMaintenanceIn).reduce((sum, entry) => sum + entry.amount, 0),
    [filteredCashEntries]
  )
  const directExpenseTotal = useMemo(
    () => filteredCashEntries.filter((entry) => entry.direction !== 'in' && entry.isDirectExpense).reduce((sum, entry) => sum + entry.amount, 0),
    [filteredCashEntries]
  )

  // "খাত অনুযায়ী মোট" (client request, 2026-09-13): the flat entry list above
  // only shows the Cash Maintenance chart's own categories (পণ্য ক্রয়,
  // প্যাকেজিং, ডিপো ভাড়া, ...); a Cash Maintenance cash-out and an Expense's
  // cash-out never land in the same table anywhere else in the app, so this
  // merges both —
  // same category+total shape as the Expense chart's "By category" table on
  // the Finance page — for the one number a client actually wants: total
  // spend per sector this period, cash-maintenance and expense combined.
  const cashCategoryTotals = useMemo(() => {
    const rows = new Map<string, { category: string; count: number; total: number }>()
    function add(category: string, amount: number) {
      const existing = rows.get(category)
      if (existing) {
        existing.count += 1
        existing.total += amount
      } else {
        rows.set(category, { category, count: 1, total: amount })
      }
    }
    filteredCashEntries.filter(isCashMaintenanceOut).forEach((entry) => add(entry.category, entry.amount))
    expenses
      .filter((expense) => (cashMode === 'daily' ? isSameDate(expense.date, cashDate) : isSameMonth(expense.date, cashMonth)))
      .forEach((expense) => add(expense.category, expense.amount))
    return Array.from(rows.values()).sort((left, right) => right.total - left.total)
  }, [filteredCashEntries, expenses, cashMode, cashDate, cashMonth])

  function openCreateCash() {
    setEditingCashId(null)
    setCashForm(newCashForm())
    setCashError(null)
    setCashDialogOpen(true)
  }

  function openEditCash(entry: CashMaintenanceRecord) {
    setEditingCashId(entry.id)
    setCashForm({
      direction: entry.direction === 'in' ? 'in' : 'out',
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
          direction: cashForm.direction,
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
  // charts. Total cash-in = new loan withdrawals + sales money actually
  // collected from dealers (collectedCashRows above), for the same period.
  // A sanity check, not a posted figure — a gap beyond a few taka flags a
  // likely bookkeeping mismatch.
  const expenseTotalThisPeriod = useMemo(
    () =>
      expenses
        .filter((expense) => (cashMode === 'daily' ? isSameDate(expense.date, cashDate) : isSameMonth(expense.date, cashMonth)))
        .reduce((sum, expense) => sum + expense.amount, 0),
    [expenses, cashMode, cashDate, cashMonth]
  )
  const totalCashOut = cashOutTotal + expenseTotalThisPeriod
  // isOpeningBalance withdrawals ("Existing Loan") are excluded here (2026-09-14
  // fix) — that money was borrowed before this system was in use, so whatever
  // date it's logged under, it was never actual cash received during a period
  // this reconciliation tracks. Counting it as this-period Cash In was
  // producing a large false "mismatch" whenever an Existing Loan entry's date
  // happened to fall inside the selected period (e.g. left at today's default
  // instead of backdated to when the loan actually started).
  const loanWithdrawalsThisPeriod = useMemo(
    () =>
      loanTransactions
        .filter((entry) => entry.type === 'withdrawal' && !entry.isOpeningBalance)
        .filter((entry) => (cashMode === 'daily' ? isSameDate(entry.date, cashDate) : isSameMonth(entry.date, cashMonth)))
        .reduce((sum, entry) => sum + entry.amount, 0),
    [loanTransactions, cashMode, cashDate, cashMonth]
  )
  const salesMoneyThisPeriod = useMemo(
    () =>
      collectedCashRows
        .filter((row) => (cashMode === 'daily' ? isSameDate(row.date, cashDate) : isSameMonth(row.date, cashMonth)))
        .reduce((sum, row) => sum + row.amount, 0),
    [collectedCashRows, cashMode, cashDate, cashMonth]
  )
  const totalCashIn = loanWithdrawalsThisPeriod + salesMoneyThisPeriod + cashMaintenanceInTotal
  const reconciliationGap = totalCashIn - totalCashOut
  const isBalanced = Math.abs(reconciliationGap) < 1

  // Opening/Closing balance (client's daily cash-book request, 2026-09-13:
  // "গতকালের জমা" carrying into today's tally, ending in a "নিট ক্যাশ
  // স্থিতি") — derived, not stored, same as every other running balance in
  // this codebase (computeLoanBalance, Budget's Actual, etc.): the sum of
  // every cash-in/cash-out source this card already tracks, for everything
  // dated strictly before the selected period. Assumes the books start at
  // zero on the very first transaction on file — if the business actually
  // had cash on hand before that, Opening Balance here will read low by
  // that fixed amount for every period, consistently.
  const periodStartDate = cashMode === 'daily' ? cashDate : `${cashMonth}-01`
  const openingBalance = useMemo(() => {
    const cashInBefore =
      loanTransactions
        .filter((entry) => entry.type === 'withdrawal' && !entry.isOpeningBalance && isBeforeDate(entry.date, periodStartDate))
        .reduce((sum, entry) => sum + entry.amount, 0) +
      collectedCashRows
        .filter((row) => isBeforeDate(row.date, periodStartDate))
        .reduce((sum, row) => sum + row.amount, 0) +
      cashEntries
        .filter((entry) => isCashMaintenanceIn(entry) && isBeforeDate(entry.date, periodStartDate))
        .reduce((sum, entry) => sum + entry.amount, 0)
    const cashOutBefore =
      expenses
        .filter((expense) => isBeforeDate(expense.date, periodStartDate))
        .reduce((sum, expense) => sum + expense.amount, 0) +
      cashEntries
        .filter((entry) => isCashMaintenanceOut(entry) && isBeforeDate(entry.date, periodStartDate))
        .reduce((sum, entry) => sum + entry.amount, 0)
    return cashInBefore - cashOutBefore
  }, [loanTransactions, collectedCashRows, expenses, cashEntries, periodStartDate])
  const closingBalance = openingBalance + totalCashIn - totalCashOut

  return (
    <AdminShell active={showCash ? 'Cash Maintenance' : 'Loan Chart'}>
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {showLoans ? (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Loan members</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{loanAccounts.length.toLocaleString('en-BD')}</p>
            </CardContent>
          </Card>
          ) : null}
          {showLoans ? (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total loan balance outstanding</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">
                {formatCurrency(totalLoanBalance, currency)}
              </p>
            </CardContent>
          </Card>
          ) : null}
          {showCash ? (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Cash-out this period</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{formatCurrency(totalCashOut, currency)}</p>
            </CardContent>
          </Card>
          ) : null}
          {showCash ? (
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
          ) : null}
        </div>

        {showLoans ? (
          <>
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
              <Button variant="outline" onClick={() => openCreateTransaction('withdrawal', undefined, true)}>
                <History className="mr-2 h-4 w-4" /> Existing Loan
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
                              <DropdownMenuItem onClick={() => openCreateTransaction('withdrawal', account.id, true)}>
                                <History className="mr-2 h-4 w-4" /> Existing loan
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
                            transaction.isOpeningBalance
                              ? 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300'
                              : transaction.type === 'withdrawal'
                                ? 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
                                : 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                          )}
                        >
                          {transaction.isOpeningBalance ? 'Existing Loan' : transaction.type === 'withdrawal' ? 'Withdrawal' : 'Repayment'}
                        </Badge>
                        {transaction.type === 'repayment' && !transaction.isOpeningBalance ? (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {transaction.expenseId ? '(as Expense)' : '(as Cash Maintenance)'}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatDate(transaction.date)}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground">{transaction.note || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(transaction.amount, currency)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditTransaction(transaction)} aria-label="Edit transaction">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteTransaction(transaction)}
                            aria-label="Delete transaction"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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

        {/* Loan Repayments posted as Expense */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <SectionHeader
              icon={HandCoins}
              title="Loan Repayments — Posted as Expense"
              description="Repayments posted as Direct Expense (Operating Cost) instead of Cash Maintenance — these also show on the Finance › Expenses page, but can be edited from here."
            />
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseRepayments.map(({ transaction, approvalStatus }) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-medium">{transaction.memberName}</TableCell>
                      <TableCell>{formatDate(transaction.date)}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground">{transaction.note || '—'}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'rounded-full',
                            approvalStatus === 'approved'
                              ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                              : approvalStatus === 'rejected'
                                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                : 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
                          )}
                        >
                          {approvalStatus === 'approved' ? 'Approved' : approvalStatus === 'rejected' ? 'Rejected' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(transaction.amount, currency)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditTransaction(transaction)} aria-label="Edit repayment">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteTransaction(transaction)}
                            aria-label="Delete repayment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {expenseRepayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        No repayments posted as Expense yet.
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
          </>
        ) : null}

        {showCash ? (
          <>
        {/* Cash Maintenance Chart */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeader
              icon={Wallet}
              title="Cash Maintenance Chart"
              description="পণ্য ক্রয়, পাউচ/প্যাকেট ও ডিপো ভাড়া সহ ক্যাশ জমা-খরচ এখানে সরাসরি এন্ট্রি দিন — এগুলো প্রফিটে হিট করে না। Purchase সেকশন থেকে এখানে আর অটো পোস্ট হয় না।"
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
                headers={['Date', 'Category', 'Direction', 'Amount', 'Direct Expense', 'Note']}
                rows={filteredCashEntries.map((entry) => [
                  entry.date,
                  entry.category,
                  entry.direction === 'in' ? 'Cash In' : 'Cash Out',
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                <span className="text-muted-foreground">Cash-in total (Cash Maintenance)</span>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(cashMaintenanceInTotal, currency)}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                <span className="text-muted-foreground">Cash-out total (excl. direct expense)</span>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(cashOutTotal, currency)}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                <span className="text-muted-foreground">Direct-expense entries (for reconciling only)</span>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(directExpenseTotal, currency)}</p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <span className="text-muted-foreground">Total cash-out (Cash Maintenance + Expense)</span>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(totalCashOut, currency)}</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">By category — কোন খাতে কত গেছে</p>
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Entries</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashCategoryTotals.map((row) => (
                      <TableRow key={row.category}>
                        <TableCell className="font-medium">{row.category}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(row.total, currency)}</TableCell>
                      </TableRow>
                    ))}
                    {cashCategoryTotals.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                          No cash-out recorded for this period.
                        </TableCell>
                      </TableRow>
                    ) : null}
                    <TableRow className="bg-muted/30 font-semibold hover:bg-muted/30">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {cashCategoryTotals.reduce((sum, row) => sum + row.count, 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(totalCashOut, currency)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
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
                        {entry.direction === 'in' ? (
                          <Badge variant="outline" className="ml-2 rounded-full border-emerald-300 text-[10px] text-emerald-700 dark:text-emerald-300">
                            Cash In
                          </Badge>
                        ) : null}
                        {entry.isDirectExpense ? (
                          <Badge variant="outline" className="ml-2 rounded-full text-[10px]">
                            Direct
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{entry.note || '-'}</TableCell>
                      <TableCell
                        className={cn('text-right tabular-nums', entry.direction === 'in' && 'text-emerald-600 dark:text-emerald-400')}
                      >
                        {entry.direction === 'in' ? '+' : ''}
                        {formatCurrency(entry.amount, currency)}
                      </TableCell>
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
              title="Daily Cash Book"
              description="Opening balance carried from before this period, plus cash-in, minus cash-out — same tally as the manual daily cash sheet, ending in a Net Cash Position."
            />
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-4 text-sm">
              <span className="font-medium text-foreground">
                Opening balance ({cashMode === 'daily' ? 'as of yesterday' : 'as of last month'})
              </span>
              <span className="tabular-nums font-semibold">{formatCurrency(openingBalance, currency)}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-border/60 p-4">
                <p className="text-sm font-medium text-foreground">Cash In</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">New loan withdrawals</span>
                  <span className="tabular-nums">{formatCurrency(loanWithdrawalsThisPeriod, currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sales money (collected)</span>
                  <span className="tabular-nums">{formatCurrency(salesMoneyThisPeriod, currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Other cash received (Cash Maintenance)</span>
                  <span className="tabular-nums">{formatCurrency(cashMaintenanceInTotal, currency)}</span>
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
            <div className="mt-3 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
              <span className="font-medium text-foreground">নিট ক্যাশ স্থিতি — Net Cash Position (closing)</span>
              <span className="text-lg font-semibold tabular-nums">{formatCurrency(closingBalance, currency)}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Opening + Cash In − Cash Out. &quot;Sales money&quot; is actual cash collected from dealers (invoice-time
              payment + every Collection recorded on the Invoice page) — not the invoice total, which may still be
              partly due.
            </p>
          </CardContent>
        </Card>
          </>
        ) : null}
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
            <DialogTitle>
              {editingTransactionId
                ? 'Edit loan transaction'
                : transactionForm.isOpeningBalance
                  ? 'Add existing loan'
                  : transactionForm.type === 'withdrawal'
                    ? 'New loan withdrawal'
                    : 'Record loan repayment'}
            </DialogTitle>
            <DialogDescription>
              {editingTransactionId
                ? 'Update the details of this transaction.'
                : transactionForm.isOpeningBalance
                  ? 'For a loan the member already had outstanding before this system was in use. Set the date to when the loan actually started — the balance and Monthly Schedule both key off it.'
                  : transactionForm.type === 'withdrawal'
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
            {transactionForm.isOpeningBalance ? null : (
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
            )}
            {!transactionForm.isOpeningBalance && transactionForm.type === 'repayment' ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Post this repayment as</label>
                <Select
                  value={transactionForm.postAs}
                  onValueChange={(value) => setTransactionForm((current) => ({ ...current, postAs: value as 'cash_maintenance' | 'expense' }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash_maintenance">Cash Maintenance (doesn&apos;t affect net profit)</SelectItem>
                    <SelectItem value="expense">Direct Expense (Operating Cost — hits net profit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {transactionForm.isOpeningBalance ? 'Outstanding amount' : 'Amount'}
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={transactionForm.amount}
                  onChange={(event) => setTransactionForm((current) => ({ ...current, amount: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  {transactionForm.isOpeningBalance ? 'Loan start date' : 'Date'}
                </label>
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
              ক্যাশ ইন টাকা বাড়ায়, ক্যাশ আউট টাকা কমায় — কোনোটাই প্রফিটে হিট করে না।
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {cashError ? <p className="text-sm text-destructive">{cashError}</p> : null}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Type</p>
              <div className="grid grid-cols-2 gap-2">
                {(['out', 'in'] as const).map((direction) => (
                  <Button
                    key={direction}
                    type="button"
                    variant={cashForm.direction === direction ? 'default' : 'outline'}
                    onClick={() =>
                      setCashForm((current) =>
                        current.direction === direction
                          ? current
                          : {
                              ...current,
                              direction,
                              category: direction === 'in' ? CASH_IN_CATEGORY_OPTIONS[0] : CASH_DEFAULT_OUT_CATEGORY,
                            }
                      )
                    }
                  >
                    {direction === 'in' ? 'Cash In (জমা)' : 'Cash Out (খরচ)'}
                  </Button>
                ))}
              </div>
            </div>
            {cashForm.direction === 'out' ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">দ্রুত বাছুন</p>
                <div className="grid grid-cols-3 gap-2">
                  {CASH_QUICK_CATEGORIES.map((quick) => (
                    <Button
                      key={quick.category}
                      type="button"
                      size="sm"
                      variant={cashForm.category === quick.category ? 'default' : 'outline'}
                      onClick={() => setCashForm((current) => ({ ...current, category: quick.category }))}
                    >
                      {quick.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Category<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Select value={cashForm.category} onValueChange={(value) => setCashForm((current) => ({ ...current, category: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(cashForm.direction === 'in' ? CASH_IN_CATEGORY_OPTIONS : CASH_OUT_CATEGORY_OPTIONS).map((category) => (
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

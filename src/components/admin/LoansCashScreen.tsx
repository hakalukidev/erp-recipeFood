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
import { CashCategoryStatement } from '@/components/admin/CashCategoryStatement'
import { RecordApprovalTag } from '@/components/admin/ApprovalStatusBadge'
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
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { BOOKS_START_DATE } from '@/lib/erp/companyInfo'
import { useERP } from '@/lib/erp/provider'
import {
  CASH_CATEGORY_ADVANCE_SALARY,
  CASH_CATEGORY_DAMAGE,
  CASH_DEFAULT_OUT_CATEGORY,
  CASH_IN_CATEGORIES,
  CASH_MAINTENANCE_CATEGORIES,
  CASH_PNL_EXPENSE_CATEGORIES,
  CASH_QUICK_CATEGORIES,
  DIRECT_EXPENSE_CATEGORY,
} from '@/lib/erp/standardChartOfAccounts'
import type { CashDirection, CashMaintenanceRecord, InvestorRecord, LoanAccountRecord, LoanTransactionRecord, LoanTransactionType } from '@/lib/erp/types'
import {
  computeLoanBalance,
  loanTransactionTypeLabel,
  computeLoanMonthlySchedule,
  employeeAdvanceOutstanding,
  expenseCategoryLabel,
  formatCurrency,
  formatDate,
  isCashMaintenanceIn,
  isCashMaintenanceOut,
  isCountedEntry,
  isLegacyCollection,
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
  return dhakaDateFormat.format(date).slice(0, 7)
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

// Counts toward an opening balance: dated before the period, but not before
// the books started (BOOKS_START_DATE — opening balance is zero then).
function isOpeningDate(value: string, periodStart: string) {
  const date = value.slice(0, 10)
  return date >= BOOKS_START_DATE && date < periodStart
}

const CASH_OUT_CATEGORY_OPTIONS: string[] = [
  ...CASH_MAINTENANCE_CATEGORIES,
  CASH_CATEGORY_ADVANCE_SALARY,
  CASH_CATEGORY_DAMAGE,
  DIRECT_EXPENSE_CATEGORY,
]
const CASH_IN_CATEGORY_OPTIONS: string[] = [...CASH_IN_CATEGORIES]

const emptyLoanAccountForm = { memberName: '', phone: '', address: '', balance: '' }
type LoanAccountFormState = typeof emptyLoanAccountForm

const emptyLoanTransactionForm = {
  loanAccountId: '',
  type: 'withdrawal' as LoanTransactionType,
  amount: '',
  date: todayIso(),
  note: '',
  isOpeningBalance: false,
  // Balance correction from "Edit loan member" — carried through an edit so
  // it stays cash-free (see LoanTransactionRecord.isAdjustment).
  isAdjustment: false,
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
    productReturnId: '',
    employeeName: '',
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
  // Product Returns a Damage cash entry can be linked to (newest first).
  const productReturnOptions = useMemo(
    () => sortByCreatedAtDesc(toArray(data?.productReturns)).filter((entry) => entry.approvalStatus !== 'rejected'),
    [data?.productReturns]
  )
  // Names already used for salary / advance salary, for the Advance Salary
  // employee <datalist> (free text — no employee master, see
  // ExpenseRecord.employeeName).
  const employeeNameSuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          [...toArray(data?.expenses).map((expense) => expense.employeeName), ...toArray(data?.cashMaintenance).map((entry) => entry.employeeName)]
            .map((name) => name?.trim())
            .filter((name): name is string => !!name)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [data?.expenses, data?.cashMaintenance]
  )
  const investors = useMemo(() => sortByCreatedAtDesc(toArray(data?.investors)), [data?.investors])
  // Cash figures skip rejected entries (isCountedEntry), same as Fund/Cash Flow.
  const collections = useMemo(() => toArray(data?.collections).filter(isCountedEntry), [data?.collections])
  // Expenses (P&L chart) feed the reconciliation check below alongside Cash
  // Maintenance — both are real cash out, just posted to two different
  // charts (see CashMaintenanceRecord comment in types.ts).
  const expenses = useMemo(
    () => toArray(data?.expenses).filter((expense) => expense.approvalStatus !== 'rejected'),
    [data?.expenses]
  )
  const rateCards = useMemo(() => toArray(data?.rateCards).filter(isCountedEntry), [data?.rateCards])
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

  // ---- Loan period filter (2026-10-04 client request) ---------------------
  // Monthly (default) / Daily / All time. Scopes the Loan Chart table, the
  // summary cards and both transaction lists. Per member: Opening = balance
  // carried in from before the period, Withdrawn/Repaid = movement inside
  // it, Closing = balance at the period's end (later entries ignored).
  // Rejected entries never count (isCountedEntry), same as computeLoanBalance.
  const [loanMode, setLoanMode] = useState<'monthly' | 'daily' | 'all'>('monthly')
  const [loanDate, setLoanDate] = useState(dateInputValue())
  const [loanMonth, setLoanMonth] = useState(monthInputValue())
  const effectiveLoanMode =
    (loanMode === 'monthly' && !loanMonth) || (loanMode === 'daily' && !loanDate) ? 'all' : loanMode
  const loanPeriodStart = effectiveLoanMode === 'daily' ? loanDate : effectiveLoanMode === 'monthly' ? `${loanMonth}-01` : ''
  const loanPeriodLabel =
    effectiveLoanMode === 'daily'
      ? formatDate(loanDate)
      : effectiveLoanMode === 'monthly'
        ? new Date(`${loanMonth}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
        : 'All time'
  const isInLoanPeriod = (date: string) =>
    effectiveLoanMode === 'daily'
      ? isSameDate(date, loanDate)
      : effectiveLoanMode === 'monthly'
        ? isSameMonth(date, loanMonth)
        : true

  const loanPeriodRows = useMemo(() => {
    const byAccount = new Map<string, { opening: number; withdrawn: number; repaid: number }>()
    for (const entry of loanTransactions) {
      if (!isCountedEntry(entry)) continue
      const row = byAccount.get(entry.loanAccountId) ?? { opening: 0, withdrawn: 0, repaid: 0 }
      const signed = entry.type === 'withdrawal' ? entry.amount : -entry.amount
      if (isInLoanPeriod(entry.date)) {
        if (entry.type === 'withdrawal') row.withdrawn += entry.amount
        else row.repaid += entry.amount
      } else if (loanPeriodStart && isBeforeDate(entry.date, loanPeriodStart)) {
        row.opening += signed
      }
      byAccount.set(entry.loanAccountId, row)
    }
    return new Map(
      loanAccounts.map((account) => {
        const row = byAccount.get(account.id) ?? { opening: 0, withdrawn: 0, repaid: 0 }
        return [account.id, { ...row, closing: row.opening + row.withdrawn - row.repaid }]
      })
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanTransactions, loanAccounts, effectiveLoanMode, loanDate, loanMonth])

  const loanPeriodTotals = useMemo(() => {
    const totals = { opening: 0, withdrawn: 0, repaid: 0, closing: 0 }
    for (const row of loanPeriodRows.values()) {
      totals.opening += row.opening
      totals.withdrawn += row.withdrawn
      totals.repaid += row.repaid
      totals.closing += row.closing
    }
    return totals
  }, [loanPeriodRows])

  const periodLoanTransactions = useMemo(
    () => loanTransactions.filter((transaction) => isInLoanPeriod(transaction.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loanTransactions, effectiveLoanMode, loanDate, loanMonth]
  )
  const periodLoanTransactionTotals = useMemo(() => {
    const counted = periodLoanTransactions.filter(isCountedEntry)
    const sumOf = (list: typeof counted) => list.reduce((sum, entry) => sum + entry.amount, 0)
    const withdrawals = counted.filter((entry) => entry.type === 'withdrawal')
    const repayments = counted.filter((entry) => entry.type === 'repayment')
    return {
      withdrawn: sumOf(withdrawals),
      newLoans: sumOf(withdrawals.filter((entry) => !entry.isOpeningBalance && !entry.isAdjustment)),
      existingLoans: sumOf(withdrawals.filter((entry) => entry.isOpeningBalance)),
      repaid: sumOf(repayments),
      repaidAsExpense: sumOf(repayments.filter((entry) => entry.expenseId)),
      repaidAsCash: sumOf(repayments.filter((entry) => !entry.expenseId && !entry.isOpeningBalance && !entry.isAdjustment)),
      corrections: sumOf(counted.filter((entry) => entry.isAdjustment).map((entry) => ({ ...entry, amount: entry.type === 'withdrawal' ? entry.amount : -entry.amount }))),
      count: periodLoanTransactions.length,
    }
  }, [periodLoanTransactions])
  const periodExpenseRepayments = useMemo(
    () => expenseRepayments.filter(({ transaction }) => isInLoanPeriod(transaction.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenseRepayments, effectiveLoanMode, loanDate, loanMonth]
  )
  const periodExpenseRepaymentTotal = periodExpenseRepayments
    .filter(({ transaction, approvalStatus }) => approvalStatus !== 'rejected' && isCountedEntry(transaction))
    .reduce((sum, { transaction }) => sum + transaction.amount, 0)

  function openCreateAccount() {
    setEditingAccountId(null)
    setAccountForm(emptyLoanAccountForm)
    setAccountError(null)
    setAccountDialogOpen(true)
  }

  function openEditAccount(account: LoanAccountRecord) {
    setEditingAccountId(account.id)
    setAccountForm({
      memberName: account.memberName,
      phone: account.phone,
      address: account.address ?? '',
      balance: String(computeLoanBalance(data ?? null, account.id).balance),
    })
    setAccountError(null)
    setAccountDialogOpen(true)
  }

  async function handleSaveAccount() {
    setAccountError(null)
    const balance = accountForm.balance.trim() === '' ? undefined : Number(accountForm.balance)
    if (editingAccountId && balance !== undefined && !Number.isFinite(balance)) {
      setAccountError('Balance must be a number.')
      return
    }
    setAccountSaving(true)
    try {
      await saveLoanAccount(
        { memberName: accountForm.memberName, phone: accountForm.phone, address: accountForm.address, balance: editingAccountId ? balance : undefined },
        editingAccountId ?? undefined
      )
      setAccountDialogOpen(false)
    } catch (reason) {
      setAccountError(reason instanceof Error ? reason.message : 'Unable to save loan member.')
    } finally {
      setAccountSaving(false)
    }
  }

  async function handleDeleteAccount(account: LoanAccountRecord) {
    const transactionCount = loanTransactions.filter((entry) => entry.loanAccountId === account.id).length
    const message = transactionCount
      ? `Delete ${account.memberName}? This also deletes their ${transactionCount} loan transaction(s) and any cash/expense entries posted from them.`
      : `Delete ${account.memberName}?`
    if (!window.confirm(message)) {
      return
    }
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
      isAdjustment: false,
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
      isAdjustment: Boolean(transaction.isAdjustment),
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
          isAdjustment: transactionForm.isAdjustment,
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
  // "খাত অনুযায়ী মোট" (client request, 2026-09-13): the flat entry list above
  // only shows the Cash Maintenance chart's own categories (পণ্য ক্রয়,
  // প্যাকেজিং, ডিপো পণ্য পরিবহন, ...); a Cash Maintenance cash-out and an Expense's
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
      .forEach((expense) => add(expenseCategoryLabel(data, expense.category), expense.amount))
    return Array.from(rows.values()).sort((left, right) => right.total - left.total)
  }, [data, filteredCashEntries, expenses, cashMode, cashDate, cashMonth])

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
      productReturnId: entry.productReturnId ?? '',
      employeeName: entry.employeeName ?? '',
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
          productReturnId: cashForm.category === CASH_CATEGORY_DAMAGE ? cashForm.productReturnId || undefined : undefined,
          employeeName: cashForm.category === CASH_CATEGORY_ADVANCE_SALARY ? cashForm.employeeName.trim() || undefined : undefined,
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
        .filter((entry) => entry.type === 'withdrawal' && !entry.isOpeningBalance && !entry.isAdjustment && isCountedEntry(entry))
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
  // dated strictly before the selected period and on/after BOOKS_START_DATE
  // (1 Sept 2026 — the books start at zero then, client request; earlier-
  // dated entries never carry into an opening balance).
  const periodStartDate = cashMode === 'daily' ? cashDate : `${cashMonth}-01`
  const openingBalance = useMemo(() => {
    const cashInBefore =
      loanTransactions
        .filter((entry) => entry.type === 'withdrawal' && !entry.isOpeningBalance && !entry.isAdjustment && isCountedEntry(entry) && isOpeningDate(entry.date, periodStartDate))
        .reduce((sum, entry) => sum + entry.amount, 0) +
      collectedCashRows
        .filter((row) => isOpeningDate(row.date, periodStartDate))
        .reduce((sum, row) => sum + row.amount, 0) +
      cashEntries
        .filter((entry) => isCashMaintenanceIn(entry) && isOpeningDate(entry.date, periodStartDate))
        .reduce((sum, entry) => sum + entry.amount, 0)
    const cashOutBefore =
      expenses
        .filter((expense) => isOpeningDate(expense.date, periodStartDate))
        .reduce((sum, expense) => sum + expense.amount, 0) +
      cashEntries
        .filter((entry) => isCashMaintenanceOut(entry) && isOpeningDate(entry.date, periodStartDate))
        .reduce((sum, entry) => sum + entry.amount, 0)
    return cashInBefore - cashOutBefore
  }, [loanTransactions, collectedCashRows, expenses, cashEntries, periodStartDate])
  const closingBalance = openingBalance + totalCashIn - totalCashOut

  // ---- Cash Book detail (2026-09-29 client spec §22–23) ---------------------
  // Every cash-in/cash-out transaction behind the Daily Cash Book totals, one
  // row each, from every source — sales collections, loan withdrawals, Cash
  // Maintenance entries (in/out, direct expense included) and Expenses
  // (Salary, Loan Repayment, …). The Cash Book used to show only two lump
  // Cash Out lines, so categories like Salary / Loan Repayment / Dealer
  // Payment never appeared by name, and the export only covered Cash
  // Maintenance rows. Same filters as the totals above, so the by-category
  // lines always add up to Total Cash In / Total Cash Out.
  type CashBookRow = {
    key: string
    date: string
    direction: 'in' | 'out'
    source: string
    category: string
    party: string
    note: string
    amount: number
  }
  const cashBookRows = useMemo<CashBookRow[]>(() => {
    const inPeriod = (date: string) => (cashMode === 'daily' ? isSameDate(date, cashDate) : isSameMonth(date, cashMonth))
    const rows: CashBookRow[] = []

    const collectionsByRateCardId = new Map<string, number>()
    for (const collection of collections) {
      collectionsByRateCardId.set(collection.rateCardId, (collectionsByRateCardId.get(collection.rateCardId) ?? 0) + collection.amount)
    }
    for (const card of rateCards) {
      const initialPaid = (card.paid ?? 0) - (collectionsByRateCardId.get(card.id) ?? 0)
      if (initialPaid > 0 && inPeriod(card.date)) {
        rows.push({
          key: `inv-${card.id}`,
          date: card.date,
          direction: 'in',
          source: 'Sales',
          category: 'বিক্রয় কালেকশন (Sales money)',
          party: card.recipientName,
          note: `Paid with invoice ${card.invoiceNo}`,
          amount: initialPaid,
        })
      }
    }
    for (const collection of collections) {
      if (!inPeriod(collection.collectionDate)) continue
      rows.push({
        key: `col-${collection.id}`,
        date: collection.collectionDate,
        direction: 'in',
        source: 'Sales',
        category: 'বিক্রয় কালেকশন (Sales money)',
        party: collection.dealerName,
        note: `${collection.receiptNumber} · ${isLegacyCollection(data ?? null, collection) ? 'Legacy order (no invoice)' : collection.invoiceNo}${collection.note ? ` · ${collection.note}` : ''}`,
        amount: collection.amount,
      })
    }
    for (const entry of loanTransactions) {
      if (entry.type !== 'withdrawal' || entry.isOpeningBalance || entry.isAdjustment || !isCountedEntry(entry) || !inPeriod(entry.date)) continue
      rows.push({
        key: `loan-${entry.id}`,
        date: entry.date,
        direction: 'in',
        source: 'Loan',
        category: 'ঋণ গ্রহণ (Loan withdrawal)',
        party: entry.memberName,
        note: entry.note ?? '',
        amount: entry.amount,
      })
    }
    for (const entry of cashEntries) {
      if (!inPeriod(entry.date)) continue
      const direction = isCashMaintenanceIn(entry) ? 'in' : isCashMaintenanceOut(entry) ? 'out' : null
      if (!direction) continue
      rows.push({
        key: `cash-${entry.id}`,
        date: entry.date,
        direction,
        source: 'Cash Maintenance',
        category: entry.category,
        party: entry.employeeName ?? '',
        note: entry.note ?? '',
        amount: entry.amount,
      })
    }
    for (const expense of expenses) {
      if (!inPeriod(expense.date)) continue
      rows.push({
        key: `exp-${expense.id}`,
        date: expense.date.slice(0, 10),
        direction: 'out',
        source: 'Expense',
        category: expenseCategoryLabel(data, expense.category),
        party: expense.loanMemberName || expense.employeeName || '',
        note: expense.note ?? '',
        amount: expense.amount,
      })
    }
    return rows.sort((left, right) => left.date.localeCompare(right.date))
  }, [data, collections, rateCards, loanTransactions, cashEntries, expenses, cashMode, cashDate, cashMonth])

  const cashBookByCategory = (direction: 'in' | 'out') => {
    const map = new Map<string, { category: string; count: number; total: number }>()
    cashBookRows
      .filter((row) => row.direction === direction)
      .forEach((row) => {
        const current = map.get(row.category) ?? { category: row.category, count: 0, total: 0 }
        current.count += 1
        current.total += row.amount
        map.set(row.category, current)
      })
    return Array.from(map.values()).sort((left, right) => right.total - left.total)
  }
  const cashBookInByCategory = cashBookByCategory('in')
  const cashBookOutByCategory = cashBookByCategory('out')
  const cashBookPeriodLabel = cashMode === 'daily' ? formatDate(cashDate) : cashMonth

  return (
    <AdminShell active={showCash ? 'Cash Maintenance' : 'Loan Chart'}>
      <div className="space-y-8">
        {showLoans ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Reporting period — {loanPeriodLabel}</p>
              <p className="text-xs text-muted-foreground">
                Pick a month or a day — the cards, the Loan Chart and both transaction lists below show that period's totals.
              </p>
            </div>
            <div className="flex flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
              <Select value={loanMode} onValueChange={(value) => setLoanMode(value as typeof loanMode)}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
              {loanMode === 'daily' ? (
                <Input className="w-full sm:w-48" type="date" value={loanDate} onChange={(event) => setLoanDate(event.target.value)} />
              ) : loanMode === 'monthly' ? (
                <Input className="w-full sm:w-48" type="month" value={loanMonth} onChange={(event) => setLoanMonth(event.target.value)} />
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {showLoans ? (
          <>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Loan withdrawn — {loanPeriodLabel}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-amber-700 dark:text-amber-300">
                {formatCurrency(periodLoanTransactionTotals.withdrawn, currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                New loans {formatCurrency(periodLoanTransactionTotals.newLoans, currency)} · Existing loans{' '}
                {formatCurrency(periodLoanTransactionTotals.existingLoans, currency)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Loan repaid — {loanPeriodLabel}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-600">
                {formatCurrency(periodLoanTransactionTotals.repaid, currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                As Cash Maintenance {formatCurrency(periodLoanTransactionTotals.repaidAsCash, currency)} · As Expense{' '}
                {formatCurrency(periodLoanTransactionTotals.repaidAsExpense, currency)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">
                {effectiveLoanMode === 'all' ? 'Loan balance' : `Closing balance — ${loanPeriodLabel}`}
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">
                {formatCurrency(loanPeriodTotals.closing, currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Opening {formatCurrency(loanPeriodTotals.opening, currency)} + Withdrawn{' '}
                {formatCurrency(loanPeriodTotals.withdrawn, currency)} − Repaid {formatCurrency(loanPeriodTotals.repaid, currency)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total loan balance outstanding</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">
                {formatCurrency(totalLoanBalance, currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                As of today · {loanAccounts.length.toLocaleString('en-BD')} loan members ·{' '}
                {periodLoanTransactionTotals.count.toLocaleString('en-BD')} transactions in {loanPeriodLabel}
              </p>
            </CardContent>
          </Card>
          </>
          ) : null}
          {showCash ? (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total Cash Out this period</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{formatCurrency(totalCashOut, currency)}</p>
            </CardContent>
          </Card>
          ) : null}
          {showCash ? (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              {/* Was "Reconciliation", shown amber as a "mismatch" whenever
                  in ≠ out — but money in and out are almost never equal in a
                  real month, so it read as an error when it was just the
                  period's net cash. */}
              <p className="text-sm text-muted-foreground">Net Cash Flow — এই সময়ের নিট ক্যাশ</p>
              <p
                className={cn(
                  'mt-2 text-2xl font-semibold tracking-tight',
                  reconciliationGap < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                )}
              >
                {formatCurrency(reconciliationGap, currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isBalanced
                  ? 'Cash In = Cash Out'
                  : reconciliationGap > 0
                    ? 'খরচের চেয়ে বেশি টাকা এসেছে'
                    : 'যা এসেছে তার চেয়ে বেশি খরচ হয়েছে'}
                {' · '}Cash In {formatCurrency(totalCashIn, currency)} − Cash Out {formatCurrency(totalCashOut, currency)}
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
                    {effectiveLoanMode === 'all' ? null : <TableHead className="text-right">Opening</TableHead>}
                    <TableHead className="text-right">{effectiveLoanMode === 'all' ? 'Total Withdrawn' : 'Withdrawn'}</TableHead>
                    <TableHead className="text-right">{effectiveLoanMode === 'all' ? 'Total Repaid' : 'Repaid'}</TableHead>
                    <TableHead className="text-right">{effectiveLoanMode === 'all' ? 'Balance' : 'Closing'}</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((account) => {
                    const period = loanPeriodRows.get(account.id) ?? { opening: 0, withdrawn: 0, repaid: 0, closing: 0 }
                    const totals = { totalWithdrawn: period.withdrawn, totalRepaid: period.repaid, balance: period.closing }
                    return (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.memberName}</TableCell>
                        <TableCell>{account.phone || '—'}</TableCell>
                        {effectiveLoanMode === 'all' ? null : (
                          <TableCell className="text-right tabular-nums">{formatCurrency(period.opening, currency)}</TableCell>
                        )}
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
                      <TableCell colSpan={effectiveLoanMode === 'all' ? 6 : 7} className="py-10 text-center text-sm text-muted-foreground">
                        <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        No loan members yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
                {filteredAccounts.length > 0 ? (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-semibold">Total — {loanPeriodLabel}</TableCell>
                      {effectiveLoanMode === 'all' ? null : (
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrency(filteredAccounts.reduce((sum, account) => sum + (loanPeriodRows.get(account.id)?.opening ?? 0), 0), currency)}
                        </TableCell>
                      )}
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(filteredAccounts.reduce((sum, account) => sum + (loanPeriodRows.get(account.id)?.withdrawn ?? 0), 0), currency)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(filteredAccounts.reduce((sum, account) => sum + (loanPeriodRows.get(account.id)?.repaid ?? 0), 0), currency)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrency(filteredAccounts.reduce((sum, account) => sum + (loanPeriodRows.get(account.id)?.closing ?? 0), 0), currency)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                ) : null}
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
              title={`Loan Transactions — ${loanPeriodLabel}`}
              description={`Withdrawn ${formatCurrency(periodLoanTransactionTotals.withdrawn, currency)} · Repaid ${formatCurrency(periodLoanTransactionTotals.repaid, currency)}${periodLoanTransactionTotals.corrections ? ` · Balance corrections ${formatCurrency(periodLoanTransactionTotals.corrections, currency)}` : ''} — newest first, rejected entries not counted.`}
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
                  {periodLoanTransactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-medium">{transaction.memberName}<RecordApprovalTag record={transaction} /></TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'rounded-full',
                            transaction.isAdjustment
                              ? 'border-violet-200 bg-violet-500/10 text-violet-700 dark:border-violet-900 dark:text-violet-300'
                              : transaction.isOpeningBalance
                              ? 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300'
                              : transaction.type === 'withdrawal'
                                ? 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
                                : 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                          )}
                        >
                          {loanTransactionTypeLabel(transaction)}
                        </Badge>
                        {transaction.type === 'repayment' && !transaction.isOpeningBalance && !transaction.isAdjustment ? (
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
                  {periodLoanTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        {loanTransactions.length === 0 ? 'No loan transactions recorded yet.' : `No loan transactions in ${loanPeriodLabel}.`}
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
              title={`Loan Repayments — Posted as Expense — ${loanPeriodLabel}`}
              description={`Total ${formatCurrency(periodExpenseRepaymentTotal, currency)} (rejected not counted). Repayments posted as Direct Expense (Operating Cost) instead of Cash Maintenance — these also show on the Finance › Expenses page, but can be edited from here.`}
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
                  {periodExpenseRepayments.map(({ transaction, approvalStatus }) => (
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
                  {periodExpenseRepayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        {expenseRepayments.length === 0 ? 'No repayments posted as Expense yet.' : `No repayments posted as Expense in ${loanPeriodLabel}.`}
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
                      <TableCell className="font-medium">{investor.name}<RecordApprovalTag record={investor} /></TableCell>
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
              description="পণ্য ক্রয়, পাউচ/প্যাকেট ও ডিপো পণ্য পরিবহন সহ ক্যাশ জমা-খরচ এখানে সরাসরি এন্ট্রি দিন — এগুলো প্রফিটে হিট করে না। Purchase সেকশন থেকে এখানে আর অটো পোস্ট হয় না।"
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
                headers={['Date', 'Category', 'Direction', 'Amount', 'P&L Expense', 'Product Return', 'Employee', 'Note', 'Status']}
                rows={filteredCashEntries.map((entry) => [
                  entry.date,
                  entry.category,
                  entry.direction === 'in' ? 'Cash In' : 'Cash Out',
                  entry.amount,
                  entry.isDirectExpense ? 'Yes' : 'No',
                  entry.productReturnNumber ?? '',
                  entry.employeeName ?? '',
                  entry.note ?? '',
                  entry.approvalStatus === 'rejected' ? 'Rejected (not counted)' : entry.approvalStatus === 'pending' ? 'Pending' : 'Approved',
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
                <span className="text-muted-foreground">Cash In (Cash Maintenance entries)</span>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(cashMaintenanceInTotal, currency)}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                <span className="text-muted-foreground">Cash Out (Cash Maintenance entries)</span>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(cashOutTotal, currency)}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                <span className="text-muted-foreground">Direct Expense (Expense দপ্তরের মোট খরচ, এই একই দিন/মাসের)</span>
                <p className="mt-1 text-lg font-semibold">{formatCurrency(expenseTotalThisPeriod, currency)}</p>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <span className="text-muted-foreground">Total Cash Out (Cash Maintenance + Expense)</span>
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
                        <RecordApprovalTag record={entry} />
                        {entry.direction === 'in' ? (
                          <Badge variant="outline" className="ml-2 rounded-full border-emerald-300 text-[10px] text-emerald-700 dark:text-emerald-300">
                            Cash In
                          </Badge>
                        ) : null}
                        {entry.isDirectExpense ? (
                          <Badge variant="outline" className="ml-2 rounded-full text-[10px]">
                            {entry.category === CASH_CATEGORY_DAMAGE ? 'Loss' : 'Direct'}
                          </Badge>
                        ) : null}
                        {entry.productReturnNumber ? (
                          <p className="text-[11px] font-normal text-muted-foreground">Return {entry.productReturnNumber}</p>
                        ) : null}
                        {entry.employeeName ? (
                          <p className="text-[11px] font-normal text-muted-foreground">{entry.employeeName}</p>
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

        {/* Per-category statement (spec §4) */}
        <CashCategoryStatement entries={cashEntries} categoryOptions={CASH_OUT_CATEGORY_OPTIONS} currency={currency} />

        {/* Reconciliation */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeader
              icon={Scale}
              title="Daily Cash Book"
              description="Opening balance carried from before this period, plus cash-in, minus cash-out — same tally as the manual daily cash sheet, ending in a Net Cash Position."
            />
            <div className="flex flex-wrap gap-2">
              <ExportMenu
                filenameBase={`cash-book-${cashMode === 'daily' ? cashDate : cashMonth}`}
                title={`Daily Cash Book — all transactions (${cashBookPeriodLabel})`}
                headers={['Date', 'Cash In/Out', 'Source', 'Category', 'Party', 'Note', 'Cash In', 'Cash Out']}
                rows={[
                  ['', '', '', 'Opening balance', '', '', openingBalance, ''],
                  ...cashBookRows.map((row) => [
                    row.date,
                    row.direction === 'in' ? 'Cash In' : 'Cash Out',
                    row.source,
                    row.category,
                    row.party,
                    row.note,
                    row.direction === 'in' ? row.amount : '',
                    row.direction === 'out' ? row.amount : '',
                  ]),
                  ['', '', '', 'Total', '', '', totalCashIn, totalCashOut],
                  ['', '', '', 'Closing balance (Cash on Hand)', '', '', closingBalance, ''],
                ]}
              />
              <ExportMenu
                filenameBase={`cash-summary-${cashMode === 'daily' ? cashDate : cashMonth}`}
                title={`Cash Summary by category (${cashBookPeriodLabel})`}
                headers={['Cash In/Out', 'Category', 'Entries', 'Amount']}
                rows={[
                  ['', 'Opening balance', '', openingBalance],
                  ...cashBookInByCategory.map((row) => ['Cash In', row.category, row.count, row.total]),
                  ['Cash In', 'Total Cash In', '', totalCashIn],
                  ...cashBookOutByCategory.map((row) => ['Cash Out', row.category, row.count, row.total]),
                  ['Cash Out', 'Total Cash Out', '', totalCashOut],
                  ['', 'Closing balance (Cash on Hand)', '', closingBalance],
                ]}
              />
            </div>
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
                <p className="text-sm font-medium text-foreground">Cash In — by category</p>
                {cashBookInByCategory.map((row) => (
                  <div key={row.category} className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {row.category} <span className="text-xs">({row.count})</span>
                    </span>
                    <span className="tabular-nums">{formatCurrency(row.total, currency)}</span>
                  </div>
                ))}
                {cashBookInByCategory.length === 0 ? <p className="text-sm text-muted-foreground">No cash in this period.</p> : null}
                <div className="flex justify-between border-t border-border/60 pt-2 text-sm font-semibold">
                  <span>Total Cash In</span>
                  <span className="tabular-nums">{formatCurrency(totalCashIn, currency)}</span>
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-border/60 p-4">
                <p className="text-sm font-medium text-foreground">Cash Out — by category</p>
                {cashBookOutByCategory.map((row) => (
                  <div key={row.category} className="flex justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">
                      {row.category} <span className="text-xs">({row.count})</span>
                    </span>
                    <span className="tabular-nums">{formatCurrency(row.total, currency)}</span>
                  </div>
                ))}
                {cashBookOutByCategory.length === 0 ? <p className="text-sm text-muted-foreground">No cash out this period.</p> : null}
                <div className="flex justify-between border-t border-dashed border-border/60 pt-2 text-xs text-muted-foreground">
                  <span>Expense chart {formatCurrency(expenseTotalThisPeriod, currency)} + Cash Maintenance {formatCurrency(cashOutTotal, currency)}</span>
                </div>
                <div className="flex justify-between border-t border-border/60 pt-2 text-sm font-semibold">
                  <span>Total Cash Out</span>
                  <span className="tabular-nums">{formatCurrency(totalCashOut, currency)}</span>
                </div>
              </div>
            </div>
            <div
              className={cn(
                'mt-4 flex items-center justify-between rounded-xl border p-4 text-sm',
                reconciliationGap < 0
                  ? 'border-red-200 bg-red-500/10 text-red-700 dark:border-red-900 dark:text-red-300'
                  : 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
              )}
            >
              <span className="font-medium">Net Cash Flow (Cash In − Cash Out) — এই সময়ের নিট ক্যাশ</span>
              <span className="tabular-nums font-semibold">{formatCurrency(reconciliationGap, currency)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
              <span className="font-medium text-foreground">Cash on Hand — নিট ক্যাশ স্থিতি (closing)</span>
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
            {editingAccountId ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Balance</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={accountForm.balance}
                  onChange={(event) => setAccountForm((current) => ({ ...current, balance: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Fix a wrongly entered balance. The difference is saved as a “Balance Correction” in Loan Transactions — no cash in/out is posted.
                </p>
              </div>
            ) : null}
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
            {!transactionForm.isOpeningBalance && !transactionForm.isAdjustment && transactionForm.type === 'repayment' ? (
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
              ক্যাশ ইন টাকা বাড়ায়, ক্যাশ আউট টাকা কমায় — ড্যামেজ ও সরাসরি এক্সপেন্স ছাড়া কোনোটাই প্রফিটে হিট করে না।
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
              {cashForm.direction === 'out' && CASH_PNL_EXPENSE_CATEGORIES.includes(cashForm.category) ? (
                <p className="text-xs text-muted-foreground">এই খাতের টাকা ক্যাশ আউট এবং খরচ (Company Earnings / প্রফিট থেকে বাদ) — দুটোতেই হিসাব হবে।</p>
              ) : null}
            </div>
            {cashForm.direction === 'out' && cashForm.category === CASH_CATEGORY_ADVANCE_SALARY ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Employee<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Input
                  list="advance-employee-suggestions"
                  value={cashForm.employeeName}
                  onChange={(event) => setCashForm((current) => ({ ...current, employeeName: event.target.value }))}
                  placeholder="কাকে অ্যাডভান্স দেয়া হচ্ছে"
                />
                <datalist id="advance-employee-suggestions">
                  {employeeNameSuggestions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                {cashForm.employeeName.trim() ? (
                  <p className="text-xs text-muted-foreground">
                    আগের বকেয়া অ্যাডভান্স:{' '}
                    {formatCurrency(
                      employeeAdvanceOutstanding(data ?? null, cashForm.employeeName) -
                        (editingCashId && data?.cashMaintenance?.[editingCashId]?.employeeName?.trim().toLowerCase() ===
                        cashForm.employeeName.trim().toLowerCase()
                          ? data.cashMaintenance[editingCashId].amount
                          : 0),
                      currency
                    )}{' '}
                    — পরে বেতন দেয়ার সময় Finance পেজের সেলারি ফর্মে এটা কেটে নেয়া যাবে।
                  </p>
                ) : null}
              </div>
            ) : null}
            {cashForm.direction === 'out' && cashForm.category === CASH_CATEGORY_DAMAGE ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Linked Product Return (optional)</p>
                <Select
                  value={cashForm.productReturnId || 'none'}
                  onValueChange={(value) => setCashForm((current) => ({ ...current, productReturnId: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No link</SelectItem>
                    {productReturnOptions.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.returnNumber} — {entry.recipientName} ({formatDate(entry.date)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
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

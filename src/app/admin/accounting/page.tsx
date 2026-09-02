"use client"

import { useMemo, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Banknote,
  BookOpenText,
  Landmark,
  Layers,
  ListChecks,
  PiggyBank,
  Plus,
  Scale,
  ScrollText,
  Trash2,
  TrendingUp,
  Truck,
  Undo2,
  Users,
  Wallet,
} from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { EXPENSE_CATEGORIES } from '@/lib/erp/standardChartOfAccounts'
import { getBudgetActual, useERP } from '@/lib/erp/provider'
import type {
  AccountType,
  BankAccountRecord,
  BankTransactionType,
  BudgetPeriodType,
  BudgetRecord,
  ChartOfAccountRecord,
  LedgerEntryRecord,
} from '@/lib/erp/types'
import { formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type Section = 'coa' | 'journal' | 'ledger' | 'trial' | 'pl' | 'bs' | 'cashflow' | 'bank' | 'receivable' | 'payable' | 'budget'

const SECTIONS: Array<{ id: Section; label: string; icon: typeof BookOpenText }> = [
  { id: 'coa', label: 'Chart of Accounts', icon: BookOpenText },
  { id: 'journal', label: 'Journal', icon: ScrollText },
  { id: 'ledger', label: 'General Ledger', icon: Layers },
  { id: 'trial', label: 'Trial Balance', icon: Scale },
  { id: 'pl', label: 'Profit & Loss', icon: TrendingUp },
  { id: 'bs', label: 'Balance Sheet', icon: Landmark },
  { id: 'cashflow', label: 'Cash Flow', icon: Wallet },
  { id: 'bank', label: 'Bank Management', icon: Banknote },
  { id: 'receivable', label: 'Customer Receivable', icon: Users },
  { id: 'payable', label: 'Supplier Payable', icon: Truck },
  { id: 'budget', label: 'Budget Management', icon: PiggyBank },
]

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const BANK_TXN_TYPE_LABEL: Record<BankTransactionType, string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  transfer: 'Transfer',
  cheque_issued: 'Cheque issued',
  cheque_deposited: 'Cheque deposited',
  bank_charge: 'Bank charge',
}

type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+'
const AGING_BUCKETS: AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+']
const AGING_LABEL: Record<AgingBucket, string> = {
  current: 'Current',
  '1-30': '1–30 Days',
  '31-60': '31–60 Days',
  '61-90': '61–90 Days',
  '90+': '90+ Days',
}

function daysBetween(laterIso: string, earlierIso: string) {
  return Math.floor((new Date(laterIso).getTime() - new Date(earlierIso).getTime()) / 86_400_000)
}

function agingBucketFor(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return '1-30'
  if (daysOverdue <= 60) return '31-60'
  if (daysOverdue <= 90) return '61-90'
  return '90+'
}

// System-generated descriptions (see buildInvoiceLedgerEntries,
// recordCollection, createSalesReturn in provider.tsx) are stable enough to
// classify a customer ledger line by prefix — Discount has no separate
// column because it's already netted into the invoice total at creation,
// never posted as its own ledger line.
function classifyCustomerEntry(entry: LedgerEntryRecord): 'sales' | 'return' | 'collection' | 'adjustment' {
  if (entry.description.startsWith('Sales return')) return 'return'
  if (entry.description.startsWith('Collection against')) return 'collection'
  if (entry.description.startsWith('Invoice ')) return 'sales'
  return 'adjustment'
}

function classifySupplierEntry(entry: LedgerEntryRecord): 'purchase' | 'return' | 'payment' | 'adjustment' {
  if (entry.description.startsWith('Purchase return')) return 'return'
  if (entry.description.startsWith('Payment against')) return 'payment'
  if (entry.description.startsWith('Supplier bill')) return 'purchase'
  return 'adjustment'
}

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
}

const ACCOUNT_TYPE_TONE: Record<AccountType, string> = {
  asset: 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300',
  liability: 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300',
  equity: 'border-violet-200 bg-violet-500/10 text-violet-700 dark:border-violet-900 dark:text-violet-300',
  revenue: 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
  expense: 'border-rose-500/40 text-rose-600 dark:text-rose-400',
}

const DEBIT_NORMAL: Record<AccountType, boolean> = {
  asset: true,
  expense: true,
  liability: false,
  equity: false,
  revenue: false,
}

function dateInputValue(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function emptyAccountForm() {
  return { code: '', name: '', type: 'asset' as AccountType, openingBalance: '0', status: 'active' as ChartOfAccountRecord['status'] }
}

type JournalLineForm = { accountId: string; debit: string; credit: string; description: string }

function emptyJournalLine(): JournalLineForm {
  return { accountId: '', debit: '0', credit: '0', description: '' }
}

function emptyJournalForm() {
  return { date: dateInputValue(), narration: '', lines: [emptyJournalLine(), emptyJournalLine()] }
}

// Resolves a ledger line back to its Chart of Accounts row: automatic-
// engine entries key off `account` (the fixed LedgerAccount), manual
// Journal Entry lines key off `accountRef` (a chartOfAccounts id) — see the
// LedgerAccount 'manual' comment in types.ts.
function resolveAccountForEntry(entry: LedgerEntryRecord, accounts: ChartOfAccountRecord[]) {
  if (entry.account === 'manual') {
    return accounts.find((account) => account.id === entry.accountRef)
  }
  return accounts.find((account) => account.ledgerAccount === entry.account)
}

function sumForAccount(
  accountId: string,
  entries: LedgerEntryRecord[],
  accounts: ChartOfAccountRecord[],
  matchesDate: (date: string) => boolean
) {
  let debit = 0
  let credit = 0
  entries.forEach((entry) => {
    if (!matchesDate(entry.date)) return
    const account = resolveAccountForEntry(entry, accounts)
    if (account?.id !== accountId) return
    debit += entry.debit
    credit += entry.credit
  })
  return { debit, credit }
}

// Signed balance using the account's normal-balance side (Section 28):
// positive for asset/expense means a debit balance, positive for
// liability/equity/revenue means a credit balance — so a straight sum
// across every account type always nets to zero, the way double entry
// should.
function signedMovement(account: ChartOfAccountRecord, debit: number, credit: number) {
  return DEBIT_NORMAL[account.type] ? debit - credit : credit - debit
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof BookOpenText
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

export default function AccountingPage() {
  const {
    data,
    hasPermission,
    saveChartOfAccount,
    deleteChartOfAccount,
    seedStandardChartOfAccounts,
    createJournalEntry,
    reverseJournalEntry,
    saveBankAccount,
    deleteBankAccount,
    recordBankTransaction,
    saveBudget,
    deleteBudget,
  } = useERP()

  const canEdit = hasPermission('finance:edit')
  const currency = data?.settings.currency

  const [section, setSection] = useState<Section>('coa')
  const [feedback, setFeedback] = useState<string | null>(null)

  const accounts = useMemo(
    () => toArray(data?.chartOfAccounts).sort((left, right) => left.code.localeCompare(right.code)),
    [data?.chartOfAccounts]
  )
  const activeAccounts = useMemo(() => accounts.filter((account) => account.status === 'active'), [accounts])
  const entries = useMemo(() => toArray(data?.ledgerEntries), [data?.ledgerEntries])
  const journalEntries = useMemo(
    () => toArray(data?.journalEntries).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.journalEntries]
  )
  const customers = useMemo(() => toArray(data?.customers), [data?.customers])
  const suppliers = useMemo(() => toArray(data?.suppliers), [data?.suppliers])
  const orders = useMemo(() => toArray(data?.orders).filter((order) => order.status !== 'cancelled'), [data?.orders])
  const purchaseOrders = useMemo(() => toArray(data?.purchaseOrders).filter((po) => po.status === 'received'), [data?.purchaseOrders])
  const bankAccountsList = useMemo(
    () => toArray(data?.bankAccounts).sort((left, right) => left.bankName.localeCompare(right.bankName)),
    [data?.bankAccounts]
  )
  const bankTransactions = useMemo(
    () => toArray(data?.bankTransactions).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.bankTransactions]
  )
  const expenses = useMemo(() => data?.expenses ?? {}, [data?.expenses])
  const budgets = useMemo(
    () =>
      toArray(data?.budgets).sort((left, right) => {
        if (right.year !== left.year) return right.year - left.year
        if (right.month !== left.month) return right.month - left.month
        return left.category.localeCompare(right.category)
      }),
    [data?.budgets]
  )

  // ---- Chart of Accounts --------------------------------------------
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<string | undefined>(undefined)
  const [accountForm, setAccountForm] = useState(emptyAccountForm())

  function openNewAccountDialog() {
    setEditingAccountId(undefined)
    setAccountForm(emptyAccountForm())
    setFeedback(null)
    setAccountDialogOpen(true)
  }

  function openEditAccountDialog(account: ChartOfAccountRecord) {
    setEditingAccountId(account.id)
    setAccountForm({
      code: account.code,
      name: account.name,
      type: account.type,
      openingBalance: String(account.openingBalance),
      status: account.status,
    })
    setFeedback(null)
    setAccountDialogOpen(true)
  }

  async function handleAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    try {
      await saveChartOfAccount(
        {
          code: accountForm.code,
          name: accountForm.name,
          type: accountForm.type,
          openingBalance: Number(accountForm.openingBalance) || 0,
          status: accountForm.status,
        },
        editingAccountId
      )
      setAccountDialogOpen(false)
      setFeedback('Chart of account saved.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save account.')
    }
  }

  async function handleDeleteAccount(accountId: string) {
    setFeedback(null)
    try {
      await deleteChartOfAccount(accountId)
      setFeedback('Account deleted.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete account.')
    }
  }

  async function handleSeedStandardChart() {
    setFeedback(null)
    try {
      await seedStandardChartOfAccounts()
      setFeedback('Standard chart of accounts loaded.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to load the standard chart of accounts.')
    }
  }

  // ---- Journal ---------------------------------------------------------
  const [journalForm, setJournalForm] = useState(emptyJournalForm())
  const journalTotals = useMemo(() => {
    const debit = journalForm.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0)
    const credit = journalForm.lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0)
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.01 && debit > 0 }
  }, [journalForm.lines])

  function updateJournalLine(index: number, patch: Partial<JournalLineForm>) {
    setJournalForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    }))
  }

  function addJournalLine() {
    setJournalForm((current) => ({ ...current, lines: [...current.lines, emptyJournalLine()] }))
  }

  function removeJournalLine(index: number) {
    setJournalForm((current) => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) }))
  }

  async function handleJournalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    try {
      await createJournalEntry({
        date: journalForm.date,
        narration: journalForm.narration,
        lines: journalForm.lines.map((line) => ({
          accountId: line.accountId,
          debit: Number(line.debit) || 0,
          credit: Number(line.credit) || 0,
          description: line.description,
        })),
      })
      setJournalForm(emptyJournalForm())
      setFeedback('Journal entry posted.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to post journal entry.')
    }
  }

  async function handleReverseJournal(journalEntryId: string) {
    // Section 64 (Approval System): an Accounting Adjustment is a limited,
    // audited action — capture why before posting the reversal.
    const reversalReason = window.prompt('Reason for reversing this journal entry (required for the audit trail):')
    if (!reversalReason || !reversalReason.trim()) {
      return
    }

    setFeedback(null)
    try {
      await reverseJournalEntry(journalEntryId, reversalReason.trim())
      setFeedback('Journal entry reversed.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to reverse journal entry.')
    }
  }

  // ---- General Ledger ----------------------------------------------------
  const [ledgerAccountId, setLedgerAccountId] = useState('')
  const [ledgerFrom, setLedgerFrom] = useState('')
  const [ledgerTo, setLedgerTo] = useState('')

  const ledgerRows = useMemo(() => {
    if (!ledgerAccountId) return []
    const account = accounts.find((entry) => entry.id === ledgerAccountId)
    if (!account) return []

    const matching = entries
      .filter((entry) => resolveAccountForEntry(entry, accounts)?.id === ledgerAccountId)
      .filter((entry) => (ledgerFrom ? entry.date >= ledgerFrom : true))
      .filter((entry) => (ledgerTo ? entry.date <= `${ledgerTo}T23:59:59.999Z` : true))
      .sort((left, right) => left.date.localeCompare(right.date))

    let running = account.openingBalance
    return matching.map((entry) => {
      running += signedMovement(account, entry.debit, entry.credit)
      return { entry, balance: running }
    })
  }, [ledgerAccountId, ledgerFrom, ledgerTo, entries, accounts])

  // ---- Trial Balance ------------------------------------------------------
  const [trialAsOf, setTrialAsOf] = useState(dateInputValue())
  const trialRows = useMemo(() => {
    const boundary = `${trialAsOf}T23:59:59.999Z`
    return accounts.map((account) => {
      const { debit, credit } = sumForAccount(account.id, entries, accounts, (date) => date <= boundary)
      const balance = account.openingBalance + signedMovement(account, debit, credit)
      const isDebitNormal = DEBIT_NORMAL[account.type]
      const dr = balance >= 0 ? (isDebitNormal ? balance : 0) : isDebitNormal ? 0 : -balance
      const cr = balance >= 0 ? (isDebitNormal ? 0 : balance) : isDebitNormal ? -balance : 0
      return { account, dr, cr }
    })
  }, [accounts, entries, trialAsOf])
  const trialTotals = useMemo(
    () => trialRows.reduce((sum, row) => ({ dr: sum.dr + row.dr, cr: sum.cr + row.cr }), { dr: 0, cr: 0 }),
    [trialRows]
  )

  // ---- Profit & Loss --------------------------------------------------
  const [plFrom, setPlFrom] = useState(dateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [plTo, setPlTo] = useState(dateInputValue())
  const profitAndLoss = useMemo(() => {
    const boundaryTo = `${plTo}T23:59:59.999Z`
    const inPeriod = (date: string) => date >= plFrom && date <= boundaryTo

    const revenueAccounts = accounts.filter((account) => account.type === 'revenue')
    const expenseAccounts = accounts.filter((account) => account.type === 'expense')
    const cogsAccount = accounts.find((account) => account.ledgerAccount === 'cogs')

    const revenueLines = revenueAccounts.map((account) => {
      const { debit, credit } = sumForAccount(account.id, entries, accounts, inPeriod)
      return { account, amount: signedMovement(account, debit, credit) }
    })
    const totalRevenue = revenueLines.reduce((sum, line) => sum + line.amount, 0)

    let cogsAmount = 0
    if (cogsAccount) {
      const { debit, credit } = sumForAccount(cogsAccount.id, entries, accounts, inPeriod)
      cogsAmount = signedMovement(cogsAccount, debit, credit)
    }
    const grossProfit = totalRevenue - cogsAmount

    const opexLines = expenseAccounts
      .filter((account) => account.ledgerAccount !== 'cogs')
      .map((account) => {
        const { debit, credit } = sumForAccount(account.id, entries, accounts, inPeriod)
        return { account, amount: signedMovement(account, debit, credit) }
      })
      .filter((line) => line.amount !== 0)
    const totalOpex = opexLines.reduce((sum, line) => sum + line.amount, 0)
    const netProfit = grossProfit - totalOpex

    return { revenueLines, totalRevenue, cogsAmount, grossProfit, opexLines, totalOpex, netProfit }
  }, [accounts, entries, plFrom, plTo])

  // ---- Balance Sheet -------------------------------------------------
  const [bsAsOf, setBsAsOf] = useState(dateInputValue())
  const balanceSheet = useMemo(() => {
    const boundary = `${bsAsOf}T23:59:59.999Z`
    const balanceAsOf = (account: ChartOfAccountRecord) => {
      const { debit, credit } = sumForAccount(account.id, entries, accounts, (date) => date <= boundary)
      return account.openingBalance + signedMovement(account, debit, credit)
    }

    const assetLines = accounts.filter((account) => account.type === 'asset').map((account) => ({ account, amount: balanceAsOf(account) }))
    const liabilityLines = accounts.filter((account) => account.type === 'liability').map((account) => ({ account, amount: balanceAsOf(account) }))
    const equityLines = accounts.filter((account) => account.type === 'equity').map((account) => ({ account, amount: balanceAsOf(account) }))

    const totalAssets = assetLines.reduce((sum, line) => sum + line.amount, 0)
    const totalLiabilities = liabilityLines.reduce((sum, line) => sum + line.amount, 0)
    const postedEquity = equityLines.reduce((sum, line) => sum + line.amount, 0)

    // Retained Earnings isn't a posted balance — it's every period's Net
    // Profit accumulated since inception, computed the same way the P&L
    // tab computes one period's Net Profit, just with no lower date bound.
    const revenueAccounts = accounts.filter((account) => account.type === 'revenue')
    const expenseAccounts = accounts.filter((account) => account.type === 'expense')
    const sinceInception = (date: string) => date <= boundary
    const totalRevenueToDate = revenueAccounts.reduce((sum, account) => {
      const { debit, credit } = sumForAccount(account.id, entries, accounts, sinceInception)
      return sum + signedMovement(account, debit, credit)
    }, 0)
    const totalExpenseToDate = expenseAccounts.reduce((sum, account) => {
      const { debit, credit } = sumForAccount(account.id, entries, accounts, sinceInception)
      return sum + signedMovement(account, debit, credit)
    }, 0)
    const retainedEarnings = totalRevenueToDate - totalExpenseToDate

    const totalEquity = postedEquity + retainedEarnings
    const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1

    return { assetLines, liabilityLines, equityLines, totalAssets, totalLiabilities, postedEquity, retainedEarnings, totalEquity, balanced }
  }, [accounts, entries, bsAsOf])

  // ---- Cash Flow ------------------------------------------------------
  const [cfFrom, setCfFrom] = useState(dateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [cfTo, setCfTo] = useState(dateInputValue())
  const cashFlow = useMemo(() => {
    const cashBankAccounts = accounts.filter((account) => account.ledgerAccount === 'cash' || account.ledgerAccount === 'bank')
    const boundaryTo = `${cfTo}T23:59:59.999Z`

    return cashBankAccounts.map((account) => {
      const before = sumForAccount(account.id, entries, accounts, (date) => date < cfFrom)
      const opening = account.openingBalance + signedMovement(account, before.debit, before.credit)
      const { debit: cashIn, credit: cashOut } = sumForAccount(account.id, entries, accounts, (date) => date >= cfFrom && date <= boundaryTo)
      const closing = opening + cashIn - cashOut
      return { account, opening, cashIn, cashOut, closing }
    })
  }, [accounts, entries, cfFrom, cfTo])
  const cashFlowTotals = useMemo(
    () =>
      cashFlow.reduce(
        (sum, row) => ({
          opening: sum.opening + row.opening,
          cashIn: sum.cashIn + row.cashIn,
          cashOut: sum.cashOut + row.cashOut,
          closing: sum.closing + row.closing,
        }),
        { opening: 0, cashIn: 0, cashOut: 0, closing: 0 }
      ),
    [cashFlow]
  )

  // ---- Bank Management (Section 35) ------------------------------------
  function bankAccountBalance(bankAccount: BankAccountRecord) {
    const chartAccount = accounts.find((account) => account.id === bankAccount.chartAccountId)
    if (!chartAccount) return bankAccount.openingBalance
    const { debit, credit } = sumForAccount(chartAccount.id, entries, accounts, () => true)
    return chartAccount.openingBalance + signedMovement(chartAccount, debit, credit)
  }

  const [bankAccountDialogOpen, setBankAccountDialogOpen] = useState(false)
  const [editingBankAccountId, setEditingBankAccountId] = useState<string | undefined>(undefined)
  const [bankAccountForm, setBankAccountForm] = useState({
    bankName: '',
    branch: '',
    accountNumber: '',
    openingBalance: '0',
    status: 'active' as BankAccountRecord['status'],
  })

  function openNewBankAccountDialog() {
    setEditingBankAccountId(undefined)
    setBankAccountForm({ bankName: '', branch: '', accountNumber: '', openingBalance: '0', status: 'active' })
    setFeedback(null)
    setBankAccountDialogOpen(true)
  }

  function openEditBankAccountDialog(bankAccount: BankAccountRecord) {
    setEditingBankAccountId(bankAccount.id)
    setBankAccountForm({
      bankName: bankAccount.bankName,
      branch: bankAccount.branch,
      accountNumber: bankAccount.accountNumber,
      openingBalance: String(bankAccount.openingBalance),
      status: bankAccount.status,
    })
    setFeedback(null)
    setBankAccountDialogOpen(true)
  }

  async function handleBankAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    try {
      await saveBankAccount(
        {
          bankName: bankAccountForm.bankName,
          branch: bankAccountForm.branch,
          accountNumber: bankAccountForm.accountNumber,
          openingBalance: Number(bankAccountForm.openingBalance) || 0,
          status: bankAccountForm.status,
        },
        editingBankAccountId
      )
      setBankAccountDialogOpen(false)
      setFeedback('Bank account saved.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save bank account.')
    }
  }

  async function handleDeleteBankAccount(bankAccountId: string) {
    setFeedback(null)
    try {
      await deleteBankAccount(bankAccountId)
      setFeedback('Bank account deleted.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete bank account.')
    }
  }

  const [bankTxnDialogOpen, setBankTxnDialogOpen] = useState(false)
  const [bankTxnForm, setBankTxnForm] = useState({
    bankAccountId: '',
    type: 'deposit' as BankTransactionType,
    amount: '0',
    date: dateInputValue(),
    toBankAccountId: '',
    counterAccountId: '',
    chequeNumber: '',
    payee: '',
    note: '',
  })

  function openBankTxnDialog(bankAccountId?: string) {
    setBankTxnForm({
      bankAccountId: bankAccountId ?? '',
      type: 'deposit',
      amount: '0',
      date: dateInputValue(),
      toBankAccountId: '',
      counterAccountId: '',
      chequeNumber: '',
      payee: '',
      note: '',
    })
    setFeedback(null)
    setBankTxnDialogOpen(true)
  }

  async function handleBankTxnSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    try {
      await recordBankTransaction({
        bankAccountId: bankTxnForm.bankAccountId,
        type: bankTxnForm.type,
        amount: Number(bankTxnForm.amount),
        date: bankTxnForm.date,
        toBankAccountId: bankTxnForm.type === 'transfer' ? bankTxnForm.toBankAccountId : undefined,
        counterAccountId:
          bankTxnForm.type === 'cheque_issued' || bankTxnForm.type === 'cheque_deposited' ? bankTxnForm.counterAccountId : undefined,
        chequeNumber: bankTxnForm.chequeNumber,
        payee: bankTxnForm.payee,
        note: bankTxnForm.note,
      })
      setBankTxnDialogOpen(false)
      setFeedback('Bank transaction recorded.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record bank transaction.')
    }
  }

  const [bankRegisterAccountId, setBankRegisterAccountId] = useState('')
  const bankRegister = useMemo(() => {
    const bankAccount = bankAccountsList.find((account) => account.id === bankRegisterAccountId)
    if (!bankAccount) return []
    const chartAccount = accounts.find((account) => account.id === bankAccount.chartAccountId)
    if (!chartAccount) return []

    const relevant = bankTransactions
      .filter((transaction) => transaction.bankAccountId === bankRegisterAccountId || transaction.toBankAccountId === bankRegisterAccountId)
      .sort((left, right) => left.date.localeCompare(right.date))

    let running = bankAccount.openingBalance
    return relevant.map((transaction) => {
      const legEntries = entries.filter(
        (entry) => entry.orderId === transaction.id && resolveAccountForEntry(entry, accounts)?.id === chartAccount.id
      )
      const debit = legEntries.reduce((sum, entry) => sum + entry.debit, 0)
      const credit = legEntries.reduce((sum, entry) => sum + entry.credit, 0)
      running += debit - credit
      return { transaction, debit, credit, balance: running }
    })
  }, [bankTransactions, bankRegisterAccountId, bankAccountsList, accounts, entries])

  // ---- Customer Receivable (Section 30) ------------------------------
  const [arFrom, setArFrom] = useState(dateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [arTo, setArTo] = useState(dateInputValue())
  const [arCustomerId, setArCustomerId] = useState('')

  const receivableRows = useMemo(() => {
    const boundaryTo = `${arTo}T23:59:59.999Z`
    return customers
      .map((customer) => {
        const customerEntries = entries.filter((entry) => entry.account === 'customer' && entry.accountRef === customer.id)
        const opening =
          (customer.openingBalance ?? 0) +
          customerEntries
            .filter((entry) => entry.date < arFrom)
            .reduce((sum, entry) => sum + entry.debit - entry.credit, 0)

        const inPeriod = customerEntries.filter((entry) => entry.date >= arFrom && entry.date <= boundaryTo)
        const totals = { sales: 0, return: 0, collection: 0, adjustment: 0 }
        inPeriod.forEach((entry) => {
          const kind = classifyCustomerEntry(entry)
          totals[kind] += entry.debit - entry.credit
        })
        const closing = opening + totals.sales + totals.return + totals.collection + totals.adjustment

        return { customer, opening, ...totals, closing }
      })
      .filter((row) => row.opening !== 0 || row.sales !== 0 || row.return !== 0 || row.collection !== 0 || row.adjustment !== 0)
      .sort((left, right) => right.closing - left.closing)
  }, [customers, entries, arFrom, arTo])

  const receivableStatement = useMemo(() => {
    if (!arCustomerId) return []
    const customerEntries = entries
      .filter((entry) => entry.account === 'customer' && entry.accountRef === arCustomerId)
      .sort((left, right) => left.date.localeCompare(right.date))
    const customer = customers.find((entry) => entry.id === arCustomerId)
    let running = customer?.openingBalance ?? 0
    return customerEntries.map((entry) => {
      running += entry.debit - entry.credit
      return { entry, kind: classifyCustomerEntry(entry), balance: running }
    })
  }, [entries, customers, arCustomerId])

  const receivableAging = useMemo(() => {
    const byCustomer = new Map<string, Record<AgingBucket, number>>()
    orders
      .filter((order) => order.due > 0)
      .forEach((order) => {
        const dueDate = order.paymentDueDate || order.deliveryDate || order.createdAt
        const bucket = agingBucketFor(daysBetween(arTo, dueDate))
        const row = byCustomer.get(order.customerId) ?? { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
        row[bucket] += order.due
        byCustomer.set(order.customerId, row)
      })
    return Array.from(byCustomer.entries())
      .map(([customerId, buckets]) => {
        const customer = customers.find((entry) => entry.id === customerId)
        const total = AGING_BUCKETS.reduce((sum, bucket) => sum + buckets[bucket], 0)
        return { customerId, customerName: customer?.name ?? 'Unknown customer', buckets, total }
      })
      .sort((left, right) => right.total - left.total)
  }, [orders, customers, arTo])

  // ---- Supplier Payable (Section 30) ----------------------------------
  const [apFrom, setApFrom] = useState(dateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [apTo, setApTo] = useState(dateInputValue())
  const [apSupplierId, setApSupplierId] = useState('')

  const payableRows = useMemo(() => {
    const boundaryTo = `${apTo}T23:59:59.999Z`
    return suppliers
      .map((supplier) => {
        const supplierEntries = entries.filter((entry) => entry.account === 'accounts_payable' && entry.accountRef === supplier.id)
        const opening =
          (supplier.openingBalance ?? 0) +
          supplierEntries
            .filter((entry) => entry.date < apFrom)
            .reduce((sum, entry) => sum + entry.credit - entry.debit, 0)

        const inPeriod = supplierEntries.filter((entry) => entry.date >= apFrom && entry.date <= boundaryTo)
        const totals = { purchase: 0, return: 0, payment: 0, adjustment: 0 }
        inPeriod.forEach((entry) => {
          const kind = classifySupplierEntry(entry)
          totals[kind] += entry.credit - entry.debit
        })
        const due = opening + totals.purchase + totals.return + totals.payment + totals.adjustment

        return { supplier, opening, ...totals, due }
      })
      .filter((row) => row.opening !== 0 || row.purchase !== 0 || row.return !== 0 || row.payment !== 0 || row.adjustment !== 0)
      .sort((left, right) => right.due - left.due)
  }, [suppliers, entries, apFrom, apTo])

  const payableStatement = useMemo(() => {
    if (!apSupplierId) return []
    const supplierEntries = entries
      .filter((entry) => entry.account === 'accounts_payable' && entry.accountRef === apSupplierId)
      .sort((left, right) => left.date.localeCompare(right.date))
    const supplier = suppliers.find((entry) => entry.id === apSupplierId)
    let running = supplier?.openingBalance ?? 0
    return supplierEntries.map((entry) => {
      running += entry.credit - entry.debit
      return { entry, kind: classifySupplierEntry(entry), balance: running }
    })
  }, [entries, suppliers, apSupplierId])

  const payableAging = useMemo(() => {
    const bySupplier = new Map<string, Record<AgingBucket, number>>()
    purchaseOrders
      .filter((po) => po.due > 0)
      .forEach((po) => {
        const supplier = suppliers.find((entry) => entry.id === po.supplierId)
        const creditDays = supplier?.creditDays && supplier.creditDays > 0 ? supplier.creditDays : 30
        const dueDate = new Date(new Date(po.createdAt).getTime() + creditDays * 86_400_000).toISOString()
        const bucket = agingBucketFor(daysBetween(apTo, dueDate))
        const row = bySupplier.get(po.supplierId) ?? { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
        row[bucket] += po.due
        bySupplier.set(po.supplierId, row)
      })
    return Array.from(bySupplier.entries())
      .map(([supplierId, buckets]) => {
        const supplier = suppliers.find((entry) => entry.id === supplierId)
        const total = AGING_BUCKETS.reduce((sum, bucket) => sum + buckets[bucket], 0)
        return { supplierId, supplierName: supplier?.name ?? 'Unknown supplier', buckets, total }
      })
      .sort((left, right) => right.total - left.total)
  }, [purchaseOrders, suppliers, apTo])

  // ---- Budget Management (Section 37) ----------------------------------
  function emptyBudgetForm() {
    const now = new Date()
    return {
      category: EXPENSE_CATEGORIES[0] as string,
      periodType: 'monthly' as BudgetPeriodType,
      year: String(now.getFullYear()),
      month: String(now.getMonth() + 1),
      budgetAmount: '0',
      note: '',
    }
  }

  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false)
  const [editingBudgetId, setEditingBudgetId] = useState<string | undefined>(undefined)
  const [budgetForm, setBudgetForm] = useState(emptyBudgetForm())

  function openNewBudgetDialog() {
    setEditingBudgetId(undefined)
    setBudgetForm(emptyBudgetForm())
    setFeedback(null)
    setBudgetDialogOpen(true)
  }

  function openEditBudgetDialog(budget: BudgetRecord) {
    setEditingBudgetId(budget.id)
    setBudgetForm({
      category: budget.category,
      periodType: budget.periodType,
      year: String(budget.year),
      month: String(budget.month || new Date().getMonth() + 1),
      budgetAmount: String(budget.budgetAmount),
      note: budget.note,
    })
    setFeedback(null)
    setBudgetDialogOpen(true)
  }

  async function handleBudgetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    try {
      await saveBudget(
        {
          category: budgetForm.category,
          periodType: budgetForm.periodType,
          year: Number(budgetForm.year),
          month: budgetForm.periodType === 'monthly' ? Number(budgetForm.month) : undefined,
          budgetAmount: Number(budgetForm.budgetAmount) || 0,
          note: budgetForm.note,
        },
        editingBudgetId
      )
      setBudgetDialogOpen(false)
      setFeedback('Budget saved.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save budget.')
    }
  }

  async function handleDeleteBudget(budgetId: string) {
    setFeedback(null)
    try {
      await deleteBudget(budgetId)
      setFeedback('Budget deleted.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete budget.')
    }
  }

  // Budget vs Actual vs Overrun — Actual is never stored (see
  // getBudgetActual in provider.tsx), so it's recomputed live here every
  // time expenses or budgets change, the same figure the overrun-alert
  // notification (checkBudgetOverrun) is checked against on every expense
  // save.
  const budgetRows = useMemo(
    () =>
      budgets.map((budget) => {
        const actual = getBudgetActual(expenses, budget)
        const overrun = actual - budget.budgetAmount
        return { budget, actual, overrun, isOverrun: overrun > 0 }
      }),
    [budgets, expenses]
  )

  return (
    <AdminShell active="Accounting Module">
      <div className="space-y-8">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Accounting Module</p>
            <p className="text-xs text-muted-foreground">
              Double-entry books built on the Automatic Accounting Engine — Chart of Accounts, Journal, General Ledger,
              Trial Balance, P&amp;L, Balance Sheet, and Cash Flow.
            </p>
          </div>
          {accounts.length === 0 ? (
            <Button className="rounded-xl" onClick={() => void handleSeedStandardChart()} disabled={!canEdit}>
              <Plus className="mr-2 h-4 w-4" />
              Load standard chart of accounts
            </Button>
          ) : null}
        </div>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        {accounts.length === 0 ? (
          <Card className="border-dashed border-border/70 shadow-none">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No chart of accounts yet — every automatic posting (Sales, Purchase, Sales Cost, Collection, Supplier
              Payment, Expense) is already flowing into the ledger, but it has nowhere to be labelled until accounts
              exist. Click &ldquo;Load standard chart of accounts&rdquo; above to seed the Section 28 hierarchy.
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={section === id ? 'default' : 'outline'}
              className="rounded-xl"
              onClick={() => setSection(id)}
            >
              <Icon className="mr-2 h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>

        <Separator />

        {section === 'coa' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader
                icon={BookOpenText}
                title="Chart of accounts"
                description="Assets, Liabilities, Equity, Revenue, and Expenses hierarchy (Section 28)."
              />
              <div className="flex gap-2">
                {accounts.length > 0 ? (
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => void handleSeedStandardChart()} disabled={!canEdit}>
                    Fill in missing standard accounts
                  </Button>
                ) : null}
                <Button type="button" className="rounded-xl" onClick={openNewAccountDialog} disabled={!canEdit}>
                  <Plus className="mr-2 h-4 w-4" />
                  New account
                </Button>
              </div>
            </div>

            {(['asset', 'liability', 'equity', 'revenue', 'expense'] as AccountType[]).map((type) => {
              const rows = accounts.filter((account) => account.type === type)
              if (rows.length === 0) return null
              return (
                <Card key={type} className="border-border/70 shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {ACCOUNT_TYPE_LABEL[type]}
                      <Badge variant="outline" className={cn('rounded-full', ACCOUNT_TYPE_TONE[type])}>
                        {rows.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-2xl border border-border/70">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead>Code</TableHead>
                            <TableHead>Account</TableHead>
                            <TableHead>Opening balance</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((account) => (
                            <TableRow key={account.id}>
                              <TableCell className="font-mono text-xs">{account.code}</TableCell>
                              <TableCell className="font-medium">
                                {account.name}
                                {account.isSystem ? (
                                  <Badge variant="outline" className="ml-2 rounded-full text-[10px]">
                                    System
                                  </Badge>
                                ) : null}
                              </TableCell>
                              <TableCell>{formatCurrency(account.openingBalance, currency)}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'rounded-full',
                                    account.status === 'active'
                                      ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                                      : 'border-border bg-muted text-muted-foreground'
                                  )}
                                >
                                  {account.status}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-2">
                                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openEditAccountDialog(account)} disabled={!canEdit}>
                                    Edit
                                  </Button>
                                  {!account.isSystem ? (
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-9 w-9 text-destructive hover:text-destructive"
                                      onClick={() => void handleDeleteAccount(account.id)}
                                      disabled={!canEdit}
                                      aria-label="Delete account"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingAccountId ? 'Edit account' : 'New account'}</DialogTitle>
                  <DialogDescription>Add a manual account for journal entries — code must be unique.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleAccountSubmit}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Code</p>
                      <Input
                        value={accountForm.code}
                        onChange={(event) => setAccountForm((current) => ({ ...current, code: event.target.value }))}
                        placeholder="e.g. 5013"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Type</p>
                      <Select
                        value={accountForm.type}
                        onValueChange={(value) => setAccountForm((current) => ({ ...current, type: value as AccountType }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((type) => (
                            <SelectItem key={type} value={type}>
                              {ACCOUNT_TYPE_LABEL[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Account name</p>
                    <Input
                      value={accountForm.name}
                      onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="e.g. Owner's Advance"
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Opening balance ({currency ?? 'BDT'})</p>
                      <Input
                        type="number"
                        value={accountForm.openingBalance}
                        onChange={(event) => setAccountForm((current) => ({ ...current, openingBalance: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Status</p>
                      <Select
                        value={accountForm.status}
                        onValueChange={(value) => setAccountForm((current) => ({ ...current, status: value as ChartOfAccountRecord['status'] }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setAccountDialogOpen(false)}>Cancel</Button>
                    <Button type="submit">Save account</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </section>
        ) : null}

        {section === 'journal' ? (
          <section className="space-y-4">
            <SectionHeader icon={ScrollText} title="Journal" description="Manual double-entry vouchers — must balance before posting." />
            <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle>New journal entry</CardTitle>
                  <CardDescription>Anything the automatic engine doesn&apos;t post on its own — capital, loans, depreciation, corrections.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={handleJournalSubmit}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Date</p>
                        <Input type="date" value={journalForm.date} onChange={(event) => setJournalForm((current) => ({ ...current, date: event.target.value }))} required />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Narration</p>
                      <Textarea
                        value={journalForm.narration}
                        onChange={(event) => setJournalForm((current) => ({ ...current, narration: event.target.value }))}
                        placeholder="What is this entry for?"
                        required
                      />
                    </div>
                    <div className="space-y-3">
                      {journalForm.lines.map((line, index) => (
                        <div key={index} className="grid gap-2 rounded-xl border border-border/70 p-3 sm:grid-cols-[1.4fr_0.8fr_0.8fr_auto]">
                          <Select value={line.accountId} onValueChange={(value) => updateJournalLine(index, { accountId: value })}>
                            <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
                            <SelectContent>
                              {activeAccounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.code} — {account.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min="0"
                            placeholder="Debit"
                            value={line.debit}
                            onChange={(event) => updateJournalLine(index, { debit: event.target.value, credit: Number(event.target.value) > 0 ? '0' : line.credit })}
                          />
                          <Input
                            type="number"
                            min="0"
                            placeholder="Credit"
                            value={line.credit}
                            onChange={(event) => updateJournalLine(index, { credit: event.target.value, debit: Number(event.target.value) > 0 ? '0' : line.debit })}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => removeJournalLine(index)}
                            disabled={journalForm.lines.length <= 2}
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={addJournalLine}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add line
                      </Button>
                    </div>
                    <div className={cn('flex items-center justify-between rounded-xl border p-3 text-sm', journalTotals.balanced ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300' : 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300')}>
                      <span>Debit {formatCurrency(journalTotals.debit, currency)}</span>
                      <span>Credit {formatCurrency(journalTotals.credit, currency)}</span>
                      <span>{journalTotals.balanced ? 'Balanced' : 'Not balanced'}</span>
                    </div>
                    <Button type="submit" className="rounded-xl" disabled={!canEdit || !journalTotals.balanced}>
                      Post journal entry
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle>Posted vouchers</CardTitle>
                  <CardDescription>Never edited or deleted — only reversed, keeping the audit trail intact.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {journalEntries.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">No journal entries posted yet.</p>
                  ) : null}
                  {journalEntries.map((journal) => (
                    <div key={journal.id} className="space-y-2 rounded-xl border border-border/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{journal.journalNumber}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(journal.date)} · {journal.narration}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              'rounded-full',
                              journal.status === 'posted'
                                ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                                : 'border-border bg-muted text-muted-foreground'
                            )}
                          >
                            {journal.status}
                          </Badge>
                          {journal.status === 'posted' ? (
                            <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void handleReverseJournal(journal.id)} disabled={!canEdit}>
                              <Undo2 className="mr-2 h-4 w-4" />
                              Reverse
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-border/50">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableHead>Account</TableHead>
                              <TableHead className="text-right">Debit</TableHead>
                              <TableHead className="text-right">Credit</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {journal.lines.map((line, index) => (
                              <TableRow key={index}>
                                <TableCell>{line.accountName}</TableCell>
                                <TableCell className="text-right">{line.debit > 0 ? formatCurrency(line.debit, currency) : '—'}</TableCell>
                                <TableCell className="text-right">{line.credit > 0 ? formatCurrency(line.credit, currency) : '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </section>
        ) : null}

        {section === 'ledger' ? (
          <section className="space-y-4">
            <SectionHeader icon={Layers} title="General ledger" description="Every posting — automatic or manual — against one account, with a running balance." />
            <div className="flex flex-wrap gap-3">
              <Select value={ledgerAccountId} onValueChange={setLedgerAccountId}>
                <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Select an account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} — {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input className="w-full sm:w-44" type="date" value={ledgerFrom} onChange={(event) => setLedgerFrom(event.target.value)} placeholder="From" />
              <Input className="w-full sm:w-44" type="date" value={ledgerTo} onChange={(event) => setLedgerTo(event.target.value)} placeholder="To" />
            </div>
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Date</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerRows.map(({ entry, balance }) => (
                        <TableRow key={entry.id} className={cn(entry.reversalOf && 'text-muted-foreground')}>
                          <TableCell>{formatDate(entry.date)}</TableCell>
                          <TableCell className="font-mono text-xs">{entry.billNumber}</TableCell>
                          <TableCell>{entry.description}</TableCell>
                          <TableCell className="text-right">{entry.debit > 0 ? formatCurrency(entry.debit, currency) : '—'}</TableCell>
                          <TableCell className="text-right">{entry.credit > 0 ? formatCurrency(entry.credit, currency) : '—'}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(balance, currency)}</TableCell>
                        </TableRow>
                      ))}
                      {ledgerRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                            {ledgerAccountId ? 'No postings for this account in range.' : 'Select an account to view its ledger.'}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {section === 'trial' ? (
          <section className="space-y-4">
            <SectionHeader icon={Scale} title="Trial balance" description="Every account's Dr/Cr balance as of a date — must total equal." />
            <Input className="w-full sm:w-52" type="date" value={trialAsOf} onChange={(event) => setTrialAsOf(event.target.value)} />
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Code</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trialRows
                        .filter((row) => row.dr !== 0 || row.cr !== 0)
                        .map((row) => (
                          <TableRow key={row.account.id}>
                            <TableCell className="font-mono text-xs">{row.account.code}</TableCell>
                            <TableCell>{row.account.name}</TableCell>
                            <TableCell className="text-right">{row.dr !== 0 ? formatCurrency(row.dr, currency) : '—'}</TableCell>
                            <TableCell className="text-right">{row.cr !== 0 ? formatCurrency(row.cr, currency) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                        <TableCell colSpan={2}>Total</TableCell>
                        <TableCell className="text-right">{formatCurrency(trialTotals.dr, currency)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(trialTotals.cr, currency)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            <p className={cn('text-sm', Math.abs(trialTotals.dr - trialTotals.cr) < 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
              {Math.abs(trialTotals.dr - trialTotals.cr) < 1 ? 'Books are balanced.' : 'Totals do not match — check recent postings.'}
            </p>
          </section>
        ) : null}

        {section === 'pl' ? (
          <section className="space-y-4">
            <SectionHeader icon={TrendingUp} title="Profit &amp; loss" description="Revenue, COGS, and operating expenses for a period." />
            <div className="flex flex-wrap gap-3">
              <Input className="w-full sm:w-44" type="date" value={plFrom} onChange={(event) => setPlFrom(event.target.value)} />
              <Input className="w-full sm:w-44" type="date" value={plTo} onChange={(event) => setPlTo(event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Gross profit</p>
                  <p className="mt-2 text-2xl font-semibold">{formatCurrency(profitAndLoss.grossProfit, currency)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Operating expenses</p>
                  <p className="mt-2 text-2xl font-semibold">{formatCurrency(profitAndLoss.totalOpex, currency)}</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Net profit</p>
                  <p className={cn('mt-2 text-2xl font-semibold', profitAndLoss.netProfit < 0 && 'text-destructive')}>
                    {formatCurrency(profitAndLoss.netProfit, currency)}
                  </p>
                </CardContent>
              </Card>
            </div>
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableBody>
                      <TableRow className="bg-muted/40 hover:bg-muted/40"><TableCell className="font-semibold" colSpan={2}>Revenue</TableCell></TableRow>
                      {profitAndLoss.revenueLines.filter((line) => line.amount !== 0).map((line) => (
                        <TableRow key={line.account.id}>
                          <TableCell className="pl-8">{line.account.name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.amount, currency)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow><TableCell className="pl-8 font-medium">Total revenue</TableCell><TableCell className="text-right font-medium">{formatCurrency(profitAndLoss.totalRevenue, currency)}</TableCell></TableRow>
                      <TableRow><TableCell className="pl-8">Cost of goods sold</TableCell><TableCell className="text-right">({formatCurrency(profitAndLoss.cogsAmount, currency)})</TableCell></TableRow>
                      <TableRow className="font-semibold"><TableCell className="pl-8">Gross profit</TableCell><TableCell className="text-right">{formatCurrency(profitAndLoss.grossProfit, currency)}</TableCell></TableRow>
                      <TableRow className="bg-muted/40 hover:bg-muted/40"><TableCell className="font-semibold" colSpan={2}>Operating expenses</TableCell></TableRow>
                      {profitAndLoss.opexLines.map((line) => (
                        <TableRow key={line.account.id}>
                          <TableCell className="pl-8">{line.account.name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.amount, currency)}</TableCell>
                        </TableRow>
                      ))}
                      {profitAndLoss.opexLines.length === 0 ? (
                        <TableRow><TableCell className="pl-8 text-muted-foreground" colSpan={2}>No expenses recorded in this period.</TableCell></TableRow>
                      ) : null}
                      <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                        <TableCell>Net profit / loss</TableCell>
                        <TableCell className="text-right">{formatCurrency(profitAndLoss.netProfit, currency)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {section === 'bs' ? (
          <section className="space-y-4">
            <SectionHeader icon={Landmark} title="Balance sheet" description="Assets = Liabilities + Equity, as of a date." />
            <Input className="w-full sm:w-52" type="date" value={bsAsOf} onChange={(event) => setBsAsOf(event.target.value)} />
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border/70 shadow-sm">
                <CardHeader><CardTitle>Assets</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      {balanceSheet.assetLines.filter((line) => line.amount !== 0).map((line) => (
                        <TableRow key={line.account.id}>
                          <TableCell>{line.account.name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.amount, currency)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                        <TableCell>Total assets</TableCell>
                        <TableCell className="text-right">{formatCurrency(balanceSheet.totalAssets, currency)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardHeader><CardTitle>Liabilities &amp; equity</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      <TableRow className="hover:bg-transparent"><TableCell className="font-medium" colSpan={2}>Liabilities</TableCell></TableRow>
                      {balanceSheet.liabilityLines.filter((line) => line.amount !== 0).map((line) => (
                        <TableRow key={line.account.id}>
                          <TableCell className="pl-6">{line.account.name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.amount, currency)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow><TableCell className="pl-6 font-medium">Total liabilities</TableCell><TableCell className="text-right font-medium">{formatCurrency(balanceSheet.totalLiabilities, currency)}</TableCell></TableRow>
                      <TableRow className="hover:bg-transparent"><TableCell className="font-medium" colSpan={2}>Equity</TableCell></TableRow>
                      {balanceSheet.equityLines.filter((line) => line.amount !== 0).map((line) => (
                        <TableRow key={line.account.id}>
                          <TableCell className="pl-6">{line.account.name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.amount, currency)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell className="pl-6">Retained earnings (accumulated profit)</TableCell>
                        <TableCell className="text-right">{formatCurrency(balanceSheet.retainedEarnings, currency)}</TableCell>
                      </TableRow>
                      <TableRow><TableCell className="pl-6 font-medium">Total equity</TableCell><TableCell className="text-right font-medium">{formatCurrency(balanceSheet.totalEquity, currency)}</TableCell></TableRow>
                      <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                        <TableCell>Total liabilities &amp; equity</TableCell>
                        <TableCell className="text-right">{formatCurrency(balanceSheet.totalLiabilities + balanceSheet.totalEquity, currency)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
            <p className={cn('text-sm', balanceSheet.balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
              {balanceSheet.balanced ? 'Balanced ✓' : 'Not balanced — check recent postings.'}
            </p>
          </section>
        ) : null}

        {section === 'cashflow' ? (
          <section className="space-y-4">
            <SectionHeader icon={Wallet} title="Cash flow" description="Cash and bank movement for a period (direct method)." />
            <div className="flex flex-wrap gap-3">
              <Input className="w-full sm:w-44" type="date" value={cfFrom} onChange={(event) => setCfFrom(event.target.value)} />
              <Input className="w-full sm:w-44" type="date" value={cfTo} onChange={(event) => setCfTo(event.target.value)} />
            </div>
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Opening</TableHead>
                        <TableHead className="text-right">Cash in</TableHead>
                        <TableHead className="text-right">Cash out</TableHead>
                        <TableHead className="text-right">Closing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashFlow.map((row) => (
                        <TableRow key={row.account.id}>
                          <TableCell>{row.account.name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.opening, currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.cashIn, currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.cashOut, currency)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(row.closing, currency)}</TableCell>
                        </TableRow>
                      ))}
                      {cashFlow.length === 0 ? (
                        <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Load the standard chart of accounts to see Cash/Bank.</TableCell></TableRow>
                      ) : null}
                      <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right">{formatCurrency(cashFlowTotals.opening, currency)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(cashFlowTotals.cashIn, currency)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(cashFlowTotals.cashOut, currency)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(cashFlowTotals.closing, currency)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {section === 'bank' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader icon={Banknote} title="Bank management" description="Multiple bank accounts — Deposit, Withdrawal, Transfer, Cheque, Bank Charge (Section 35)." />
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => openBankTxnDialog()} disabled={!canEdit || bankAccountsList.length === 0}>
                  <Wallet className="mr-2 h-4 w-4" />
                  Record transaction
                </Button>
                <Button type="button" className="rounded-xl" onClick={openNewBankAccountDialog} disabled={!canEdit}>
                  <Plus className="mr-2 h-4 w-4" />
                  New bank account
                </Button>
              </div>
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Bank</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Account number</TableHead>
                        <TableHead className="text-right">Opening balance</TableHead>
                        <TableHead className="text-right">Current balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bankAccountsList.map((bankAccount) => (
                        <TableRow key={bankAccount.id}>
                          <TableCell className="font-medium">{bankAccount.bankName}</TableCell>
                          <TableCell>{bankAccount.branch || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{bankAccount.accountNumber}</TableCell>
                          <TableCell className="text-right">{formatCurrency(bankAccount.openingBalance, currency)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(bankAccountBalance(bankAccount), currency)}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                'rounded-full',
                                bankAccount.status === 'active'
                                  ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                                  : 'border-border bg-muted text-muted-foreground'
                              )}
                            >
                              {bankAccount.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => { setBankRegisterAccountId(bankAccount.id); }}>
                                View
                              </Button>
                              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openEditBankAccountDialog(bankAccount)} disabled={!canEdit}>
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                onClick={() => void handleDeleteBankAccount(bankAccount.id)}
                                disabled={!canEdit}
                                aria-label="Delete bank account"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {bankAccountsList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            No bank accounts yet — add one to start recording deposits, withdrawals, transfers, cheques, and bank charges.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Bank book</CardTitle>
                <CardDescription>Every transaction against one account, with a running balance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={bankRegisterAccountId} onValueChange={setBankRegisterAccountId}>
                  <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Select a bank account" /></SelectTrigger>
                  <SelectContent>
                    {bankAccountsList.map((bankAccount) => (
                      <SelectItem key={bankAccount.id} value={bankAccount.id}>
                        {bankAccount.bankName} — {bankAccount.accountNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bankRegister.map(({ transaction, debit, credit, balance }) => (
                        <TableRow key={transaction.id}>
                          <TableCell>{formatDate(transaction.date)}</TableCell>
                          <TableCell>{BANK_TXN_TYPE_LABEL[transaction.type]}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {[transaction.toBankLabel, transaction.counterAccountName, transaction.payee, transaction.chequeNumber ? `Cheque ${transaction.chequeNumber}` : '', transaction.note]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </TableCell>
                          <TableCell className="text-right">{debit > 0 ? formatCurrency(debit, currency) : '—'}</TableCell>
                          <TableCell className="text-right">{credit > 0 ? formatCurrency(credit, currency) : '—'}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(balance, currency)}</TableCell>
                        </TableRow>
                      ))}
                      {bankRegister.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                            {bankRegisterAccountId ? 'No transactions for this account yet.' : 'Select a bank account to view its book.'}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Dialog open={bankAccountDialogOpen} onOpenChange={setBankAccountDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingBankAccountId ? 'Edit bank account' : 'New bank account'}</DialogTitle>
                  <DialogDescription>Account number must be unique across bank accounts.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleBankAccountSubmit}>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Bank name<span className="ml-0.5 text-rose-500">*</span></p>
                    <Input
                      value={bankAccountForm.bankName}
                      onChange={(event) => setBankAccountForm((current) => ({ ...current, bankName: event.target.value }))}
                      placeholder="e.g. Dutch-Bangla Bank"
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Branch</p>
                      <Input
                        value={bankAccountForm.branch}
                        onChange={(event) => setBankAccountForm((current) => ({ ...current, branch: event.target.value }))}
                        placeholder="e.g. Nawabpur Road"
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Account number<span className="ml-0.5 text-rose-500">*</span></p>
                      <Input
                        value={bankAccountForm.accountNumber}
                        onChange={(event) => setBankAccountForm((current) => ({ ...current, accountNumber: event.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Opening balance ({currency ?? 'BDT'})</p>
                      <Input
                        type="number"
                        value={bankAccountForm.openingBalance}
                        onChange={(event) => setBankAccountForm((current) => ({ ...current, openingBalance: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Status</p>
                      <Select
                        value={bankAccountForm.status}
                        onValueChange={(value) => setBankAccountForm((current) => ({ ...current, status: value as BankAccountRecord['status'] }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setBankAccountDialogOpen(false)}>Cancel</Button>
                    <Button type="submit">Save bank account</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={bankTxnDialogOpen} onOpenChange={setBankTxnDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record bank transaction</DialogTitle>
                  <DialogDescription>Deposit/Withdrawal move against Cash; Transfer moves between two bank accounts.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleBankTxnSubmit}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Bank account<span className="ml-0.5 text-rose-500">*</span></p>
                      <Select
                        value={bankTxnForm.bankAccountId}
                        onValueChange={(value) => setBankTxnForm((current) => ({ ...current, bankAccountId: value }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                        <SelectContent>
                          {bankAccountsList.map((bankAccount) => (
                            <SelectItem key={bankAccount.id} value={bankAccount.id}>
                              {bankAccount.bankName} — {bankAccount.accountNumber}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Type</p>
                      <Select
                        value={bankTxnForm.type}
                        onValueChange={(value) => setBankTxnForm((current) => ({ ...current, type: value as BankTransactionType }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(BANK_TXN_TYPE_LABEL) as BankTransactionType[]).map((type) => (
                            <SelectItem key={type} value={type}>{BANK_TXN_TYPE_LABEL[type]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Amount ({currency ?? 'BDT'})<span className="ml-0.5 text-rose-500">*</span></p>
                      <Input
                        type="number"
                        min="1"
                        value={bankTxnForm.amount}
                        onChange={(event) => setBankTxnForm((current) => ({ ...current, amount: event.target.value }))}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Date</p>
                      <Input type="date" value={bankTxnForm.date} onChange={(event) => setBankTxnForm((current) => ({ ...current, date: event.target.value }))} />
                    </div>
                  </div>

                  {bankTxnForm.type === 'transfer' ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">To bank account<span className="ml-0.5 text-rose-500">*</span></p>
                      <Select
                        value={bankTxnForm.toBankAccountId}
                        onValueChange={(value) => setBankTxnForm((current) => ({ ...current, toBankAccountId: value }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Select destination account" /></SelectTrigger>
                        <SelectContent>
                          {bankAccountsList
                            .filter((bankAccount) => bankAccount.id !== bankTxnForm.bankAccountId)
                            .map((bankAccount) => (
                              <SelectItem key={bankAccount.id} value={bankAccount.id}>
                                {bankAccount.bankName} — {bankAccount.accountNumber}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}

                  {bankTxnForm.type === 'cheque_issued' || bankTxnForm.type === 'cheque_deposited' ? (
                    <>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Against account<span className="ml-0.5 text-rose-500">*</span></p>
                        <Select
                          value={bankTxnForm.counterAccountId}
                          onValueChange={(value) => setBankTxnForm((current) => ({ ...current, counterAccountId: value }))}
                        >
                          <SelectTrigger><SelectValue placeholder="What is this cheque for?" /></SelectTrigger>
                          <SelectContent>
                            {activeAccounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>{account.code} — {account.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-foreground">Cheque number</p>
                          <Input value={bankTxnForm.chequeNumber} onChange={(event) => setBankTxnForm((current) => ({ ...current, chequeNumber: event.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-foreground">Payee / payer</p>
                          <Input value={bankTxnForm.payee} onChange={(event) => setBankTxnForm((current) => ({ ...current, payee: event.target.value }))} />
                        </div>
                      </div>
                    </>
                  ) : null}

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Note <span className="font-normal text-muted-foreground">(optional)</span></p>
                    <Input value={bankTxnForm.note} onChange={(event) => setBankTxnForm((current) => ({ ...current, note: event.target.value }))} />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setBankTxnDialogOpen(false)}>Cancel</Button>
                    <Button type="submit">Record transaction</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </section>
        ) : null}

        {section === 'receivable' ? (
          <section className="space-y-4">
            <SectionHeader icon={Users} title="Customer receivable" description="Per-customer Opening/Sales/Sales Return/Collection/Adjustment/Closing (Section 30)." />
            <div className="flex flex-wrap gap-3">
              <Input className="w-full sm:w-44" type="date" value={arFrom} onChange={(event) => setArFrom(event.target.value)} />
              <Input className="w-full sm:w-44" type="date" value={arTo} onChange={(event) => setArTo(event.target.value)} />
            </div>
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Opening</TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                        <TableHead className="text-right">Sales return</TableHead>
                        <TableHead className="text-right">Collection</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                        <TableHead className="text-right">Adjustment</TableHead>
                        <TableHead className="text-right">Closing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receivableRows.map((row) => (
                        <TableRow key={row.customer.id} className="cursor-pointer" onClick={() => setArCustomerId(row.customer.id)}>
                          <TableCell className="font-medium">{row.customer.name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.opening, currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.sales, currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(-row.return, currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(-row.collection, currency)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">—</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.adjustment, currency)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(row.closing, currency)}</TableCell>
                        </TableRow>
                      ))}
                      {receivableRows.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No customer activity in this period.</TableCell></TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">Discount isn&apos;t tracked as a separate ledger line yet — it&apos;s already netted into each invoice&apos;s total at creation. Click a row for the full statement below.</p>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Customer statement</CardTitle>
                <CardDescription>Full transaction history with running balance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={arCustomerId} onValueChange={setArCustomerId}>
                  <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Select a customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receivableStatement.map(({ entry, kind, balance }) => (
                        <TableRow key={entry.id}>
                          <TableCell>{formatDate(entry.date)}</TableCell>
                          <TableCell className="capitalize">{kind}</TableCell>
                          <TableCell>{entry.description}</TableCell>
                          <TableCell className="text-right">{entry.debit > 0 ? formatCurrency(entry.debit, currency) : '—'}</TableCell>
                          <TableCell className="text-right">{entry.credit > 0 ? formatCurrency(entry.credit, currency) : '—'}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(balance, currency)}</TableCell>
                        </TableRow>
                      ))}
                      {receivableStatement.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">{arCustomerId ? 'No transactions for this customer.' : 'Select a customer to view their statement.'}</TableCell></TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Aging report</CardTitle>
                <CardDescription>Outstanding invoice due, bucketed by days past the payment due date (as of {formatDate(arTo)}).</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Customer</TableHead>
                        {AGING_BUCKETS.map((bucket) => (
                          <TableHead key={bucket} className="text-right">{AGING_LABEL[bucket]}</TableHead>
                        ))}
                        <TableHead className="text-right">Total due</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receivableAging.map((row) => (
                        <TableRow key={row.customerId}>
                          <TableCell className="font-medium">{row.customerName}</TableCell>
                          {AGING_BUCKETS.map((bucket) => (
                            <TableCell key={bucket} className="text-right">{row.buckets[bucket] > 0 ? formatCurrency(row.buckets[bucket], currency) : '—'}</TableCell>
                          ))}
                          <TableCell className="text-right font-semibold">{formatCurrency(row.total, currency)}</TableCell>
                        </TableRow>
                      ))}
                      {receivableAging.length === 0 ? (
                        <TableRow><TableCell colSpan={AGING_BUCKETS.length + 2} className="h-24 text-center text-muted-foreground">No outstanding customer dues.</TableCell></TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {section === 'payable' ? (
          <section className="space-y-4">
            <SectionHeader icon={Truck} title="Supplier payable" description="Per-supplier Purchase/Purchase Return/Payment/Due/Aging (Section 30)." />
            <div className="flex flex-wrap gap-3">
              <Input className="w-full sm:w-44" type="date" value={apFrom} onChange={(event) => setApFrom(event.target.value)} />
              <Input className="w-full sm:w-44" type="date" value={apTo} onChange={(event) => setApTo(event.target.value)} />
            </div>
            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Opening</TableHead>
                        <TableHead className="text-right">Purchase</TableHead>
                        <TableHead className="text-right">Purchase return</TableHead>
                        <TableHead className="text-right">Payment</TableHead>
                        <TableHead className="text-right">Due</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payableRows.map((row) => (
                        <TableRow key={row.supplier.id} className="cursor-pointer" onClick={() => setApSupplierId(row.supplier.id)}>
                          <TableCell className="font-medium">{row.supplier.name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.opening, currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(row.purchase, currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(-row.return, currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(-row.payment, currency)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(row.due, currency)}</TableCell>
                        </TableRow>
                      ))}
                      {payableRows.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No supplier activity in this period.</TableCell></TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">Click a row for the full statement below.</p>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Supplier statement</CardTitle>
                <CardDescription>Full transaction history with running balance.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={apSupplierId} onValueChange={setApSupplierId}>
                  <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Select a supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payableStatement.map(({ entry, kind, balance }) => (
                        <TableRow key={entry.id}>
                          <TableCell>{formatDate(entry.date)}</TableCell>
                          <TableCell className="capitalize">{kind}</TableCell>
                          <TableCell>{entry.description}</TableCell>
                          <TableCell className="text-right">{entry.debit > 0 ? formatCurrency(entry.debit, currency) : '—'}</TableCell>
                          <TableCell className="text-right">{entry.credit > 0 ? formatCurrency(entry.credit, currency) : '—'}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(balance, currency)}</TableCell>
                        </TableRow>
                      ))}
                      {payableStatement.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">{apSupplierId ? 'No transactions for this supplier.' : 'Select a supplier to view their statement.'}</TableCell></TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Aging report</CardTitle>
                <CardDescription>Outstanding bill due, bucketed by days past (order date + supplier credit days), as of {formatDate(apTo)}.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Supplier</TableHead>
                        {AGING_BUCKETS.map((bucket) => (
                          <TableHead key={bucket} className="text-right">{AGING_LABEL[bucket]}</TableHead>
                        ))}
                        <TableHead className="text-right">Total due</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payableAging.map((row) => (
                        <TableRow key={row.supplierId}>
                          <TableCell className="font-medium">{row.supplierName}</TableCell>
                          {AGING_BUCKETS.map((bucket) => (
                            <TableCell key={bucket} className="text-right">{row.buckets[bucket] > 0 ? formatCurrency(row.buckets[bucket], currency) : '—'}</TableCell>
                          ))}
                          <TableCell className="text-right font-semibold">{formatCurrency(row.total, currency)}</TableCell>
                        </TableRow>
                      ))}
                      {payableAging.length === 0 ? (
                        <TableRow><TableCell colSpan={AGING_BUCKETS.length + 2} className="h-24 text-center text-muted-foreground">No outstanding supplier dues.</TableCell></TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {section === 'budget' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader
                icon={PiggyBank}
                title="Budget management"
                description="Set a monthly or yearly budget per expense category — Actual tracks live expenses; an overrun alerts automatically (Section 37)."
              />
              <Button type="button" className="rounded-xl" onClick={openNewBudgetDialog} disabled={!canEdit}>
                <Plus className="mr-2 h-4 w-4" />
                New budget
              </Button>
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Category</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Budget</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Overrun</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {budgetRows.map(({ budget, actual, overrun, isOverrun }) => (
                        <TableRow key={budget.id}>
                          <TableCell className="font-medium">{budget.category}</TableCell>
                          <TableCell>
                            {budget.periodType === 'monthly' ? `${MONTH_LABELS[budget.month - 1] ?? budget.month} ${budget.year}` : budget.year}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(budget.budgetAmount, currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(actual, currency)}</TableCell>
                          <TableCell className={cn('text-right font-medium', isOverrun && 'text-rose-600 dark:text-rose-400')}>
                            {isOverrun ? formatCurrency(overrun, currency) : '—'}
                          </TableCell>
                          <TableCell>
                            {isOverrun ? (
                              <Badge
                                variant="outline"
                                className="gap-1 rounded-full border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300"
                              >
                                <AlertTriangle className="h-3 w-3" />
                                Overrun
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="rounded-full border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">
                                On track
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openEditBudgetDialog(budget)} disabled={!canEdit}>
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                onClick={() => void handleDeleteBudget(budget.id)}
                                disabled={!canEdit}
                                aria-label="Delete budget"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {budgetRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            No budgets set yet — add one per expense category to start tracking Actual vs. Budget.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingBudgetId ? 'Edit budget' : 'New budget'}</DialogTitle>
                  <DialogDescription>Plan spend for one expense category over one month or one calendar year.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleBudgetSubmit}>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Category</p>
                    <Select value={budgetForm.category} onValueChange={(value) => setBudgetForm((current) => ({ ...current, category: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>{category}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Period</p>
                    <Select
                      value={budgetForm.periodType}
                      onValueChange={(value) => setBudgetForm((current) => ({ ...current, periodType: value as BudgetPeriodType }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {budgetForm.periodType === 'monthly' ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Month</p>
                        <Select value={budgetForm.month} onValueChange={(value) => setBudgetForm((current) => ({ ...current, month: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MONTH_LABELS.map((label, index) => (
                              <SelectItem key={label} value={String(index + 1)}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Year</p>
                      <Input
                        type="number"
                        value={budgetForm.year}
                        onChange={(event) => setBudgetForm((current) => ({ ...current, year: event.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Budget amount ({currency ?? 'BDT'})<span className="ml-0.5 text-rose-500">*</span>
                    </p>
                    <Input
                      type="number"
                      min="1"
                      value={budgetForm.budgetAmount}
                      onChange={(event) => setBudgetForm((current) => ({ ...current, budgetAmount: event.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Note <span className="font-normal text-muted-foreground">(optional)</span>
                    </p>
                    <Textarea
                      value={budgetForm.note}
                      onChange={(event) => setBudgetForm((current) => ({ ...current, note: event.target.value }))}
                      rows={2}
                    />
                  </div>
                  <Button type="submit" className="w-full rounded-xl">
                    Save budget
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </section>
        ) : null}

        {!canEdit ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" />
            You have view-only access to the Accounting Module — posting requires the Finance edit permission.
          </p>
        ) : null}
      </div>
    </AdminShell>
  )
}

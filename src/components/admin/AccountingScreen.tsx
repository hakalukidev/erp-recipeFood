"use client"

import { useMemo, useState } from 'react'
import {
  BookOpen,
  Building2,
  FileSignature,
  Landmark,
  NotebookText,
  PieChart,
  Plus,
  Printer,
  Scale,
  Search,
  Trash2,
  Undo2,
} from 'lucide-react'

import { AdminShell } from './AdminShell'
import { ExportMenu } from './ExportMenu'
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
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_HELPLINE,
  COMPANY_INVOICE_FOOTER_NOTE,
  COMPANY_NAME,
} from '@/lib/erp/companyInfo'
import { useERP } from '@/lib/erp/provider'
import type {
  AccountType,
  BankAccountRecord,
  BankTransactionType,
  ChartOfAccountRecord,
} from '@/lib/erp/types'
import {
  buildBalanceSheet,
  buildGeneralLedger,
  buildTrialBalance,
  formatCurrency,
  formatDate,
  sortByCreatedAtDesc,
  toArray,
} from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type SectionId = 'chart' | 'journal' | 'bank' | 'ledger' | 'trial' | 'balance'

const SECTIONS: Array<{ id: SectionId; label: string; description: string }> = [
  { id: 'chart', label: 'Chart of Accounts', description: 'Every account, grouped by Asset/Liability/Equity/Revenue/Expense' },
  { id: 'journal', label: 'Journal', description: 'Manual multi-line vouchers — the escape hatch for anything not auto-posted' },
  { id: 'bank', label: 'Bank', description: 'Bank accounts and their deposit/withdrawal/transfer/cheque history' },
  { id: 'ledger', label: 'General Ledger', description: 'Every posting against one account, with a running balance' },
  { id: 'trial', label: 'Trial Balance', description: 'Every account’s debit/credit balance — should always net to zero' },
  { id: 'balance', label: 'Balance Sheet', description: 'Assets vs. Liabilities + Equity, as of right now' },
]

const ACCOUNT_TYPES: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense']
const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
}

const BANK_TRANSACTION_TYPES: BankTransactionType[] = [
  'deposit',
  'withdrawal',
  'transfer',
  'cheque_issued',
  'cheque_deposited',
  'bank_charge',
]
const BANK_TRANSACTION_LABEL: Record<BankTransactionType, string> = {
  deposit: 'Deposit (from Cash)',
  withdrawal: 'Withdrawal (to Cash)',
  transfer: 'Transfer to another bank account',
  cheque_issued: 'Cheque issued',
  cheque_deposited: 'Cheque deposited',
  bank_charge: 'Bank charge',
}

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

// One shared report-print layout for every tab in this module — same family
// as buildGenericReportHtml in ReportsHubScreen.tsx.
function buildAccountingReportHtml(title: string, headers: string[], rows: (string | number)[][]) {
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
          tr.totals td { font-weight: 700; border-top: 2px solid #111827; background: #fef9c3; }
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
  icon: typeof BookOpen
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

const emptyCoaForm = { code: '', name: '', type: 'asset' as AccountType, openingBalance: '0', status: 'active' as 'active' | 'inactive' }
type CoaFormState = typeof emptyCoaForm

type JournalLineDraft = { key: string; accountId: string; debit: string; credit: string; description: string }
function emptyJournalLine(): JournalLineDraft {
  return { key: Math.random().toString(36).slice(2), accountId: '', debit: '', credit: '', description: '' }
}

const emptyBankAccountForm = { bankName: '', branch: '', accountNumber: '', openingBalance: '0', status: 'active' as 'active' | 'inactive' }
type BankAccountFormState = typeof emptyBankAccountForm

const emptyBankTransactionForm = {
  bankAccountId: '',
  type: 'deposit' as BankTransactionType,
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  toBankAccountId: '',
  counterAccountId: '',
  chequeNumber: '',
  payee: '',
  note: '',
}
type BankTransactionFormState = typeof emptyBankTransactionForm

// ---- Accounting Department (2026-09-12 client request, "একাউন্টিং বিভাগ") -
// The Chart of Accounts / Journal / Bank Management backend (Sections
// 27-29, 35 of the original spec) has existed in provider.tsx since before
// this chunk — saveChartOfAccount, createJournalEntry, saveBankAccount, etc.
// — but had no UI anywhere in the app. This is that UI: six tabs covering
// the whole double-entry picture, ending in a General Ledger/Trial Balance/
// Balance Sheet that reconcile the Automatic Accounting Engine's system
// postings (LedgerEntryRecord.account = a fixed key) with every manual
// Journal Entry / Bank transaction (account:'manual' + accountRef) into one
// place — see resolveLedgerAccountRecord/buildGeneralLedger in utils.ts.
export function AccountingScreen() {
  const {
    data,
    saveChartOfAccount,
    deleteChartOfAccount,
    seedStandardChartOfAccounts,
    createJournalEntry,
    reverseJournalEntry,
    saveBankAccount,
    deleteBankAccount,
    recordBankTransaction,
  } = useERP()

  const currency = data?.settings.currency
  const [section, setSection] = useState<SectionId>('chart')
  const [feedback, setFeedback] = useState<string | null>(null)

  const chartOfAccounts = useMemo(
    () => Object.values(data?.chartOfAccounts ?? {}).sort((left, right) => left.code.localeCompare(right.code)),
    [data?.chartOfAccounts]
  )
  const accountOptions: ComboboxOption[] = useMemo(
    () =>
      chartOfAccounts
        .filter((account) => account.status === 'active')
        .map((account) => ({ value: account.id, label: `${account.code} — ${account.name}`, sublabel: ACCOUNT_TYPE_LABEL[account.type] })),
    [chartOfAccounts]
  )

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setFeedback(null)
    try {
      await action()
      setFeedback(successMessage)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Something went wrong.')
    }
  }

  // ---- Chart of Accounts ---------------------------------------------------
  const [coaQuery, setCoaQuery] = useState('')
  const [coaDialogOpen, setCoaDialogOpen] = useState(false)
  const [editingCoaId, setEditingCoaId] = useState<string | null>(null)
  const [coaForm, setCoaForm] = useState<CoaFormState>(emptyCoaForm)
  const [coaSaving, setCoaSaving] = useState(false)
  const [coaError, setCoaError] = useState<string | null>(null)

  const filteredCoa = useMemo(() => {
    const normalized = coaQuery.trim().toLowerCase()
    if (!normalized) return chartOfAccounts
    return chartOfAccounts.filter((account) => [account.code, account.name].join(' ').toLowerCase().includes(normalized))
  }, [chartOfAccounts, coaQuery])

  function openCreateCoa() {
    setEditingCoaId(null)
    setCoaForm(emptyCoaForm)
    setCoaError(null)
    setCoaDialogOpen(true)
  }

  function openEditCoa(account: ChartOfAccountRecord) {
    setEditingCoaId(account.id)
    setCoaForm({
      code: account.code,
      name: account.name,
      type: account.type,
      openingBalance: String(account.openingBalance),
      status: account.status,
    })
    setCoaError(null)
    setCoaDialogOpen(true)
  }

  async function handleSaveCoa() {
    setCoaError(null)
    setCoaSaving(true)
    try {
      await saveChartOfAccount(
        {
          code: coaForm.code,
          name: coaForm.name,
          type: coaForm.type,
          openingBalance: Number(coaForm.openingBalance) || 0,
          status: coaForm.status,
        },
        editingCoaId ?? undefined
      )
      setCoaDialogOpen(false)
    } catch (reason) {
      setCoaError(reason instanceof Error ? reason.message : 'Unable to save account.')
    } finally {
      setCoaSaving(false)
    }
  }

  const coaExportHeaders = ['Code', 'Name', 'Type', 'System', 'Opening Balance', 'Status']
  const coaExportRows = useMemo(
    () =>
      filteredCoa.map((account) => [
        account.code,
        account.name,
        ACCOUNT_TYPE_LABEL[account.type],
        account.isSystem ? 'Yes' : 'No',
        account.openingBalance.toFixed(2),
        account.status,
      ]),
    [filteredCoa]
  )

  // ---- Journal --------------------------------------------------------------
  const journalEntries = useMemo(() => sortByCreatedAtDesc(toArray(data?.journalEntries)), [data?.journalEntries])
  const [journalDialogOpen, setJournalDialogOpen] = useState(false)
  const [journalDate, setJournalDate] = useState(new Date().toISOString().slice(0, 10))
  const [journalNarration, setJournalNarration] = useState('')
  const [journalLines, setJournalLines] = useState<JournalLineDraft[]>([emptyJournalLine(), emptyJournalLine()])
  const [journalSaving, setJournalSaving] = useState(false)
  const [journalError, setJournalError] = useState<string | null>(null)
  const [reversingEntryId, setReversingEntryId] = useState<string | null>(null)
  const [reversalReason, setReversalReason] = useState('')

  const journalTotals = useMemo(() => {
    const totalDebit = journalLines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0)
    const totalCredit = journalLines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0)
    return { totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 }
  }, [journalLines])

  function openCreateJournal() {
    setJournalDate(new Date().toISOString().slice(0, 10))
    setJournalNarration('')
    setJournalLines([emptyJournalLine(), emptyJournalLine()])
    setJournalError(null)
    setJournalDialogOpen(true)
  }

  function updateJournalLine(key: string, patch: Partial<JournalLineDraft>) {
    setJournalLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  async function handleSaveJournal() {
    setJournalError(null)
    setJournalSaving(true)
    try {
      await createJournalEntry({
        date: journalDate,
        narration: journalNarration,
        lines: journalLines.map((line) => ({
          accountId: line.accountId,
          debit: Number(line.debit) || 0,
          credit: Number(line.credit) || 0,
          description: line.description || undefined,
        })),
      })
      setJournalDialogOpen(false)
    } catch (reason) {
      setJournalError(reason instanceof Error ? reason.message : 'Unable to post journal entry.')
    } finally {
      setJournalSaving(false)
    }
  }

  async function handleReverseJournal() {
    if (!reversingEntryId) return
    await runAction(
      () => reverseJournalEntry(reversingEntryId, reversalReason || undefined),
      'Journal entry reversed.'
    )
    setReversingEntryId(null)
    setReversalReason('')
  }

  const journalExportHeaders = ['Journal No', 'Date', 'Narration', 'Status', 'Total', 'Posted by']
  const journalExportRows = useMemo(
    () =>
      journalEntries.map((entry) => [
        entry.journalNumber,
        formatDate(entry.date),
        entry.narration,
        entry.status,
        entry.lines.reduce((sum, line) => sum + line.debit, 0).toFixed(2),
        entry.createdByName,
      ]),
    [journalEntries]
  )

  // ---- Bank -------------------------------------------------------------
  const bankAccounts = useMemo(() => sortByCreatedAtDesc(toArray(data?.bankAccounts)), [data?.bankAccounts])
  const bankTransactions = useMemo(() => sortByCreatedAtDesc(toArray(data?.bankTransactions)), [data?.bankTransactions])
  const generalLedgerForBank = useMemo(() => buildGeneralLedger(data ?? null), [data])
  const bankBalanceById = useMemo(() => {
    const map = new Map<string, number>()
    bankAccounts.forEach((account) => {
      const summary = generalLedgerForBank.find((row) => row.accountId === account.chartAccountId)
      map.set(account.id, summary?.closingBalance ?? account.openingBalance)
    })
    return map
  }, [bankAccounts, generalLedgerForBank])
  const bankAccountOptions: ComboboxOption[] = useMemo(
    () => bankAccounts.map((account) => ({ value: account.id, label: `${account.bankName} — ${account.accountNumber}` })),
    [bankAccounts]
  )

  const [bankAccountDialogOpen, setBankAccountDialogOpen] = useState(false)
  const [editingBankAccountId, setEditingBankAccountId] = useState<string | null>(null)
  const [bankAccountForm, setBankAccountForm] = useState<BankAccountFormState>(emptyBankAccountForm)
  const [bankAccountSaving, setBankAccountSaving] = useState(false)
  const [bankAccountError, setBankAccountError] = useState<string | null>(null)

  function openCreateBankAccount() {
    setEditingBankAccountId(null)
    setBankAccountForm(emptyBankAccountForm)
    setBankAccountError(null)
    setBankAccountDialogOpen(true)
  }

  function openEditBankAccount(account: BankAccountRecord) {
    setEditingBankAccountId(account.id)
    setBankAccountForm({
      bankName: account.bankName,
      branch: account.branch,
      accountNumber: account.accountNumber,
      openingBalance: String(account.openingBalance),
      status: account.status,
    })
    setBankAccountError(null)
    setBankAccountDialogOpen(true)
  }

  async function handleSaveBankAccount() {
    setBankAccountError(null)
    setBankAccountSaving(true)
    try {
      await saveBankAccount(
        {
          bankName: bankAccountForm.bankName,
          branch: bankAccountForm.branch || undefined,
          accountNumber: bankAccountForm.accountNumber,
          openingBalance: Number(bankAccountForm.openingBalance) || 0,
          status: bankAccountForm.status,
        },
        editingBankAccountId ?? undefined
      )
      setBankAccountDialogOpen(false)
    } catch (reason) {
      setBankAccountError(reason instanceof Error ? reason.message : 'Unable to save bank account.')
    } finally {
      setBankAccountSaving(false)
    }
  }

  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false)
  const [transactionForm, setTransactionForm] = useState<BankTransactionFormState>(emptyBankTransactionForm)
  const [transactionSaving, setTransactionSaving] = useState(false)
  const [transactionError, setTransactionError] = useState<string | null>(null)

  function openCreateTransaction(bankAccountId?: string) {
    setTransactionForm({ ...emptyBankTransactionForm, bankAccountId: bankAccountId ?? '' })
    setTransactionError(null)
    setTransactionDialogOpen(true)
  }

  async function handleSaveTransaction() {
    setTransactionError(null)
    const amount = Number(transactionForm.amount) || 0
    if (amount <= 0) {
      setTransactionError('Amount must be greater than zero.')
      return
    }
    setTransactionSaving(true)
    try {
      await recordBankTransaction({
        bankAccountId: transactionForm.bankAccountId,
        type: transactionForm.type,
        amount,
        date: transactionForm.date,
        toBankAccountId: transactionForm.toBankAccountId || undefined,
        counterAccountId: transactionForm.counterAccountId || undefined,
        chequeNumber: transactionForm.chequeNumber || undefined,
        payee: transactionForm.payee || undefined,
        note: transactionForm.note || undefined,
      })
      setTransactionDialogOpen(false)
    } catch (reason) {
      setTransactionError(reason instanceof Error ? reason.message : 'Unable to record transaction.')
    } finally {
      setTransactionSaving(false)
    }
  }

  const bankExportHeaders = ['Date', 'Bank', 'Type', 'Amount', 'Counter/To', 'Cheque No', 'Note']
  const bankExportRows = useMemo(
    () =>
      bankTransactions.map((entry) => [
        formatDate(entry.date),
        entry.bankLabel,
        BANK_TRANSACTION_LABEL[entry.type],
        entry.amount.toFixed(2),
        entry.toBankLabel || entry.counterAccountName || '',
        entry.chequeNumber || '',
        entry.note || '',
      ]),
    [bankTransactions]
  )

  // ---- General Ledger -------------------------------------------------------
  const generalLedger = useMemo(() => buildGeneralLedger(data ?? null), [data])
  const ledgerAccountOptions: ComboboxOption[] = useMemo(
    () => generalLedger.map((account) => ({ value: account.accountId, label: `${account.accountCode} — ${account.accountName}` })),
    [generalLedger]
  )
  const [selectedLedgerAccountId, setSelectedLedgerAccountId] = useState('')
  const selectedLedgerAccount = useMemo(
    () => generalLedger.find((account) => account.accountId === selectedLedgerAccountId) ?? null,
    [generalLedger, selectedLedgerAccountId]
  )

  const ledgerExportHeaders = ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance']
  const ledgerExportRows = useMemo(
    () =>
      (selectedLedgerAccount?.entries ?? []).map((row) => [
        formatDate(row.date),
        row.billNumber,
        row.description,
        row.debit.toFixed(2),
        row.credit.toFixed(2),
        row.runningBalance.toFixed(2),
      ]),
    [selectedLedgerAccount]
  )

  // ---- Trial Balance ----------------------------------------------------
  const trialBalance = useMemo(() => buildTrialBalance(data ?? null), [data])
  const trialExportHeaders = ['Code', 'Name', 'Type', 'Debit', 'Credit']
  const trialExportRows = useMemo(
    () =>
      trialBalance.rows.map((row) => [
        row.accountCode,
        row.accountName,
        ACCOUNT_TYPE_LABEL[row.accountType],
        row.debit.toFixed(2),
        row.credit.toFixed(2),
      ]),
    [trialBalance]
  )

  // ---- Balance Sheet ------------------------------------------------------
  const balanceSheet = useMemo(() => buildBalanceSheet(data ?? null), [data])
  const balanceExportHeaders = ['Section', 'Code', 'Account', 'Amount']
  const balanceExportRows = useMemo(() => {
    const rows: (string | number)[][] = []
    balanceSheet.assets.forEach((line) => rows.push(['Asset', line.code, line.name, line.amount.toFixed(2)]))
    balanceSheet.liabilities.forEach((line) => rows.push(['Liability', line.code, line.name, line.amount.toFixed(2)]))
    balanceSheet.equity.forEach((line) => rows.push(['Equity', line.code, line.name, line.amount.toFixed(2)]))
    rows.push(['Equity', '', 'Retained Earnings (current period)', balanceSheet.currentPeriodNetProfit.toFixed(2)])
    return rows
  }, [balanceSheet])

  return (
    <AdminShell active="Accounting">
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

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        {section === 'chart' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionHeader icon={BookOpen} title="Chart of Accounts" description={SECTIONS[0].description} />
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={coaQuery} onChange={(event) => setCoaQuery(event.target.value)} className="w-56 pl-9" placeholder="Search code or name" />
                </div>
                <ExportMenu filenameBase="chart-of-accounts" title="Chart of Accounts" headers={coaExportHeaders} rows={coaExportRows} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={coaExportRows.length === 0}
                  onClick={() => openPrintWindow(buildAccountingReportHtml('Chart of Accounts', coaExportHeaders, coaExportRows))}
                >
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => runAction(seedStandardChartOfAccounts, 'Standard chart of accounts loaded.')}
                >
                  Load standard chart
                </Button>
                <Button onClick={openCreateCoa}>
                  <Plus className="mr-2 h-4 w-4" /> Add account
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>System</TableHead>
                      <TableHead className="text-right">Opening Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCoa.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-mono text-xs">{account.code}</TableCell>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell>{ACCOUNT_TYPE_LABEL[account.type]}</TableCell>
                        <TableCell>
                          {account.isSystem ? <Badge variant="outline">System</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(account.openingBalance, currency)}</TableCell>
                        <TableCell>
                          <Badge variant={account.status === 'active' ? 'outline' : 'destructive'} className="capitalize">
                            {account.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEditCoa(account)}>
                              Edit
                            </Button>
                            {!account.isSystem ? (
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                onClick={() => runAction(() => deleteChartOfAccount(account.id), 'Account deleted.')}
                                aria-label={`Delete ${account.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredCoa.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                          No accounts on file — try &quot;Load standard chart&quot; to get started.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === 'journal' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionHeader icon={FileSignature} title="Journal" description={SECTIONS[1].description} />
              <div className="flex flex-wrap items-center gap-3">
                <ExportMenu filenameBase="journal-entries" title="Journal Entries" headers={journalExportHeaders} rows={journalExportRows} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={journalExportRows.length === 0}
                  onClick={() => openPrintWindow(buildAccountingReportHtml('Journal Entries', journalExportHeaders, journalExportRows))}
                >
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
                <Button onClick={openCreateJournal}>
                  <Plus className="mr-2 h-4 w-4" /> New journal entry
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Journal No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Narration</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journalEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-xs">{entry.journalNumber}</TableCell>
                        <TableCell>{formatDate(entry.date)}</TableCell>
                        <TableCell className="max-w-[260px] truncate">{entry.narration}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(entry.lines.reduce((sum, line) => sum + line.debit, 0), currency)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={entry.status === 'posted' ? 'outline' : 'destructive'} className="capitalize">
                            {entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.status === 'posted' ? (
                            <Button variant="outline" size="sm" onClick={() => setReversingEntryId(entry.id)}>
                              <Undo2 className="mr-2 h-4 w-4" /> Reverse
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Reversed</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {journalEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                          No journal entries posted yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === 'bank' ? (
          <div className="space-y-6">
            <Card className="border-border/70 shadow-sm">
              <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
                <SectionHeader icon={Building2} title="Bank Accounts" description="Each one auto-gets its own Chart of Accounts row." />
                <Button onClick={openCreateBankAccount}>
                  <Plus className="mr-2 h-4 w-4" /> Add bank account
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Bank</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Account No</TableHead>
                        <TableHead className="text-right">Current Balance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bankAccounts.map((account) => (
                        <TableRow key={account.id}>
                          <TableCell className="font-medium">{account.bankName}</TableCell>
                          <TableCell className="text-muted-foreground">{account.branch || '—'}</TableCell>
                          <TableCell>{account.accountNumber}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(bankBalanceById.get(account.id) ?? 0, currency)}</TableCell>
                          <TableCell>
                            <Badge variant={account.status === 'active' ? 'outline' : 'destructive'} className="capitalize">
                              {account.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openCreateTransaction(account.id)}>
                                New transaction
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => openEditBankAccount(account)}>
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                onClick={() => runAction(() => deleteBankAccount(account.id), 'Bank account deleted.')}
                                aria-label={`Delete ${account.bankName}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {bankAccounts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                            No bank accounts on file yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
                <SectionHeader icon={Landmark} title="Bank Transactions" description="Deposit, withdrawal, transfer, and cheque history." />
                <div className="flex flex-wrap items-center gap-3">
                  <ExportMenu filenameBase="bank-transactions" title="Bank Transactions" headers={bankExportHeaders} rows={bankExportRows} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={bankExportRows.length === 0}
                    onClick={() => openPrintWindow(buildAccountingReportHtml('Bank Transactions', bankExportHeaders, bankExportRows))}
                  >
                    <Printer className="mr-2 h-4 w-4" /> Print
                  </Button>
                  <Button onClick={() => openCreateTransaction()} disabled={bankAccounts.length === 0}>
                    <Plus className="mr-2 h-4 w-4" /> Record transaction
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Date</TableHead>
                        <TableHead>Bank</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Counter/To</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bankTransactions.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{formatDate(entry.date)}</TableCell>
                          <TableCell className="font-medium">{entry.bankLabel}</TableCell>
                          <TableCell>{BANK_TRANSACTION_LABEL[entry.type]}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(entry.amount, currency)}</TableCell>
                          <TableCell className="text-muted-foreground">{entry.toBankLabel || entry.counterAccountName || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{entry.note || '-'}</TableCell>
                        </TableRow>
                      ))}
                      {bankTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                            No bank transactions recorded yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {section === 'ledger' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionHeader icon={NotebookText} title="General Ledger" description={SECTIONS[3].description} />
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-64">
                  <Combobox
                    options={ledgerAccountOptions}
                    value={selectedLedgerAccountId}
                    onChange={setSelectedLedgerAccountId}
                    placeholder="Select account"
                    searchPlaceholder="Search account"
                  />
                </div>
                <ExportMenu filenameBase="general-ledger" title="General Ledger" headers={ledgerExportHeaders} rows={ledgerExportRows} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={ledgerExportRows.length === 0}
                  onClick={() =>
                    openPrintWindow(
                      buildAccountingReportHtml(
                        `General Ledger — ${selectedLedgerAccount?.accountName ?? ''}`,
                        ledgerExportHeaders,
                        ledgerExportRows
                      )
                    )
                  }
                >
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {selectedLedgerAccount ? (
                <>
                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                      <span className="text-muted-foreground">Opening balance</span>
                      <p className="mt-1 text-lg font-semibold">{formatCurrency(selectedLedgerAccount.openingBalance, currency)}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                      <span className="text-muted-foreground">Total debit / credit</span>
                      <p className="mt-1 text-lg font-semibold">
                        {formatCurrency(selectedLedgerAccount.totalDebit, currency)} / {formatCurrency(selectedLedgerAccount.totalCredit, currency)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
                      <span className="text-muted-foreground">Closing balance</span>
                      <p className="mt-1 text-lg font-semibold">{formatCurrency(selectedLedgerAccount.closingBalance, currency)}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-2xl border border-border/70">
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
                        {selectedLedgerAccount.entries.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>{formatDate(row.date)}</TableCell>
                            <TableCell className="text-muted-foreground">{row.billNumber}</TableCell>
                            <TableCell>{row.description}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.debit > 0 ? formatCurrency(row.debit, currency) : '—'}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.credit > 0 ? formatCurrency(row.credit, currency) : '—'}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{formatCurrency(row.runningBalance, currency)}</TableCell>
                          </TableRow>
                        ))}
                        {selectedLedgerAccount.entries.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                              No postings against this account yet.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">Pick an account above to see its ledger.</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {section === 'trial' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionHeader icon={Scale} title="Trial Balance" description={SECTIONS[4].description} />
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={Math.abs(trialBalance.totalDebit - trialBalance.totalCredit) < 1 ? 'outline' : 'destructive'}>
                  {Math.abs(trialBalance.totalDebit - trialBalance.totalCredit) < 1 ? 'Balanced' : 'Out of balance'}
                </Badge>
                <ExportMenu filenameBase="trial-balance" title="Trial Balance" headers={trialExportHeaders} rows={trialExportRows} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={trialExportRows.length === 0}
                  onClick={() => openPrintWindow(buildAccountingReportHtml('Trial Balance', trialExportHeaders, trialExportRows))}
                >
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Code</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trialBalance.rows.map((row) => (
                      <TableRow key={row.accountId}>
                        <TableCell className="font-mono text-xs">{row.accountCode}</TableCell>
                        <TableCell className="font-medium">{row.accountName}</TableCell>
                        <TableCell>{ACCOUNT_TYPE_LABEL[row.accountType]}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.debit > 0 ? formatCurrency(row.debit, currency) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.credit > 0 ? formatCurrency(row.credit, currency) : '—'}</TableCell>
                      </TableRow>
                    ))}
                    {trialBalance.rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                          No ledger activity yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                        <TableCell colSpan={3}>Total</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(trialBalance.totalDebit, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(trialBalance.totalCredit, currency)}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === 'balance' ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <SectionHeader icon={PieChart} title="Balance Sheet" description={SECTIONS[5].description} />
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={balanceSheet.isBalanced ? 'outline' : 'destructive'}>
                  {balanceSheet.isBalanced ? 'Balanced' : 'Out of balance'}
                </Badge>
                <ExportMenu filenameBase="balance-sheet" title="Balance Sheet" headers={balanceExportHeaders} rows={balanceExportRows} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={balanceExportRows.length === 0}
                  onClick={() => openPrintWindow(buildAccountingReportHtml('Balance Sheet', balanceExportHeaders, balanceExportRows))}
                >
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Assets</p>
                <div className="rounded-xl border border-border/60">
                  {balanceSheet.assets.map((line) => (
                    <div key={line.accountId} className="flex justify-between border-b border-border/40 px-3 py-2 text-sm last:border-b-0">
                      <span className="text-muted-foreground">{line.name}</span>
                      <span className="tabular-nums">{formatCurrency(line.amount, currency)}</span>
                    </div>
                  ))}
                  {balanceSheet.assets.length === 0 ? <p className="px-3 py-4 text-center text-sm text-muted-foreground">No asset activity yet.</p> : null}
                  <div className="flex justify-between border-t border-border/60 px-3 py-2 text-sm font-semibold">
                    <span>Total Assets</span>
                    <span className="tabular-nums">{formatCurrency(balanceSheet.totalAssets, currency)}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Liabilities</p>
                <div className="rounded-xl border border-border/60">
                  {balanceSheet.liabilities.map((line) => (
                    <div key={line.accountId} className="flex justify-between border-b border-border/40 px-3 py-2 text-sm last:border-b-0">
                      <span className="text-muted-foreground">{line.name}</span>
                      <span className="tabular-nums">{formatCurrency(line.amount, currency)}</span>
                    </div>
                  ))}
                  {balanceSheet.liabilities.length === 0 ? <p className="px-3 py-4 text-center text-sm text-muted-foreground">No liability activity yet.</p> : null}
                  <div className="flex justify-between border-t border-border/60 px-3 py-2 text-sm font-semibold">
                    <span>Total Liabilities</span>
                    <span className="tabular-nums">{formatCurrency(balanceSheet.totalLiabilities, currency)}</span>
                  </div>
                </div>

                <p className="pt-2 text-sm font-semibold text-foreground">Equity</p>
                <div className="rounded-xl border border-border/60">
                  {balanceSheet.equity.map((line) => (
                    <div key={line.accountId} className="flex justify-between border-b border-border/40 px-3 py-2 text-sm last:border-b-0">
                      <span className="text-muted-foreground">{line.name}</span>
                      <span className="tabular-nums">{formatCurrency(line.amount, currency)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-b border-border/40 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Retained Earnings (current period)</span>
                    <span className="tabular-nums">{formatCurrency(balanceSheet.currentPeriodNetProfit, currency)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border/60 px-3 py-2 text-sm font-semibold">
                    <span>Total Equity</span>
                    <span className="tabular-nums">{formatCurrency(balanceSheet.totalEquity, currency)}</span>
                  </div>
                </div>

                <div className="flex justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm font-semibold">
                  <span>Total Liabilities + Equity</span>
                  <span className="tabular-nums">{formatCurrency(balanceSheet.totalLiabilitiesAndEquity, currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Chart of Accounts dialog */}
      <Dialog open={coaDialogOpen} onOpenChange={setCoaDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCoaId ? 'Edit account' : 'Add account'}</DialogTitle>
            <DialogDescription>A system account&apos;s code and type can&apos;t change — deactivate it instead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {coaError ? <p className="text-sm text-destructive">{coaError}</p> : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Code</label>
                <Input value={coaForm.code} onChange={(event) => setCoaForm((current) => ({ ...current, code: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select value={coaForm.type} onValueChange={(value) => setCoaForm((current) => ({ ...current, type: value as AccountType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{ACCOUNT_TYPE_LABEL[type]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={coaForm.name} onChange={(event) => setCoaForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Opening balance</label>
                <Input
                  type="number"
                  step="0.01"
                  value={coaForm.openingBalance}
                  onChange={(event) => setCoaForm((current) => ({ ...current, openingBalance: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={coaForm.status} onValueChange={(value) => setCoaForm((current) => ({ ...current, status: value as 'active' | 'inactive' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCoaDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveCoa} disabled={coaSaving}>{coaSaving ? 'Saving…' : 'Save account'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Journal entry dialog */}
      <Dialog open={journalDialogOpen} onOpenChange={setJournalDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New journal entry</DialogTitle>
            <DialogDescription>At least two lines, and total debit must equal total credit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {journalError ? <p className="text-sm text-destructive">{journalError}</p> : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input type="date" value={journalDate} onChange={(event) => setJournalDate(event.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Narration</label>
                <Input value={journalNarration} onChange={(event) => setJournalNarration(event.target.value)} placeholder="Why this entry is being posted" />
              </div>
            </div>
            <div className="space-y-2">
              {journalLines.map((line) => (
                <div key={line.key} className="grid grid-cols-[1fr_90px_90px_auto] items-center gap-2">
                  <Combobox
                    options={accountOptions}
                    value={line.accountId}
                    onChange={(value) => updateJournalLine(line.key, { accountId: value })}
                    placeholder="Account"
                    searchPlaceholder="Search account"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Debit"
                    value={line.debit}
                    onChange={(event) => updateJournalLine(line.key, { debit: event.target.value, credit: '' })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Credit"
                    value={line.credit}
                    onChange={(event) => updateJournalLine(line.key, { credit: event.target.value, debit: '' })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    disabled={journalLines.length <= 2}
                    onClick={() => setJournalLines((current) => current.filter((row) => row.key !== line.key))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setJournalLines((current) => [...current, emptyJournalLine()])}>
                <Plus className="mr-2 h-4 w-4" /> Add line
              </Button>
            </div>
            <div
              className={cn(
                'flex items-center justify-between rounded-lg border p-3 text-sm',
                journalTotals.balanced
                  ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                  : 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
              )}
            >
              <span>Debit {formatCurrency(journalTotals.totalDebit, currency)} vs Credit {formatCurrency(journalTotals.totalCredit, currency)}</span>
              <span className="font-semibold">{journalTotals.balanced ? 'Balanced' : 'Not balanced'}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJournalDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveJournal} disabled={journalSaving || !journalTotals.balanced}>
              {journalSaving ? 'Posting…' : 'Post entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reverse journal entry dialog */}
      <Dialog open={Boolean(reversingEntryId)} onOpenChange={(open) => !open && setReversingEntryId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reverse journal entry</DialogTitle>
            <DialogDescription>The original entry stays on record — this posts an offsetting entry so the audit trail is permanent.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
            <Textarea value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReversingEntryId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleReverseJournal()}>Reverse entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bank account dialog */}
      <Dialog open={bankAccountDialogOpen} onOpenChange={setBankAccountDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBankAccountId ? 'Edit bank account' : 'Add bank account'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {bankAccountError ? <p className="text-sm text-destructive">{bankAccountError}</p> : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Bank name</label>
                <Input value={bankAccountForm.bankName} onChange={(event) => setBankAccountForm((current) => ({ ...current, bankName: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Branch</label>
                <Input value={bankAccountForm.branch} onChange={(event) => setBankAccountForm((current) => ({ ...current, branch: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Account number</label>
              <Input value={bankAccountForm.accountNumber} onChange={(event) => setBankAccountForm((current) => ({ ...current, accountNumber: event.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Opening balance</label>
                <Input
                  type="number"
                  step="0.01"
                  value={bankAccountForm.openingBalance}
                  onChange={(event) => setBankAccountForm((current) => ({ ...current, openingBalance: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select
                  value={bankAccountForm.status}
                  onValueChange={(value) => setBankAccountForm((current) => ({ ...current, status: value as 'active' | 'inactive' }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankAccountDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveBankAccount} disabled={bankAccountSaving}>{bankAccountSaving ? 'Saving…' : 'Save bank account'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bank transaction dialog */}
      <Dialog open={transactionDialogOpen} onOpenChange={setTransactionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record bank transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {transactionError ? <p className="text-sm text-destructive">{transactionError}</p> : null}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Bank account</label>
              <Combobox
                options={bankAccountOptions}
                value={transactionForm.bankAccountId}
                onChange={(value) => setTransactionForm((current) => ({ ...current, bankAccountId: value }))}
                placeholder="Select bank account"
                searchPlaceholder="Search bank account"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select
                value={transactionForm.type}
                onValueChange={(value) => setTransactionForm((current) => ({ ...current, type: value as BankTransactionType }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BANK_TRANSACTION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{BANK_TRANSACTION_LABEL[type]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Amount</label>
                <Input
                  type="number"
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
            {transactionForm.type === 'transfer' ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Destination bank account</label>
                <Combobox
                  options={bankAccountOptions.filter((option) => option.value !== transactionForm.bankAccountId)}
                  value={transactionForm.toBankAccountId}
                  onChange={(value) => setTransactionForm((current) => ({ ...current, toBankAccountId: value }))}
                  placeholder="Select destination account"
                  searchPlaceholder="Search bank account"
                />
              </div>
            ) : null}
            {transactionForm.type === 'cheque_issued' || transactionForm.type === 'cheque_deposited' ? (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Against account</label>
                  <Combobox
                    options={accountOptions}
                    value={transactionForm.counterAccountId}
                    onChange={(value) => setTransactionForm((current) => ({ ...current, counterAccountId: value }))}
                    placeholder="Select account"
                    searchPlaceholder="Search account"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Cheque number</label>
                    <Input
                      value={transactionForm.chequeNumber}
                      onChange={(event) => setTransactionForm((current) => ({ ...current, chequeNumber: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Payee</label>
                    <Input value={transactionForm.payee} onChange={(event) => setTransactionForm((current) => ({ ...current, payee: event.target.value }))} />
                  </div>
                </div>
              </>
            ) : null}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Note</label>
              <Textarea value={transactionForm.note} onChange={(event) => setTransactionForm((current) => ({ ...current, note: event.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTransaction} disabled={transactionSaving}>{transactionSaving ? 'Saving…' : 'Save transaction'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

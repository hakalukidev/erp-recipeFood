'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { get, onValue, ref, set, update } from 'firebase/database'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'

import { ALL_PERMISSION_IDS, createDefaultERPData, toPermissionSet } from '@/lib/erp/defaultData'
import { clearCachedERPData, readCachedERPData, writeCachedERPData } from '@/lib/erp/offlineCache'
import type {
  BankAccountInput,
  BankAccountRecord,
  BankTransactionInput,
  BankTransactionRecord,
  BatchRecord,
  BudgetInput,
  BudgetRecord,
  ChartOfAccountInput,
  ChartOfAccountRecord,
  CollectionInput,
  CollectionRecord,
  CommissionPayoutInput,
  CommissionPayoutRecord,
  CommissionRuleInput,
  CommissionRuleRecord,
  CustomerInput,
  CustomerRecord,
  ERPData,
  ExpenseApprovalStatus,
  ExpenseInput,
  ExpenseRecord,
  InvestorInput,
  JournalEntryInput,
  JournalEntryLine,
  JournalEntryRecord,
  LedgerAccount,
  LedgerEntryRecord,
  LoginHistoryRecord,
  OrderInput,
  OrderItem,
  OrderItemBatchAllocation,
  OrderRecord,
  ProductInput,
  ProductRecord,
  QcHoldRecord,
  QualityCheckInput,
  QualityCheckRecord,
  RateCardInput,
  RateCardLineItem,
  RateCardRecord,
  RoleInput,
  RoleRecord,
  SalesReturnInput,
  SalesReturnRecord,
  SalesTargetInput,
  SalesTargetRecord,
  SettingsInput,
  StockAdjustmentInput,
  StockAdjustmentRecord,
  StockCountInput,
  StockCountRecord,
  UserInput,
  UserRecord,
} from '@/lib/erp/types'
import {
  EXPENSE_CATEGORY_LEDGER_ACCOUNT,
  STANDARD_CHART_OF_ACCOUNTS,
} from '@/lib/erp/standardChartOfAccounts'
import {
  createId,
  getPermissions,
  getProductStatus,
  hasPermission as hasPermissionCheck,
  toArray,
} from '@/lib/erp/utils'
import {
  auth,
  createManagedUser,
  database,
  sendUserPasswordReset,
  SYNTHETIC_EMAIL_DOMAIN,
} from '@/lib/firebase/config'

const DEFAULT_ERP_DATA = createDefaultERPData()

type ERPContextValue = {
  data: ERPData | null
  loading: boolean
  error: string | null
  users: UserRecord[]
  currentUser: UserRecord | null
  currentPermissions: string[]
  login: (email: string, password: string) => Promise<UserRecord>
  logout: () => void
  createUser: (input: UserInput) => Promise<void>
  updateUser: (userId: string, input: UserInput) => Promise<void>
  deleteUser: (userId: string) => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  hasPermission: (permission: string) => boolean
  saveRole: (input: RoleInput, roleId?: string) => Promise<string>
  deleteRole: (roleId: string) => Promise<void>
  saveCustomer: (input: CustomerInput, customerId?: string) => Promise<string>
  deleteCustomer: (customerId: string) => Promise<void>
  saveProduct: (input: ProductInput, productId?: string) => Promise<string>
  deleteProduct: (productId: string) => Promise<void>
  createStockAdjustmentRequest: (input: StockAdjustmentInput) => Promise<string>
  approveStockAdjustment: (adjustmentId: string) => Promise<void>
  rejectStockAdjustment: (adjustmentId: string) => Promise<void>
  createStockCount: (input: StockCountInput) => Promise<string>
  createSalesReturn: (input: SalesReturnInput) => Promise<string>
  recordCollection: (input: CollectionInput) => Promise<string>
  releaseQcHold: (qcHoldId: string) => Promise<void>
  scrapQcHold: (qcHoldId: string) => Promise<void>
  createOrder: (input: OrderInput) => Promise<void>
  // Section 64 (Approval System): editing/cancelling an already-created
  // invoice is a limited, audited action — `reason` (when given) is
  // recorded to the Audit Trail alongside the before/after snapshot; see
  // writeActivity.
  updateOrder: (orderId: string, input: OrderInput, reason?: string) => Promise<void>
  cancelOrder: (orderId: string, reason?: string) => Promise<void>
  updateOrderStatus: (orderId: string, status: OrderRecord['status']) => Promise<void>
  updateOrderApproval: (orderId: string, approvalStatus: NonNullable<OrderRecord['approvalStatus']>) => Promise<void>
  markNotificationRead: (notificationId: string) => Promise<void>
  markAllNotificationsRead: (notificationIds: string[]) => Promise<void>
  saveExpense: (input: ExpenseInput, expenseId?: string) => Promise<void>
  updateExpenseApproval: (expenseId: string, approvalStatus: ExpenseApprovalStatus) => Promise<void>
  saveInvestor: (input: InvestorInput, investorId?: string) => Promise<void>
  deleteExpense: (expenseId: string) => Promise<void>
  saveBudget: (input: BudgetInput, budgetId?: string) => Promise<void>
  deleteBudget: (budgetId: string) => Promise<void>
  saveSalesTarget: (input: SalesTargetInput, targetId?: string) => Promise<string>
  deleteSalesTarget: (targetId: string) => Promise<void>
  saveCommissionRule: (input: CommissionRuleInput, ruleId?: string) => Promise<string>
  deleteCommissionRule: (ruleId: string) => Promise<void>
  recordCommissionPayout: (input: CommissionPayoutInput) => Promise<string>
  saveChartOfAccount: (input: ChartOfAccountInput, accountId?: string) => Promise<string>
  deleteChartOfAccount: (accountId: string) => Promise<void>
  seedStandardChartOfAccounts: () => Promise<void>
  createJournalEntry: (input: JournalEntryInput) => Promise<string>
  reverseJournalEntry: (journalEntryId: string, reason?: string) => Promise<void>
  saveBankAccount: (input: BankAccountInput, bankAccountId?: string) => Promise<string>
  deleteBankAccount: (bankAccountId: string) => Promise<void>
  recordBankTransaction: (input: BankTransactionInput) => Promise<string>
  saveRateCard: (input: RateCardInput, rateCardId?: string) => Promise<string>
  deleteRateCard: (rateCardId: string) => Promise<void>
  saveSettings: (input: SettingsInput) => Promise<void>
}

const ERPContext = createContext<ERPContextValue | undefined>(undefined)
const CURRENT_USER_STORAGE_KEY = 'ims-current-user'
const SESSION_EXPIRES_STORAGE_KEY = 'ims-session-expires-at'

// No backend can force-expire a Firebase session, so idle/absolute timeouts
// are enforced here on the client and simply call the existing `logout()`.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000
const IDLE_WARNING_MS = 60 * 1000
const ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000
const SESSION_CHECK_INTERVAL_MS = 30 * 1000

// Maps role ids from before the Super Admin/MD/Manager/Sales Officer/
// Accounts rename onto their closest new equivalent, applied automatically
// the next time an account with a legacy roleId logs in.
const LEGACY_ROLE_ID_MAP: Record<string, string> = {
  admin: 'super_admin',
  store_manager: 'manager',
  sales_person: 'sales_officer',
  accountant: 'accounts',
}

// Every top-level key under `erp/` — each gets its own database-rules path
// and therefore its own listener (see the data-loading effect below).
const ERP_TOP_LEVEL_KEYS = [
  'permissions',
  'roles',
  'users',
  'customers',
  'products',
  'orders',
  'ledgerEntries',
  'chartOfAccounts',
  'journalEntries',
  'bankAccounts',
  'bankTransactions',
  'salesReturns',
  'collections',
  'batches',
  'stockAdjustments',
  'stockCounts',
  'rateCards',
  'qualityChecks',
  'qcHolds',
  'notifications',
  'activities',
  'loginHistory',
  'expenses',
  'budgets',
  'salesTargets',
  'commissionRules',
  'commissionPayouts',
  'investors',
  'settings',
  'meta',
] as const satisfies readonly (keyof ERPData)[]

// ---- TanStack Query cache bridge -----------------------------------------
// Every top-level ERP collection is realtime-pushed by Firebase (the
// onValue listeners in ERPProvider below), not fetched on demand — so
// instead of a queryFn, the listeners themselves write each update straight
// into the React Query cache via queryClient.setQueryData. That gives the
// existing useERP() consumers zero changes while still making the data
// available under these keys to React Query DevTools and to any future
// component that wants it via useErpCollection/useErpSnapshot below instead
// of the context.
export const erpQueryKeys = {
  // The full normalized ERPData snapshot, updated once per commit() (i.e.
  // once per batch of Firebase pushes) — the same object useERP().data
  // returns.
  snapshot: ['erp', 'snapshot'] as const,
  // One entry per top-level collection, updated as soon as its own
  // listener fires (finer-grained than `snapshot`, and available slightly
  // sooner since it doesn't wait for every other collection to load).
  collection: (key: (typeof ERP_TOP_LEVEL_KEYS)[number]) => ['erp', 'collection', key] as const,
}

// Reads a single collection straight from the cache — no queryFn, since
// nothing here is ever fetched; it's only ever written by ERPProvider's
// Firebase listeners via setQueryData. `enabled: false` stops React Query
// from complaining about the missing fetcher while still returning
// whatever is already in the cache (and updating live as setQueryData
// writes land, the same as any other useQuery subscriber).
export function useErpCollection<K extends (typeof ERP_TOP_LEVEL_KEYS)[number]>(key: K): UseQueryResult<ERPData[K]> {
  return useQuery({
    queryKey: erpQueryKeys.collection(key),
    queryFn: skipQueryFn,
    enabled: false,
  })
}

function skipQueryFn(): never {
  throw new Error('erp query cache entries are only ever written via setQueryData, never fetched directly.')
}

// Section 66 (Security — IP/Device Log): a client can't read its own public
// IP without asking someone outside the LAN, so this is a best-effort call
// to a public lookup service with a short timeout — any failure (offline,
// blocked, slow) just resolves to '' rather than delaying or failing login.
async function lookupClientIp(): Promise<string> {
  if (typeof fetch !== 'function') {
    return ''
  }
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2500)
    const response = await fetch('https://api.ipify.org?format=json', { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!response.ok) return ''
    const body = (await response.json()) as { ip?: string }
    return body.ip ?? ''
  } catch {
    return ''
  }
}

// Section 66 (Security — Strong Password). Exported so the create-user form
// can show the same rule as a live hint instead of only finding out on
// submit.
export function isStrongPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password)
}

function normalizeLookup(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizePhoneLookup(value: unknown) {
  const digits = typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\D/g, '') : ''

  if (!digits) {
    return ''
  }

  return digits.replace(/^(?:880|88|0)+/, '')
}

function mergeRecordMap<T extends { id: string }>(defaults: Record<string, T>, current?: Record<string, T> | null) {
  const merged: Record<string, T> = { ...defaults }

  for (const [id, record] of Object.entries(current ?? {})) {
    const defaultRecord = merged[id]
    merged[id] = defaultRecord ? { ...defaultRecord, ...record } : record
  }

  return merged
}

// Guards against a role whose `permissions` was persisted in the old
// array-of-ids shape (or is missing entirely) before permissions became a
// `{ [id]: true }` map — coerces it into the current shape in memory.
function normalizeRoleMap(roles: Record<string, RoleRecord>): Record<string, RoleRecord> {
  return Object.fromEntries(
    Object.entries(roles).map(([id, role]) => {
      if (Array.isArray(role.permissions)) {
        const permissions = Object.fromEntries(
          (role.permissions as unknown as string[]).map((permissionId) => [permissionId, true as const])
        )
        return [id, { ...role, permissions }]
      }

      return [id, { ...role, permissions: role.permissions ?? {} }]
    })
  )
}

function normalizeCustomerRecord(customer: CustomerRecord): CustomerRecord {
  const now = new Date().toISOString()

  return {
    ...customer,
    company: customer.company || 'Retail',
    phone: customer.phone || '',
    location: customer.location || '',
    due: Number(customer.due ?? 0),
    supportStatus: customer.supportStatus ?? 'none',
    supportNote: customer.supportNote || '',
    isWholesale: customer.isWholesale ?? false,
    createdAt: customer.createdAt || now,
    updatedAt: customer.updatedAt || customer.createdAt || now,
  }
}

function normalizeCustomerMap(customers?: Record<string, CustomerRecord> | null) {
  return Object.fromEntries(
    Object.entries(customers ?? {}).map(([id, customer]) => [id, normalizeCustomerRecord(customer)])
  )
}

function normalizeProductRecord(product: ProductRecord): ProductRecord {
  return {
    ...product,
    serialNumber: product.serialNumber || '',
    warrantyMonths: Number(product.warrantyMonths ?? 0),
  }
}

function normalizeProductMap(products?: Record<string, ProductRecord> | null) {
  return Object.fromEntries(
    Object.entries(products ?? {}).map(([id, product]) => [id, normalizeProductRecord(product)])
  )
}

function normalizeOrderRecord(order: OrderRecord): OrderRecord {
  const now = new Date().toISOString()

  return {
    ...order,
    billNumber: order.billNumber || `INV-${order.id.replace(/\D/g, '').slice(-6) || Date.now()}`,
    paymentDueDate: order.paymentDueDate || order.deliveryDate || now,
    dueReference: order.dueReference ?? '',
    overdueNotified: order.overdueNotified ?? false,
    priceMode: order.priceMode ?? 'retail',
    // Orders created before the Sales Approval step existed already went
    // through the old implicit-approval flow — default them to "approved"
    // so they don't suddenly show up as awaiting approval.
    approvalStatus: order.approvalStatus ?? 'approved',
    approvalReasons: order.approvalReasons ?? [],
    promotionalDiscount: Number(order.promotionalDiscount ?? 0),
    vat: Number(order.vat ?? 0),
    remarks: order.remarks || '',
  }
}

function normalizeOrderMap(orders?: Record<string, OrderRecord> | null) {
  return Object.fromEntries(
    Object.entries(orders ?? {}).map(([id, order]) => [id, normalizeOrderRecord(order)])
  )
}

// Section 36 — mirrors normalizeOrderRecord above: expenses recorded before
// the Expense Approval Workflow existed default to "approved" so they don't
// retroactively show up as awaiting approval.
function normalizeExpenseRecord(expense: ExpenseRecord): ExpenseRecord {
  return {
    ...expense,
    approvalStatus: expense.approvalStatus ?? 'approved',
    approvedBy: expense.approvedBy ?? '',
    approvedByName: expense.approvedByName ?? '',
    approvedAt: expense.approvedAt ?? '',
  }
}

function normalizeExpenseMap(expenses?: Record<string, ExpenseRecord> | null) {
  return Object.fromEntries(
    Object.entries(expenses ?? {}).map(([id, expense]) => [id, normalizeExpenseRecord(expense)])
  )
}

// Cost of Goods Sold for an order — sum of each line's cost price at the
// time of sale. Finished Goods Stock was already decremented by this same
// quantity in createOrder, so this is the matching debit to COGS / credit
// to Inventory in postInvoiceLedgerEntries below.
function getOrderCogs(items: OrderItem[]) {
  return items.reduce((sum, item) => sum + item.purchasePrice * item.quantity, 0)
}

// Auto-cascade from Section 10 (Sales Invoice): every invoice posts a
// balanced Dr/Cr entry set — Dr Customer / Cr Sales (+ Cr VAT payable),
// Dr COGS / Cr Inventory for the finished-goods stock decrease, and
// Dr Cash / Cr Customer for whatever was collected on the spot.
function buildInvoiceLedgerEntries(params: {
  orderId: string
  billNumber: string
  date: string
  customerId: string
  netSales: number
  vat: number
  cogs: number
  total: number
  paid: number
}): Record<string, LedgerEntryRecord> {
  const { orderId, billNumber, date, customerId, netSales, vat, cogs, total, paid } = params
  const entries: Record<string, LedgerEntryRecord> = {}

  function post(account: LedgerEntryRecord['account'], accountRef: string | undefined, debit: number, credit: number, description: string) {
    if (debit <= 0 && credit <= 0) {
      return
    }

    const id = createId('ledger')
    // Firebase rejects `undefined` property values outright, so accountRef
    // always gets a concrete (possibly empty) string.
    entries[id] = { id, date, orderId, billNumber, account, accountRef: accountRef ?? '', description, debit, credit, createdAt: date }
  }

  post('customer', customerId, total, 0, `Invoice ${billNumber}`)
  post('sales', undefined, 0, netSales, `Invoice ${billNumber}`)
  post('vat_payable', undefined, 0, vat, `VAT on ${billNumber}`)
  post('cogs', undefined, cogs, 0, `COGS for ${billNumber}`)
  post('inventory', undefined, 0, cogs, `Finished goods issued for ${billNumber}`)
  post('cash', undefined, paid, 0, `Collection against ${billNumber}`)
  if (paid > 0) {
    post('customer', customerId, 0, paid, `Collection against ${billNumber}`)
  }

  return entries
}

// The entries for an order that are still "live" — original postings that
// haven't already been reversed. Reversal entries are never reversed again.
function getActiveLedgerEntries(entries: Record<string, LedgerEntryRecord>, orderId: string) {
  const forOrder = Object.values(entries).filter((entry) => entry.orderId === orderId)
  const alreadyReversedIds = new Set(forOrder.filter((entry) => entry.reversalOf).map((entry) => entry.reversalOf))
  return forOrder.filter((entry) => !entry.reversalOf && !alreadyReversedIds.has(entry.id))
}

// Posts the equal-and-opposite of every ledger entry tied to an order —
// used when an order is edited (reverse-then-repost) or cancelled. Entries
// are never deleted so the ledger keeps a full audit trail.
function buildLedgerReversalEntries(entries: LedgerEntryRecord[], date: string): Record<string, LedgerEntryRecord> {
  const reversed: Record<string, LedgerEntryRecord> = {}

  entries.forEach((entry) => {
    const id = createId('ledger')
    reversed[id] = {
      id,
      date,
      orderId: entry.orderId,
      billNumber: entry.billNumber,
      account: entry.account,
      accountRef: entry.accountRef ?? '',
      description: `Reversal: ${entry.description}`,
      debit: entry.credit,
      credit: entry.debit,
      reversalOf: entry.id,
      createdAt: date,
    }
  })

  return reversed
}

// Section 29 (Automatic Accounting Engine): a free-text expense category
// is matched (case-insensitive) against the standard Chart of Accounts
// expense heads so the posting lands on the right account without forcing
// the user through a picker every time; anything unrecognised still posts,
// just under the generic Other Expense account.
function resolveExpenseLedgerAccount(category: string): LedgerAccount {
  return EXPENSE_CATEGORY_LEDGER_ACCOUNT[category.trim().toLowerCase()] ?? 'other_expense'
}

// Dr <expense account> / Cr Cash-or-Bank for whatever was just spent —
// mirrors buildInvoiceLedgerEntries' shape so expenses reverse-then-repost
// on edit and reverse on delete exactly like a sales invoice does.
function buildExpenseLedgerEntries(params: {
  expenseId: string
  date: string
  category: string
  amount: number
  paymentMethod: 'cash' | 'bank'
}): Record<string, LedgerEntryRecord> {
  const { expenseId, date, category, amount, paymentMethod } = params
  if (amount <= 0) {
    return {}
  }

  const debitId = createId('ledger')
  const creditId = createId('ledger')
  return {
    [debitId]: {
      id: debitId,
      date,
      orderId: expenseId,
      billNumber: category,
      account: resolveExpenseLedgerAccount(category),
      accountRef: '',
      description: `${category} expense`,
      debit: amount,
      credit: 0,
      createdAt: date,
    },
    [creditId]: {
      id: creditId,
      date,
      orderId: expenseId,
      billNumber: category,
      account: paymentMethod,
      accountRef: '',
      description: `${category} expense payment`,
      debit: 0,
      credit: amount,
      createdAt: date,
    },
  }
}

// Section 37 (Budget Management): "Actual" is never stored on a budget —
// it's the live sum of expenses matching the budget's category (compared
// case-insensitively, same as resolveExpenseLedgerAccount above) that fall
// inside its month (for a monthly budget) or year (for a yearly one).
// Exported so the Accounting page's Budget tab can render the same figure
// it's checked against by checkBudgetOverrun below.
export function getBudgetActual(
  expenses: Record<string, ExpenseRecord>,
  budget: Pick<BudgetRecord, 'category' | 'periodType' | 'year' | 'month'>
) {
  const category = budget.category.trim().toLowerCase()
  return Object.values(expenses)
    .filter((expense) => expense.category.trim().toLowerCase() === category)
    .filter((expense) => {
      const expenseDate = new Date(expense.date)
      if (Number.isNaN(expenseDate.getTime()) || expenseDate.getFullYear() !== budget.year) {
        return false
      }
      return budget.periodType === 'yearly' || expenseDate.getMonth() + 1 === budget.month
    })
    .reduce((sum, expense) => sum + expense.amount, 0)
}

// Section 13's own auto-alert (stock crossing minStock) taught this
// codebase the pattern: re-check after every state-changing write, alert
// every time the threshold is still crossed rather than only on the first
// crossing. Runs after every saveExpense — `expenses` must already reflect
// the just-saved record (the caller merges it in before calling this, since
// `data.expenses` is only current as of the last snapshot).
async function checkBudgetOverrun(
  budgets: Record<string, BudgetRecord>,
  expenses: Record<string, ExpenseRecord>,
  writeNotification: (title: string, body: string, level: 'info' | 'warning' | 'critical', roles?: string[]) => Promise<void>,
  category: string,
  date: string
) {
  const expenseDate = new Date(date)
  if (Number.isNaN(expenseDate.getTime())) {
    return
  }
  const year = expenseDate.getFullYear()
  const month = expenseDate.getMonth() + 1
  const normalizedCategory = category.trim().toLowerCase()

  const matchingBudgets = Object.values(budgets).filter((budget) => {
    if (budget.category.trim().toLowerCase() !== normalizedCategory) return false
    if (budget.year !== year) return false
    return budget.periodType === 'yearly' || budget.month === month
  })

  for (const budget of matchingBudgets) {
    const actual = getBudgetActual(expenses, budget)
    if (actual > budget.budgetAmount) {
      const periodLabel = budget.periodType === 'monthly' ? `${budget.month}/${budget.year}` : String(budget.year)
      await writeNotification(
        'Budget overrun alert',
        `${budget.category} (${periodLabel}): actual ${actual.toLocaleString('en-BD')} exceeds budget ${budget.budgetAmount.toLocaleString('en-BD')} — over by ${(actual - budget.budgetAmount).toLocaleString('en-BD')}.`,
        'warning',
        ['super_admin', 'manager', 'accounts']
      )
    }
  }
}

// A single write batch can touch the same batch record's quantity more than
// once (e.g. updateOrder releasing the old allocation and consuming a new
// one in the same update) — read back whatever this batch already staged so
// the second call composes instead of clobbering the first.
function batchQuantity(data: ERPData, updates: Record<string, unknown>, batchId: string) {
  const pendingQty = updates[`batches/${batchId}/quantity`] as number | undefined
  if (pendingQty !== undefined) return pendingQty
  return data.batches[batchId]?.quantity ?? 0
}

// Section 18 completion — a sale now genuinely draws down the specific
// batch(es) it should, soonest-expiry-first, instead of only ever touching
// the product's total stockQty. Batches with no expiry date sort last
// (nothing to prioritize by). Only ever consumes as much as tracked batches
// for this product actually hold; any shortfall is left to the untracked
// portion of stockQty — batches stay a best-effort FEFO layer on top of
// stockQty, not a hard sub-ledger that can block a sale.
function consumeBatchesFefo(
  data: ERPData,
  updates: Record<string, unknown>,
  productId: string,
  quantity: number
): OrderItemBatchAllocation[] {
  if (quantity <= 0) {
    return []
  }

  const now = new Date().toISOString()
  const candidates = Object.values(data.batches)
    .filter((batch) => batch.productId === productId)
    .sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return a.createdAt.localeCompare(b.createdAt)
      if (!a.expiryDate) return 1
      if (!b.expiryDate) return -1
      return a.expiryDate.localeCompare(b.expiryDate)
    })

  const allocations: OrderItemBatchAllocation[] = []
  let remaining = quantity
  for (const batch of candidates) {
    if (remaining <= 0) break
    const available = batchQuantity(data, updates, batch.id)
    if (available <= 0) continue
    const take = Math.min(available, remaining)
    updates[`batches/${batch.id}/quantity`] = available - take
    updates[`batches/${batch.id}/updatedAt`] = now
    allocations.push({ batchId: batch.id, batchNumber: batch.batchNumber, quantity: take })
    remaining -= take
  }
  return allocations
}

// Reverses consumeBatchesFefo — restores each allocated quantity back to its
// batch (edit-away / cancel). A batch that no longer exists (rare — someone
// would have had to delete it since the sale) is silently skipped rather
// than throwing, since there's nothing left to restore it into.
function releaseBatchAllocations(
  data: ERPData,
  updates: Record<string, unknown>,
  allocations: OrderItemBatchAllocation[] | undefined
) {
  if (!allocations?.length) {
    return
  }
  const now = new Date().toISOString()
  allocations.forEach((allocation) => {
    if (!data.batches[allocation.batchId]) {
      return
    }
    const available = batchQuantity(data, updates, allocation.batchId)
    updates[`batches/${allocation.batchId}/quantity`] = available + allocation.quantity
    updates[`batches/${allocation.batchId}/updatedAt`] = now
  })
}

function normalizeERPData(data: ERPData | null): ERPData {
  const source = data ?? ({} as Partial<ERPData>)

  return {
    permissions: DEFAULT_ERP_DATA.permissions,
    roles: normalizeRoleMap(mergeRecordMap(DEFAULT_ERP_DATA.roles, source.roles)),
    users: source.users ?? {},
    customers: normalizeCustomerMap(source.customers),
    products: normalizeProductMap(source.products),
    orders: normalizeOrderMap(source.orders),
    ledgerEntries: source.ledgerEntries ?? {},
    chartOfAccounts: source.chartOfAccounts ?? {},
    journalEntries: source.journalEntries ?? {},
    bankAccounts: source.bankAccounts ?? {},
    bankTransactions: source.bankTransactions ?? {},
    salesReturns: source.salesReturns ?? {},
    collections: source.collections ?? {},
    batches: source.batches ?? {},
    stockAdjustments: source.stockAdjustments ?? {},
    stockCounts: source.stockCounts ?? {},
    rateCards: source.rateCards ?? {},
    qualityChecks: source.qualityChecks ?? {},
    qcHolds: source.qcHolds ?? {},
    notifications: source.notifications ?? {},
    activities: source.activities ?? {},
    loginHistory: source.loginHistory ?? {},
    expenses: normalizeExpenseMap(source.expenses),
    budgets: source.budgets ?? {},
    salesTargets: source.salesTargets ?? {},
    commissionRules: source.commissionRules ?? {},
    commissionPayouts: source.commissionPayouts ?? {},
    investors: source.investors ?? {},
    settings: {
      ...DEFAULT_ERP_DATA.settings,
      ...source.settings,
    },
    meta: {
      ...DEFAULT_ERP_DATA.meta,
      ...source.meta,
    },
  }
}

function getStoredCurrentUserId() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(CURRENT_USER_STORAGE_KEY)
}

function persistCurrentUserId(userId: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (userId) {
    window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, userId)
    return
  }

  window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY)
}

function getStoredSessionExpiresAt() {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(SESSION_EXPIRES_STORAGE_KEY)
  const parsed = raw ? Number(raw) : null
  return parsed && !Number.isNaN(parsed) ? parsed : null
}

function persistSessionExpiresAt(expiresAt: number | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (expiresAt) {
    window.localStorage.setItem(SESSION_EXPIRES_STORAGE_KEY, String(expiresAt))
    return
  }

  window.localStorage.removeItem(SESSION_EXPIRES_STORAGE_KEY)
}

function getDatabaseOrThrow() {
  if (!database) {
    throw new Error('Firebase Realtime Database is only available in the browser.')
  }

  return database
}

function normalizeProductInput(input: ProductInput) {
  return {
    name: input.name.trim(),
    banglaName: input.banglaName?.trim() ?? '',
    englishName: input.englishName?.trim() ?? '',
    category: input.category?.trim() ?? '',
    subCategory: input.subCategory?.trim() ?? '',
    brand: input.brand?.trim() ?? '',
    productType: input.productType?.trim() ?? '',
    sku: input.sku.trim().toUpperCase(),
    serialNumber: input.serialNumber?.trim() ?? '',
    warrantyMonths: Math.max(input.warrantyMonths ?? 0, 0),
    unit: input.unit?.trim() ?? '',
    purchaseUnit: input.purchaseUnit?.trim() ?? '',
    salesUnit: input.salesUnit?.trim() ?? '',
    conversionRatio: Math.max(input.conversionRatio ?? 1, 0),
    packSize: input.packSize?.trim() ?? '',
    weight: Math.max(input.weight ?? 0, 0),
    purchasePrice: input.purchasePrice,
    sellingPrice: input.sellingPrice,
    wholesalePrice: input.wholesalePrice ?? input.sellingPrice,
    mrp: Math.max(input.mrp ?? 0, 0),
    dealerPrice: Math.max(input.dealerPrice ?? 0, 0),
    distributorPrice: Math.max(input.distributorPrice ?? 0, 0),
    minSellingPrice: Math.max(input.minSellingPrice ?? 0, 0),
    batchApplicable: input.batchApplicable ?? false,
    expiryApplicable: input.expiryApplicable ?? false,
    isActive: input.isActive ?? true,
    stockQty: input.stockQty,
    minStock: input.minStock,
    maxStock: Math.max(input.maxStock ?? 0, 0),
    description: input.description?.trim() ?? '',
    imageUrl: input.imageUrl?.trim() ?? '',
    imagePublicId: input.imagePublicId?.trim() ?? '',
  }
}

function normalizeCustomerInput(input: CustomerInput) {
  return {
    customerCode: input.customerCode?.trim() ?? '',
    name: input.name.trim(),
    company: input.company?.trim() || 'Retail',
    ownerName: input.ownerName?.trim() ?? '',
    phone: input.phone.trim(),
    location: input.location?.trim() ?? '',
    district: input.district?.trim() ?? '',
    territory: input.territory?.trim() ?? '',
    salesArea: input.salesArea?.trim() ?? '',
    salesOfficerId: input.salesOfficerId?.trim() ?? '',
    customerType: input.customerType ?? 'retailer',
    creditLimit: Math.max(input.creditLimit ?? 0, 0),
    creditDays: Math.max(input.creditDays ?? 0, 0),
    openingBalance: Math.max(input.openingBalance ?? 0, 0),
    paymentTerms: input.paymentTerms?.trim() ?? '',
    priceCategory: input.priceCategory?.trim() ?? '',
    discountCategory: input.discountCategory?.trim() ?? '',
    bankInformation: input.bankInformation?.trim() ?? '',
    status: input.status ?? 'active',
    due: Math.max(input.due ?? 0, 0),
    supportStatus: input.supportStatus ?? 'none',
    supportNote: input.supportNote?.trim() ?? '',
    isPremium: input.isPremium ?? false,
    isWholesale: input.isWholesale ?? false,
    leadSource: input.leadSource ?? 'local-marketing',
    reminderCustomer: input.reminderCustomer ?? false,
    previousBillNumber: input.previousBillNumber?.trim() ?? '',
    previousPurchaseDetails: input.previousPurchaseDetails?.trim() ?? '',
    previousPurchaseAmount: Math.max(input.previousPurchaseAmount ?? 0, 0),
  }
}

function getInitialCurrentUserId() {
  const storedExpiresAt = getStoredSessionExpiresAt()

  // A session left open in a closed tab shouldn't silently resume past its
  // absolute expiry once the app is reopened.
  if (storedExpiresAt && storedExpiresAt < Date.now()) {
    persistCurrentUserId(null)
    persistSessionExpiresAt(null)
    return null
  }

  return getStoredCurrentUserId()
}

export function ERPProvider({ children }: { children: ReactNode }) {
  // Bridge target for the Firebase listeners below — see the "TanStack
  // Query cache bridge" comment above erpQueryKeys. Requires ERPProvider to
  // render under the app's QueryProvider (see app/layout.tsx).
  const queryClient = useQueryClient()
  const [data, setData] = useState<ERPData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => getInitialCurrentUserId())

  // Realtime Database rules require `auth != null`, so the app must actually
  // be signed in with Firebase Auth (via `login`, below) before it can read
  // any data. Track the Firebase Auth session here...
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)

  useEffect(() => {
    if (!auth) return

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user)
    })

    return () => unsubscribe()
  }, [])

  // ...and only subscribe to `erp` data once someone is actually signed in.
  //
  // This subscribes to each top-level module path individually (rather than
  // one listener on `erp` as a whole) because database rules are only
  // granted per module path — Firebase requires an explicit `.read` grant
  // somewhere between the root and the *exact* path being listened to, and
  // won't partially satisfy a shallow listener from grants on its children.
  // A permission-denied on any one slice (e.g. finance, for a role without
  // `finance:view`) is expected and just leaves that slice empty, not a
  // failure of the whole workspace.
  useEffect(() => {
    if (!firebaseUser) {
      setData(null)
      setLoading(false)
      // Signed out (or never signed in) — drop every bridged 'erp' entry so
      // a shared/public browser never keeps the previous session's data
      // sitting in the query cache (gcTime is Infinity, so nothing would
      // otherwise evict it).
      queryClient.removeQueries({ queryKey: ['erp'] })
      return
    }

    let cancelled = false
    let db
    try {
      db = getDatabaseOrThrow()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Firebase Realtime Database is unavailable.')
      setLoading(false)
      return
    }

    setLoading(true)

    // Instant paint from the last-synced snapshot (IndexedDB) while the live
    // listeners below catch up over the network — see offlineCache.ts for
    // why RTDB's web SDK needs this. Only fills in if nothing has rendered
    // yet (`current ?? ...`), so it never clobbers a live value that beat it
    // to the state update.
    void readCachedERPData<ERPData>().then((cached) => {
      if (cancelled || !cached) return
      setData((current) => current ?? normalizeERPData(cached))
    })

    const raw: Partial<Record<(typeof ERP_TOP_LEVEL_KEYS)[number], unknown>> = {}
    const loadedKeys = new Set<string>()
    let persistTimer: ReturnType<typeof setTimeout> | null = null

    function commit() {
      if (cancelled) return
      const next = normalizeERPData(raw as ERPData)
      setData(next)
      queryClient.setQueryData(erpQueryKeys.snapshot, next)
      if (loadedKeys.size >= ERP_TOP_LEVEL_KEYS.length) {
        setLoading(false)
        // A single write (e.g. createOrder) touches several top-level keys
        // (orders/customers/ledgerEntries/products/...) whose listeners each
        // fire independently — debounce so a burst of commits coalesces into
        // one snapshot write instead of one per key.
        if (persistTimer) clearTimeout(persistTimer)
        persistTimer = setTimeout(() => {
          if (!cancelled) void writeCachedERPData(next)
        }, 1500)
      }
    }

    const unsubscribes = ERP_TOP_LEVEL_KEYS.map((key) =>
      onValue(
        ref(db, `erp/${key}`),
        (snapshot) => {
          raw[key] = snapshot.val()
          loadedKeys.add(key)
          // Per-collection cache entry — lands as soon as this one
          // listener fires, ahead of the merged `snapshot` above which
          // waits for normalizeERPData's cross-collection defaults/fixups.
          queryClient.setQueryData(erpQueryKeys.collection(key), snapshot.val())
          commit()
        },
        () => {
          raw[key] = null
          loadedKeys.add(key)
          queryClient.setQueryData(erpQueryKeys.collection(key), null)
          commit()
        }
      )
    )

    return () => {
      cancelled = true
      if (persistTimer) clearTimeout(persistTimer)
      unsubscribes.forEach((unsubscribe) => unsubscribe())
    }
  }, [firebaseUser])

  const users = useMemo(() => {
    return [...toArray(data?.users)].sort((left, right) => left.name.localeCompare(right.name))
  }, [data?.users])

  const currentUser = useMemo(
    () => users.find((user) => user.id === currentUserId) ?? null,
    [currentUserId, users]
  )

  const currentPermissions = useMemo(() => getPermissions(data, currentUser), [currentUser, data])

  // Self-heal the Super Admin role's permission set. New modules/actions
  // occasionally get added to ALL_PERMISSION_IDS after a project's
  // `erp/roles` node was already seeded, and the Role & Permission Matrix UI
  // disables editing the super_admin row on purpose (see RoleManagementSection.tsx)
  // — so there's no in-app way to backfill a stale super_admin permission
  // set otherwise. Runs once per session for a logged-in super_admin and
  // only writes the keys that are actually missing.
  useEffect(() => {
    if (!data || !currentUser || currentUser.roleId !== 'super_admin') {
      return
    }

    const currentSuperAdminPermissions = data.roles.super_admin?.permissions ?? {}
    const missingPermissionIds = ALL_PERMISSION_IDS.filter((id) => currentSuperAdminPermissions[id] !== true)

    if (missingPermissionIds.length === 0) {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const db = getDatabaseOrThrow()
        await update(ref(db, 'erp/roles/super_admin/permissions'), toPermissionSet(missingPermissionIds))
        if (!cancelled) {
          console.info(
            `[self-heal] Restored ${missingPermissionIds.length} missing Super Admin permission(s): ${missingPermissionIds.join(', ')}`
          )
        }
      } catch (reason) {
        if (!cancelled) {
          console.warn(
            '[self-heal] Could not restore missing Super Admin permissions automatically — fix erp/roles/super_admin/permissions in the Firebase console instead.',
            reason
          )
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, data?.roles.super_admin])

  // Idle timeout + absolute session expiry. There's no backend session to
  // force-expire here, so this just watches for activity/elapsed time on
  // the client and calls the same `logout()` a manual click would.
  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') {
      return
    }

    let lastActivityAt = Date.now()
    let warned = false

    const registerActivity = () => {
      lastActivityAt = Date.now()
      warned = false
    }

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const
    activityEvents.forEach((eventName) => window.addEventListener(eventName, registerActivity, { passive: true }))

    const intervalId = window.setInterval(() => {
      const now = Date.now()
      const sessionExpiresAt = getStoredSessionExpiresAt()

      if (sessionExpiresAt && now >= sessionExpiresAt) {
        toast('Your session expired. Please log in again.')
        logout()
        return
      }

      const idleFor = now - lastActivityAt

      if (idleFor >= IDLE_TIMEOUT_MS) {
        toast('You were logged out after being idle.')
        logout()
        return
      }

      if (!warned && idleFor >= IDLE_TIMEOUT_MS - IDLE_WARNING_MS) {
        warned = true
        toast('You will be logged out soon due to inactivity.')
      }
    }, SESSION_CHECK_INTERVAL_MS)

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, registerActivity))
      window.clearInterval(intervalId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser])

  useEffect(() => {
    if (!data) {
      return
    }

    const now = Date.now()
    const overdueOrders = Object.values(data.orders).filter(
      (order) => order.due > 0 && !order.overdueNotified && new Date(order.paymentDueDate).getTime() < now
    )

    if (overdueOrders.length === 0) {
      return
    }

    let cancelled = false

    async function flagOverdueOrders() {
      const db = getDatabaseOrThrow()

      for (const order of overdueOrders) {
        if (cancelled) {
          return
        }

        await update(ref(db, `erp/orders/${order.id}`), { overdueNotified: true })
        await writeNotification(
          'Payment overdue',
          `${order.customerName}'s payment of ${order.due} for ${order.billNumber} is past the due date.`,
          'critical',
          ['super_admin', 'accounts']
        )
      }
    }

    void flagOverdueOrders()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.orders])

  async function login(email: string, password: string) {
    if (!auth) {
      throw new Error('Firebase Authentication is not configured.')
    }

    const normalizedEmail = normalizeLookup(email)

    let firebaseUserCredential
    try {
      firebaseUserCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password)
    } catch (reason) {
      console.error('[login] Firebase Auth sign-in failed:', reason)
      throw new Error('Invalid email or password.')
    }

    const uid = firebaseUserCredential.user.uid
    const db = getDatabaseOrThrow()

    // User records are keyed by Firebase Auth uid — this is what lets
    // database rules check "does the caller's own role have permission X"
    // with a cheap keyed lookup. Try the direct path first.
    const uidSnapshot = await get(ref(db, `erp/users/${uid}`))
    let authenticatedUser = uidSnapshot.val() as UserRecord | null

    if (!authenticatedUser) {
      // Legacy account created before uid-keying — find it by email under
      // its old random key, then migrate it to the uid-keyed path so this
      // fallback is only ever needed once per account.
      const usersSnapshot = await get(ref(db, 'erp/users'))
      const usersRecord = (usersSnapshot.val() as Record<string, UserRecord> | null) ?? {}
      const legacyEntry = Object.entries(usersRecord).find(
        ([, entry]) => normalizeLookup(entry.email) === normalizedEmail
      )

      if (legacyEntry) {
        const [legacyId, legacyRecord] = legacyEntry
        authenticatedUser = {
          ...legacyRecord,
          id: uid,
          roleId: LEGACY_ROLE_ID_MAP[legacyRecord.roleId] ?? legacyRecord.roleId,
        }
        delete (authenticatedUser as Partial<UserRecord> & { password?: string }).password

        const updates: Record<string, unknown> = {
          [`users/${uid}`]: authenticatedUser,
        }
        if (legacyId !== uid) {
          updates[`users/${legacyId}`] = null
        }
        await update(ref(db, 'erp'), updates)
      }
    }

    if (!authenticatedUser) {
      await signOut(auth)
      throw new Error('This account is not set up in the system. Contact an admin.')
    }

    if (authenticatedUser.status !== 'active') {
      await signOut(auth)
      throw new Error('This account is inactive.')
    }

    setCurrentUserId(authenticatedUser.id)
    persistCurrentUserId(authenticatedUser.id)
    const sessionExpiresAt = Date.now() + ABSOLUTE_SESSION_MS
    persistSessionExpiresAt(sessionExpiresAt)

    const roleName = DEFAULT_ERP_DATA.roles[authenticatedUser.roleId]?.name ?? authenticatedUser.roleId
    // Section 66 (Security — IP/Device Log): best-effort only, never blocks
    // sign-in if the lookup is slow, blocked by an ad-blocker, or the
    // device is offline.
    const ipAddress = await lookupClientIp()
    const loginHistoryId = createId('login')
    await update(ref(db, 'erp/loginHistory'), {
      [loginHistoryId]: {
        id: loginHistoryId,
        userId: authenticatedUser.id,
        userName: authenticatedUser.name,
        roleId: authenticatedUser.roleId,
        roleName,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        ipAddress,
        createdAt: new Date().toISOString(),
      } satisfies LoginHistoryRecord,
    })

    // Section 65 (Audit Trail): logged with an explicit actor since the
    // currentUser React state hasn't re-rendered with this login yet.
    await writeActivity('user_login', 'security', `${authenticatedUser.name} logged in.`, { actor: authenticatedUser })

    return authenticatedUser
  }

  function logout() {
    // Section 65 (Audit Trail): fire-and-forget, and must happen before the
    // state clears below — writeActivity reads the still-logged-in
    // currentUser closed over by this render.
    if (currentUser) {
      void writeActivity('user_logout', 'security', `${currentUser.name} logged out.`, { actor: currentUser })
    }
    setCurrentUserId(null)
    persistCurrentUserId(null)
    persistSessionExpiresAt(null)
    void clearCachedERPData()
    queryClient.removeQueries({ queryKey: ['erp'] })
    if (auth) {
      void signOut(auth)
    }
  }

  // Section 65 (Audit Trail): the one place every tracked action funnels
  // through — Login/Logout pass an explicit `actor` (see login/logout
  // below) since currentUser's React state hasn't caught up yet at that
  // point; every other call site just relies on the closed-over
  // currentUser. `oldValue`/`newValue` are recorded as JSON strings (never
  // as live object refs) so they read back as a frozen snapshot even after
  // the record they describe changes again later — see the Section 64
  // Approval System example (Sales Invoice edit) in updateOrder/cancelOrder.
  async function writeActivity(
    action: string,
    module: string,
    message: string,
    options?: { oldValue?: unknown; newValue?: unknown; reason?: string; actor?: UserRecord }
  ) {
    const actor = options?.actor ?? currentUser
    if (!actor) {
      return
    }

    const db = getDatabaseOrThrow()
    const activityId = createId('activity')
    await update(ref(db, 'erp/activities'), {
      [activityId]: {
        id: activityId,
        action,
        module,
        message,
        userId: actor.id,
        userName: actor.name,
        createdAt: new Date().toISOString(),
        ...(options?.oldValue !== undefined ? { oldValue: JSON.stringify(options.oldValue) } : {}),
        ...(options?.newValue !== undefined ? { newValue: JSON.stringify(options.newValue) } : {}),
        ...(options?.reason?.trim() ? { reason: options.reason.trim() } : {}),
      },
    })
  }

  async function writeNotification(
    title: string,
    body: string,
    level: 'info' | 'warning' | 'critical',
    roles?: string[]
  ) {
    const db = getDatabaseOrThrow()
    const notificationId = createId('notification')
    await update(ref(db, 'erp/notifications'), {
      [notificationId]: {
        id: notificationId,
        title,
        body,
        level,
        read: false,
        createdAt: new Date().toISOString(),
        roles: roles || null,
      },
    })
  }

  async function saveProduct(input: ProductInput, productId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const normalized = normalizeProductInput(input)

    if (!normalized.name) {
      throw new Error('Product name is required.')
    }

    if (!normalized.sku) {
      throw new Error('SKU or model code is required.')
    }

    const db = getDatabaseOrThrow()
    const existingProduct = productId ? data.products[productId] : null
    const id = existingProduct?.id ?? createId('product')
    const now = new Date().toISOString()
    const product = {
      id,
      ...normalized,
      status: getProductStatus(normalized.stockQty, normalized.minStock),
      createdAt: existingProduct?.createdAt ?? now,
      updatedAt: now,
    }

    const updates: Record<string, unknown> = {
      [`products/${id}`]: product,
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      existingProduct ? 'product_updated' : 'product_created',
      'inventory',
      existingProduct
        ? `Updated ${product.name} inventory details.`
        : `Added ${product.name} with ${product.stockQty} units in stock.`
    )

    // Section 65 (Audit Trail — Price Change): logged as its own action
    // whenever an edit actually moves a price field, separate from the
    // general product_updated entry above.
    if (existingProduct) {
      const priceFields = ['sellingPrice', 'wholesalePrice', 'mrp', 'dealerPrice', 'distributorPrice', 'minSellingPrice'] as const
      const oldPrices: Record<string, number | undefined> = {}
      const newPrices: Record<string, number | undefined> = {}
      let priceChanged = false
      priceFields.forEach((field) => {
        if (existingProduct[field] !== product[field]) {
          priceChanged = true
          oldPrices[field] = existingProduct[field]
          newPrices[field] = product[field]
        }
      })
      if (priceChanged) {
        await writeActivity('price_change', 'inventory', `Updated pricing for ${product.name}.`, {
          oldValue: oldPrices,
          newValue: newPrices,
        })
      }
    }

    if (!existingProduct) {
      await writeNotification(
        'Product added',
        `${product.name} has been added to inventory by ${currentUser?.name ?? 'Admin'}.`,
        'info',
        ['super_admin', 'manager', 'sales_officer']
      )
    } else {
      if (existingProduct.stockQty !== product.stockQty) {
        await writeNotification(
          'Stock adjusted',
          `${product.name} stock level was adjusted from ${existingProduct.stockQty} to ${product.stockQty} by ${currentUser?.name ?? 'Admin'}.`,
          'warning',
          ['super_admin', 'manager']
        )
      } else {
        await writeNotification(
          'Product details updated',
          `${product.name} details were updated by ${currentUser?.name ?? 'Admin'}.`,
          'info',
          ['super_admin', 'manager']
        )
      }
    }

    if (product.stockQty <= product.minStock) {
      await writeNotification(
        'Low stock alert',
        `${product.name} is already at or below its minimum stock (${product.stockQty}/${product.minStock}).`,
        'warning',
        ['super_admin', 'manager']
      )
    }

    return id
  }

  async function deleteProduct(productId: string) {
    if (!data) {
      return
    }

    const product = data.products[productId]
    if (!product) {
      throw new Error('Product not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`products/${productId}`]: null,
    })
    await writeActivity('product_deleted', 'inventory', `Deleted ${product.name} from inventory.`)
    await writeNotification(
      'Product deleted',
      `${product.name} was deleted from inventory by ${currentUser?.name ?? 'Admin'}.`,
      'warning',
      ['super_admin', 'manager']
    )
  }

  // Section 19: the only sanctioned way to correct stockQty outside a real
  // business document — request (reason, no stock effect yet) → approval
  // (applies the delta) → audit log (writeActivity, both steps).
  async function createStockAdjustmentRequest(input: StockAdjustmentInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before requesting a stock adjustment.')
    }

    const product = data.products[input.productId]
    if (!product) {
      throw new Error('Product not found.')
    }

    if (!input.reason?.trim()) {
      throw new Error('A reason is required for every stock adjustment.')
    }

    if (input.newQuantity < 0) {
      throw new Error('Quantity cannot be negative.')
    }

    const db = getDatabaseOrThrow()
    const id = createId('adjustment')
    const now = new Date().toISOString()
    const quantityBefore = product.stockQty

    const adjustment: StockAdjustmentRecord = {
      id,
      productId: product.id,
      productName: product.name,
      quantityBefore,
      quantityAfter: input.newQuantity,
      delta: input.newQuantity - quantityBefore,
      reason: input.reason.trim(),
      status: 'pending',
      requestedBy: currentUser.id,
      requestedByName: currentUser.name,
      approvedBy: '',
      approvedByName: '',
      createdAt: now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/stockAdjustments'), { [id]: adjustment })
    await writeActivity(
      'stock_adjustment_requested',
      'inventory',
      `Requested stock adjustment for ${product.name} (${quantityBefore} → ${input.newQuantity}). Reason: ${adjustment.reason}`
    )
    await writeNotification(
      'Stock adjustment requested',
      `${product.name}: ${quantityBefore} → ${input.newQuantity}. Reason: ${adjustment.reason}`,
      'warning',
      ['super_admin', 'manager']
    )

    return id
  }

  async function approveStockAdjustment(adjustmentId: string) {
    if (!data || !currentUser) {
      return
    }

    const adjustment = data.stockAdjustments[adjustmentId]
    if (!adjustment) {
      throw new Error('Stock adjustment not found.')
    }

    if (adjustment.status !== 'pending') {
      throw new Error('Only a pending adjustment can be approved.')
    }

    const product = data.products[adjustment.productId]
    if (!product) {
      throw new Error('Product not found.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const nextStock = Math.max(product.stockQty + adjustment.delta, 0)

    const updates: Record<string, unknown> = {
      [`stockAdjustments/${adjustmentId}/status`]: 'approved',
      [`stockAdjustments/${adjustmentId}/approvedBy`]: currentUser.id,
      [`stockAdjustments/${adjustmentId}/approvedByName`]: currentUser.name,
      [`stockAdjustments/${adjustmentId}/updatedAt`]: now,
      [`products/${product.id}/stockQty`]: nextStock,
      [`products/${product.id}/status`]: getProductStatus(nextStock, product.minStock),
      [`products/${product.id}/updatedAt`]: now,
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'stock_adjustment_approved',
      'inventory',
      `Approved stock adjustment for ${product.name} (${adjustment.quantityBefore} → ${adjustment.quantityAfter}). Reason: ${adjustment.reason}.`
    )
  }

  async function rejectStockAdjustment(adjustmentId: string) {
    if (!data || !currentUser) {
      return
    }

    const adjustment = data.stockAdjustments[adjustmentId]
    if (!adjustment) {
      throw new Error('Stock adjustment not found.')
    }

    if (adjustment.status !== 'pending') {
      throw new Error('Only a pending adjustment can be rejected.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`stockAdjustments/${adjustmentId}/status`]: 'rejected',
      [`stockAdjustments/${adjustmentId}/approvedBy`]: currentUser.id,
      [`stockAdjustments/${adjustmentId}/approvedByName`]: currentUser.name,
      [`stockAdjustments/${adjustmentId}/updatedAt`]: new Date().toISOString(),
    })
    await writeActivity(
      'stock_adjustment_rejected',
      'inventory',
      `Rejected stock adjustment for ${adjustment.productName}.`
    )
  }

  // Section 20: a physical count is purely a variance report against
  // system stock — it never touches stockQty itself. Raise a Stock
  // Adjustment (Section 19) for any line that needs correcting.
  async function createStockCount(input: StockCountInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording a stock count.')
    }

    if (!input.items.length) {
      throw new Error('Add at least one product to the count.')
    }

    const items = input.items.map((item) => {
      const product = data.products[item.productId]
      if (!product) {
        throw new Error('Product not found.')
      }
      if (item.physicalQty < 0) {
        throw new Error(`Physical quantity for ${product.name} cannot be negative.`)
      }
      const systemQty = product.stockQty
      return {
        productId: product.id,
        productName: product.name,
        systemQty,
        physicalQty: item.physicalQty,
        variance: item.physicalQty - systemQty,
      }
    })

    const db = getDatabaseOrThrow()
    const id = createId('count')
    const now = new Date().toISOString()
    const countNumber = `SC-${Date.now().toString().slice(-8)}`

    const stockCount: StockCountRecord = {
      id,
      countNumber,
      items,
      countedBy: currentUser.id,
      countedByName: currentUser.name,
      createdAt: now,
    }

    await update(ref(db, 'erp/stockCounts'), { [id]: stockCount })

    const varianceCount = items.filter((item) => item.variance !== 0).length
    await writeActivity(
      'stock_count_recorded',
      'inventory',
      `Recorded stock count ${countNumber} — ${varianceCount} variance line(s).`
    )
    if (varianceCount > 0) {
      await writeNotification(
        'Stock count variance found',
        `${countNumber}: ${varianceCount} product(s) differ from system stock. Review and raise adjustments as needed.`,
        'warning',
        ['super_admin', 'manager']
      )
    }

    return id
  }

  async function saveCustomer(input: CustomerInput, customerId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const existingCustomer = customerId ? data.customers[customerId] : null
    const normalized = normalizeCustomerInput({
      ...input,
      isPremium: input.isPremium ?? existingCustomer?.isPremium ?? false,
      isWholesale: input.isWholesale ?? existingCustomer?.isWholesale ?? false,
      leadSource: input.leadSource ?? existingCustomer?.leadSource ?? 'local-marketing',
      reminderCustomer: input.reminderCustomer ?? existingCustomer?.reminderCustomer ?? false,
      customerCode: input.customerCode ?? existingCustomer?.customerCode,
      ownerName: input.ownerName ?? existingCustomer?.ownerName,
      district: input.district ?? existingCustomer?.district,
      territory: input.territory ?? existingCustomer?.territory,
      salesArea: input.salesArea ?? existingCustomer?.salesArea,
      salesOfficerId: input.salesOfficerId ?? existingCustomer?.salesOfficerId,
      customerType: input.customerType ?? existingCustomer?.customerType ?? 'retailer',
      creditLimit: input.creditLimit ?? existingCustomer?.creditLimit,
      creditDays: input.creditDays ?? existingCustomer?.creditDays,
      openingBalance: input.openingBalance ?? existingCustomer?.openingBalance ?? 0,
      paymentTerms: input.paymentTerms ?? existingCustomer?.paymentTerms,
      priceCategory: input.priceCategory ?? existingCustomer?.priceCategory,
      discountCategory: input.discountCategory ?? existingCustomer?.discountCategory,
      bankInformation: input.bankInformation ?? existingCustomer?.bankInformation,
      status: input.status ?? existingCustomer?.status ?? 'active',
    })

    if (!normalized.name) {
      throw new Error('Customer name is required.')
    }

    if (!normalized.phone) {
      throw new Error('Customer phone number is required.')
    }

    const db = getDatabaseOrThrow()
    const id = existingCustomer?.id ?? createId('customer')
    const now = new Date().toISOString()
    const customer = {
      id,
      ...normalized,
      createdAt: existingCustomer?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/customers'), { [id]: customer })
    await writeActivity(
      existingCustomer ? 'customer_updated' : 'customer_created',
      'customers',
      existingCustomer ? `Updated ${customer.name} CRM details.` : `Added customer ${customer.name}.`
    )

    return id
  }

  async function deleteCustomer(customerId: string) {
    if (!data) {
      return
    }

    const customer = data.customers[customerId]
    if (!customer) {
      throw new Error('Customer not found.')
    }

    const hasOrders = Object.values(data.orders).some((order) => order.customerId === customerId)
    if (hasOrders) {
      throw new Error('Customers with purchase history cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`customers/${customerId}`]: null,
    })
    await writeActivity('customer_deleted', 'customers', `Deleted customer ${customer.name}.`)
  }

  // Resolves a QC Hold either back into sellable stock (release — the
  // batch turned out fine on re-test, or a decision was made to accept it
  // after all) or as a permanent write-off (scrap).
  async function releaseQcHold(qcHoldId: string) {
    if (!data || !currentUser) {
      return
    }

    const hold = data.qcHolds[qcHoldId]
    if (!hold) {
      throw new Error('QC hold not found.')
    }

    if (hold.status !== 'held') {
      throw new Error('Only a held item can be released.')
    }

    const product = data.products[hold.productId]
    if (!product) {
      throw new Error('Product not found.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const nextStock = product.stockQty + hold.quantity

    const updates: Record<string, unknown> = {
      [`qcHolds/${qcHoldId}/status`]: 'released',
      [`qcHolds/${qcHoldId}/updatedAt`]: now,
      [`products/${product.id}/stockQty`]: nextStock,
      [`products/${product.id}/status`]: getProductStatus(nextStock, product.minStock),
      [`products/${product.id}/updatedAt`]: now,
    }

    const value = hold.quantity * hold.unitCost
    if (value > 0) {
      // Reverse the write-off booked when the hold was created — this
      // cost is a real finished-goods asset now, not a loss. (Historical
      // 'purchase'-sourced holds, from the now-removed supplier/purchase-order
      // module, are reversed the same way — there's no accounts-payable bill
      // to reopen any more.)
      const debitId = createId('ledger')
      updates[`ledgerEntries/${debitId}`] = {
        id: debitId,
        date: now,
        orderId: hold.sourceId,
        billNumber: hold.sourceReference,
        account: 'inventory',
        accountRef: '',
        description: `QC hold released — ${hold.sourceReference}`,
        debit: value,
        credit: 0,
        createdAt: now,
      } satisfies LedgerEntryRecord
      const creditId = createId('ledger')
      updates[`ledgerEntries/${creditId}`] = {
        id: creditId,
        date: now,
        orderId: hold.sourceId,
        billNumber: hold.sourceReference,
        account: 'cogs',
        accountRef: '',
        description: `Reversed write-off — ${hold.sourceReference}`,
        debit: 0,
        credit: value,
        createdAt: now,
      } satisfies LedgerEntryRecord
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'qc_hold_released',
      'inventory',
      `Released QC hold for ${hold.productName} (${hold.quantity} units) from ${hold.sourceReference}.`
    )
  }

  async function scrapQcHold(qcHoldId: string) {
    if (!data || !currentUser) {
      return
    }

    const hold = data.qcHolds[qcHoldId]
    if (!hold) {
      throw new Error('QC hold not found.')
    }

    if (hold.status !== 'held') {
      throw new Error('Only a held item can be scrapped.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`qcHolds/${qcHoldId}/status`]: 'scrapped',
      [`qcHolds/${qcHoldId}/updatedAt`]: new Date().toISOString(),
    })
    await writeActivity(
      'qc_hold_scrapped',
      'inventory',
      `Scrapped ${hold.quantity} unit(s) of ${hold.productName} on QC hold from ${hold.sourceReference}.`
    )
  }

  // Section 11: Customer Return → Return Inspection → Good/Bad Stock
  // Classification → Stock Update → Customer Ledger Adjustment →
  // Accounting Adjustment — captured as a single entry, cascading
  // automatically per the ERP's "one entry, auto cascade" principle. The
  // inspector records each line's condition at entry time: "good" lines go
  // back on the shelf, "damaged" lines are written off but still refunded.
  async function createSalesReturn(input: SalesReturnInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording a sales return.')
    }

    const order = data.orders[input.orderId]
    if (!order) {
      throw new Error('Sales order not found.')
    }

    if (!input.items.length) {
      throw new Error('Add at least one product to return.')
    }

    const alreadyReturnedByProduct = new Map<string, number>()
    Object.values(data.salesReturns)
      .filter((entry) => entry.orderId === order.id)
      .forEach((salesReturn) => {
        salesReturn.items.forEach((item) => {
          alreadyReturnedByProduct.set(item.productId, (alreadyReturnedByProduct.get(item.productId) ?? 0) + item.quantity)
        })
      })

    const items = input.items.map((requested) => {
      const orderItem = order.items.find((item) => item.productId === requested.productId)
      if (!orderItem) {
        throw new Error('That product was not part of the original order.')
      }
      if (requested.quantity <= 0) {
        throw new Error(`Return quantity for ${orderItem.productName} must be greater than zero.`)
      }
      const alreadyReturned = alreadyReturnedByProduct.get(requested.productId) ?? 0
      if (alreadyReturned + requested.quantity > orderItem.quantity) {
        throw new Error(`Cannot return more than what was sold for ${orderItem.productName}.`)
      }
      return {
        productId: orderItem.productId,
        productName: orderItem.productName,
        quantity: requested.quantity,
        unitPrice: orderItem.unitPrice,
        purchasePrice: orderItem.purchasePrice,
        condition: requested.condition,
      }
    })

    const totalRefund = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const goodItems = items.filter((item) => item.condition === 'good')
    const damagedItems = items.filter((item) => item.condition === 'damaged')
    const restockedQty = goodItems.reduce((sum, item) => sum + item.quantity, 0)
    const writtenOffQty = damagedItems.reduce((sum, item) => sum + item.quantity, 0)
    const restockedCost = goodItems.reduce((sum, item) => sum + item.purchasePrice * item.quantity, 0)

    const db = getDatabaseOrThrow()
    const id = createId('return')
    const now = new Date().toISOString()
    const returnNumber = `RTN-${Date.now().toString().slice(-8)}`

    const salesReturn: SalesReturnRecord = {
      id,
      returnNumber,
      orderId: order.id,
      billNumber: order.billNumber,
      customerId: order.customerId,
      customerName: order.customerName,
      items,
      totalRefund,
      restockedQty,
      writtenOffQty,
      inspectionNote: input.inspectionNote?.trim() ?? '',
      processedBy: currentUser.id,
      processedByName: currentUser.name,
      createdAt: now,
    }

    const updates: Record<string, unknown> = {
      [`salesReturns/${id}`]: salesReturn,
      [`customers/${order.customerId}/due`]: Math.max((data.customers[order.customerId]?.due ?? 0) - totalRefund, 0),
    }

    const restockByProduct = new Map<string, number>()
    goodItems.forEach((item) => {
      restockByProduct.set(item.productId, (restockByProduct.get(item.productId) ?? 0) + item.quantity)
    })
    restockByProduct.forEach((quantity, productId) => {
      const product = data.products[productId]
      if (!product) {
        return
      }
      const nextStock = product.stockQty + quantity
      updates[`products/${product.id}/stockQty`] = nextStock
      updates[`products/${product.id}/status`] = getProductStatus(nextStock, product.minStock)
      updates[`products/${product.id}/updatedAt`] = now
    })

    const returnDebitId = createId('ledger')
    updates[`ledgerEntries/${returnDebitId}`] = {
      id: returnDebitId,
      date: now,
      orderId: order.id,
      billNumber: returnNumber,
      account: 'sales_return',
      accountRef: '',
      description: `Sales return ${returnNumber} for ${order.billNumber}`,
      debit: totalRefund,
      credit: 0,
      createdAt: now,
    } satisfies LedgerEntryRecord
    const customerCreditId = createId('ledger')
    updates[`ledgerEntries/${customerCreditId}`] = {
      id: customerCreditId,
      date: now,
      orderId: order.id,
      billNumber: returnNumber,
      account: 'customer',
      accountRef: order.customerId,
      description: `Sales return ${returnNumber} for ${order.billNumber}`,
      debit: 0,
      credit: totalRefund,
      createdAt: now,
    } satisfies LedgerEntryRecord

    if (restockedCost > 0) {
      const inventoryDebitId = createId('ledger')
      updates[`ledgerEntries/${inventoryDebitId}`] = {
        id: inventoryDebitId,
        date: now,
        orderId: order.id,
        billNumber: returnNumber,
        account: 'inventory',
        accountRef: '',
        description: `Restocked goods from return ${returnNumber}`,
        debit: restockedCost,
        credit: 0,
        createdAt: now,
      } satisfies LedgerEntryRecord
      const cogsCreditId = createId('ledger')
      updates[`ledgerEntries/${cogsCreditId}`] = {
        id: cogsCreditId,
        date: now,
        orderId: order.id,
        billNumber: returnNumber,
        account: 'cogs',
        accountRef: '',
        description: `Reversed COGS from return ${returnNumber}`,
        debit: 0,
        credit: restockedCost,
        createdAt: now,
      } satisfies LedgerEntryRecord
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity('sales_return_created', 'sales', `Recorded return ${returnNumber} for order ${order.billNumber}.`)
    await writeNotification(
      'Sales return recorded',
      `Return ${returnNumber} for order ${order.billNumber} processed — refund ${totalRefund}, ${restockedQty} unit(s) restocked${writtenOffQty > 0 ? `, ${writtenOffQty} unit(s) written off` : ''}.`,
      'info',
      ['super_admin', 'sales_officer', 'accounts']
    )

    return id
  }

  // Section 31 (Collection Management): a Sales/Collection Officer logging
  // money collected against one specific outstanding invoice — distinct
  // from the `paid` amount entered at invoice creation (createOrder), which
  // stays cash-only. This is the flow with a Cash/Bank/MFS choice, and it
  // generates the receipt the UI prints. Customer Ledger updates
  // automatically via the same 'customer' ledger account (accountRef =
  // customerId) every other customer posting already uses.
  async function recordCollection(input: CollectionInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording a collection.')
    }

    const order = data.orders[input.orderId]
    if (!order) {
      throw new Error('Invoice not found.')
    }

    if (input.amount <= 0) {
      throw new Error('Collection amount must be greater than zero.')
    }

    if (input.amount > order.due) {
      throw new Error('Collection amount cannot exceed the outstanding due.')
    }

    const db = getDatabaseOrThrow()
    const id = createId('collection')
    const now = new Date().toISOString()
    const collectionDate = input.collectionDate?.trim() || now
    const receiptNumber = `RCPT-${Date.now().toString().slice(-8)}`
    const nextDue = order.due - input.amount
    const nextPaid = order.paid + input.amount

    const collection: CollectionRecord = {
      id,
      receiptNumber,
      orderId: order.id,
      billNumber: order.billNumber,
      customerId: order.customerId,
      customerName: order.customerName,
      amount: input.amount,
      method: input.method,
      collectionDate,
      collectedBy: currentUser.id,
      collectedByName: currentUser.name,
      createdAt: now,
    }

    const updates: Record<string, unknown> = {
      [`collections/${id}`]: collection,
      [`orders/${order.id}/paid`]: nextPaid,
      [`orders/${order.id}/due`]: nextDue,
      [`orders/${order.id}/paymentStatus`]: nextDue === 0 ? 'paid' : nextPaid > 0 ? 'partial' : 'unpaid',
      [`customers/${order.customerId}/due`]: Math.max((data.customers[order.customerId]?.due ?? 0) - input.amount, 0),
    }

    const debitId = createId('ledger')
    updates[`ledgerEntries/${debitId}`] = {
      id: debitId,
      date: collectionDate,
      orderId: order.id,
      billNumber: receiptNumber,
      account: input.method,
      accountRef: '',
      description: `Collection against ${order.billNumber}`,
      debit: input.amount,
      credit: 0,
      createdAt: now,
    } satisfies LedgerEntryRecord
    const creditId = createId('ledger')
    updates[`ledgerEntries/${creditId}`] = {
      id: creditId,
      date: collectionDate,
      orderId: order.id,
      billNumber: receiptNumber,
      account: 'customer',
      accountRef: order.customerId,
      description: `Collection against ${order.billNumber}`,
      debit: 0,
      credit: input.amount,
      createdAt: now,
    } satisfies LedgerEntryRecord

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'collection_recorded',
      'finance',
      `Collected ${input.amount} against ${order.billNumber} (${order.customerName}) via ${input.method}.`
    )
    return id
  }

  async function createOrder(input: OrderInput) {
    if (!data || !currentUser) {
      return
    }

    const db = getDatabaseOrThrow()
    const customer = data.customers[input.customerId]
    if (!customer) {
      throw new Error('Customer not found.')
    }

    if (!input.items.length) {
      throw new Error('Add at least one product.')
    }

    const requestedByProduct = new Map<string, number>()
    const orderItems = input.items.map((item) => {
      const product = data.products[item.productId]
      if (!product) throw new Error('Product not found.')
      if (item.quantity <= 0) throw new Error(`Quantity for ${product.name} must be greater than zero.`)
      if (item.unitPrice < 0) throw new Error(`Price for ${product.name} cannot be negative.`)
      requestedByProduct.set(product.id, (requestedByProduct.get(product.id) ?? 0) + item.quantity)
      return {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        purchasePrice: product.purchasePrice,
      }
    })

    requestedByProduct.forEach((quantity, productId) => {
      const product = data.products[productId]
      if (product.stockQty < quantity) throw new Error(`Insufficient stock for ${product.name}.`)
    })

    const subtotal = orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const discount = Math.min(Math.max(input.discount ?? 0, 0), subtotal)
    const promotionalDiscount = Math.min(Math.max(input.promotionalDiscount ?? 0, 0), subtotal - discount)
    const netSales = subtotal - discount - promotionalDiscount
    const vat = Math.max(input.vat ?? 0, 0)
    const total = netSales + vat
    if (input.paid < 0) {
      throw new Error('Paid amount cannot be negative.')
    }

    // Section 18 completion: consume the soonest-expiring batch(es) each
    // product line actually draws from. Computed before `updates` below so
    // the enriched items (with `batchAllocations`) can go straight into the
    // order record instead of a conflicting follow-up write to the same path.
    const batchWrites: Record<string, unknown> = {}
    const batchAllocationsByProduct = new Map<string, OrderItemBatchAllocation[]>()
    requestedByProduct.forEach((quantity, productId) => {
      const allocations = consumeBatchesFefo(data, batchWrites, productId, quantity)
      if (allocations.length) {
        batchAllocationsByProduct.set(productId, allocations)
      }
    })
    const assignedBatchProducts = new Set<string>()
    const orderItemsWithBatches = orderItems.map((item) => {
      if (assignedBatchProducts.has(item.productId)) return item
      const allocations = batchAllocationsByProduct.get(item.productId)
      if (!allocations) return item
      assignedBatchProducts.add(item.productId)
      return { ...item, batchAllocations: allocations }
    })

    const orderId = createId('order')
    const billNumber = input.billNumber?.trim() || `INV-${Date.now().toString().slice(-8)}`
    const paid = Math.min(Math.max(input.paid, 0), total)
    const due = total - paid
    const now = new Date().toISOString()
    const orderDate = input.orderDate?.trim() || now
    const defaultDueDate = new Date(orderDate)
    defaultDueDate.setDate(defaultDueDate.getDate() + 15)
    const priceMode = input.priceMode ?? (customer.isWholesale ? 'wholesale' : 'retail')
    const cogs = getOrderCogs(orderItems)

    // Section 49 — Sales Approval Workflow: approval is only required for
    // the special cases the spec lists. A plain order (none of these) skips
    // straight to "approved" instead of sitting in every approver's queue.
    const approvalReasons: string[] = []
    const projectedCustomerDue = (customer.due ?? 0) + due
    if ((customer.creditLimit ?? 0) > 0 && projectedCustomerDue > (customer.creditLimit ?? 0)) {
      approvalReasons.push('Credit limit exceeded')
    }
    if (discount > 0) {
      approvalReasons.push('Special discount applied')
    }
    const belowMinimumPrice = orderItems.some((item) => {
      const product = data.products[item.productId]
      return (product?.minSellingPrice ?? 0) > 0 && item.unitPrice < (product?.minSellingPrice ?? 0)
    })
    if (belowMinimumPrice) {
      approvalReasons.push('Below minimum selling price')
    }

    const updates: Record<string, unknown> = {
      [`orders/${orderId}`]: {
        id: orderId,
        billNumber,
        customerId: customer.id,
        customerName: customer.name,
        salesPersonId: currentUser.id,
        salesPersonName: currentUser.name,
        status: 'pending',
        approvalStatus: approvalReasons.length > 0 ? 'pending' : 'approved',
        approvalReasons,
        paymentStatus: due === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        priceMode,
        total,
        subtotal,
        discount,
        promotionalDiscount,
        vat,
        paid,
        due,
        deliveryDate: input.deliveryDate,
        paymentDueDate: input.paymentDueDate?.trim() || defaultDueDate.toISOString(),
        dueReference: due > 0 ? input.dueReference || 'owner' : '',
        overdueNotified: false,
        remarks: input.remarks?.trim() ?? '',
        createdAt: orderDate,
        items: orderItemsWithBatches,
      },
      [`customers/${customer.id}/due`]: (data.customers[customer.id]?.due ?? 0) + due,
      ...batchWrites,
    }

    const invoiceEntries = buildInvoiceLedgerEntries({
      orderId,
      billNumber,
      date: orderDate,
      customerId: customer.id,
      netSales,
      vat,
      cogs,
      total,
      paid,
    })
    Object.values(invoiceEntries).forEach((entry) => {
      updates[`ledgerEntries/${entry.id}`] = entry
    })

    requestedByProduct.forEach((quantity, productId) => {
      const product = data.products[productId]
      const nextStock = product.stockQty - quantity
      updates[`products/${product.id}/stockQty`] = nextStock
      updates[`products/${product.id}/status`] = getProductStatus(nextStock, product.minStock)
      updates[`products/${product.id}/updatedAt`] = now
    })

    await update(ref(db, 'erp'), updates)

    await writeActivity('order_created', 'sales', `Created order for ${customer.name} with ${orderItems.length} product line(s).`)
    await writeNotification(
      'New sales order',
      `Order ${orderId} created for ${customer.name} by ${currentUser?.name ?? 'Admin'}. Awaiting fulfillment.`,
      'info',
      ['super_admin', 'sales_officer', 'accounts']
    )

    for (const [productId, quantity] of requestedByProduct) {
      const product = data.products[productId]
      const nextStock = product.stockQty - quantity
      if (nextStock > product.minStock) continue
      await writeNotification(
        'Low stock alert',
        `${product.name} needs replenishment after the latest sale (${nextStock}/${product.minStock}).`,
        'warning',
        ['super_admin', 'manager']
      )
    }

  }

  async function updateOrder(orderId: string, input: OrderInput, reason?: string) {
    if (!data || !currentUser) {
      return
    }

    const db = getDatabaseOrThrow()
    const order = data.orders[orderId]
    if (!order) {
      throw new Error('Order not found.')
    }

    if (order.status !== 'pending') {
      throw new Error('Only pending orders can be edited. Cancel and reissue instead.')
    }

    const customer = data.customers[input.customerId]
    if (!customer) {
      throw new Error('Customer not found.')
    }

    if (!input.items.length) {
      throw new Error('Add at least one product.')
    }

    const previousByProduct = new Map<string, number>()
    order.items.forEach((item) => {
      previousByProduct.set(item.productId, (previousByProduct.get(item.productId) ?? 0) + item.quantity)
    })

    const requestedByProduct = new Map<string, number>()
    const orderItems = input.items.map((item) => {
      const product = data.products[item.productId]
      if (!product) throw new Error('Product not found.')
      if (item.quantity <= 0) throw new Error(`Quantity for ${product.name} must be greater than zero.`)
      if (item.unitPrice < 0) throw new Error(`Price for ${product.name} cannot be negative.`)
      requestedByProduct.set(product.id, (requestedByProduct.get(product.id) ?? 0) + item.quantity)
      return {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        purchasePrice: product.purchasePrice,
      }
    })

    const affectedProductIds = new Set([...previousByProduct.keys(), ...requestedByProduct.keys()])
    affectedProductIds.forEach((productId) => {
      const product = data.products[productId]
      const available = product.stockQty + (previousByProduct.get(productId) ?? 0)
      const requested = requestedByProduct.get(productId) ?? 0
      if (available < requested) throw new Error(`Insufficient stock for ${product.name}.`)
    })

    const subtotal = orderItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const discount = Math.min(Math.max(input.discount ?? 0, 0), subtotal)
    const promotionalDiscount = Math.min(Math.max(input.promotionalDiscount ?? 0, 0), subtotal - discount)
    const netSales = subtotal - discount - promotionalDiscount
    const vat = Math.max(input.vat ?? 0, 0)
    const total = netSales + vat
    if (input.paid < 0) {
      throw new Error('Paid amount cannot be negative.')
    }

    const paid = Math.min(Math.max(input.paid, 0), total)
    const due = total - paid
    const now = new Date().toISOString()
    const priceMode = input.priceMode ?? (customer.isWholesale ? 'wholesale' : 'retail')
    const billNumber = input.billNumber?.trim() || order.billNumber
    const cogs = getOrderCogs(orderItems)

    // Section 49: re-check the special-case triggers, since editing can be
    // what pushes an order over the credit limit / into a special discount
    // / below the minimum price in the first place.
    const approvalReasons: string[] = []
    const projectedCustomerDue = (customer.due ?? 0) - order.due + due
    if ((customer.creditLimit ?? 0) > 0 && projectedCustomerDue > (customer.creditLimit ?? 0)) {
      approvalReasons.push('Credit limit exceeded')
    }
    if (discount > 0) {
      approvalReasons.push('Special discount applied')
    }
    const belowMinimumPrice = orderItems.some((item) => {
      const product = data.products[item.productId]
      return (product?.minSellingPrice ?? 0) > 0 && item.unitPrice < (product?.minSellingPrice ?? 0)
    })
    if (belowMinimumPrice) {
      approvalReasons.push('Below minimum selling price')
    }

    const updates: Record<string, unknown> = {
      [`orders/${orderId}/billNumber`]: billNumber,
      [`orders/${orderId}/customerId`]: customer.id,
      [`orders/${orderId}/customerName`]: customer.name,
      [`orders/${orderId}/approvalStatus`]: approvalReasons.length > 0 ? 'pending' : 'approved',
      [`orders/${orderId}/approvalReasons`]: approvalReasons,
      [`orders/${orderId}/paymentStatus`]: due === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      [`orders/${orderId}/priceMode`]: priceMode,
      [`orders/${orderId}/total`]: total,
      [`orders/${orderId}/subtotal`]: subtotal,
      [`orders/${orderId}/discount`]: discount,
      [`orders/${orderId}/promotionalDiscount`]: promotionalDiscount,
      [`orders/${orderId}/vat`]: vat,
      [`orders/${orderId}/paid`]: paid,
      [`orders/${orderId}/due`]: due,
      [`orders/${orderId}/deliveryDate`]: input.deliveryDate,
      [`orders/${orderId}/paymentDueDate`]: input.paymentDueDate?.trim() || order.paymentDueDate,
      [`orders/${orderId}/dueReference`]: due > 0 ? input.dueReference || 'owner' : '',
      [`orders/${orderId}/remarks`]: input.remarks?.trim() ?? '',
      [`orders/${orderId}/items`]: orderItems,
    }

    if (customer.id === order.customerId) {
      updates[`customers/${customer.id}/due`] = (data.customers[customer.id]?.due ?? 0) - order.due + due
    } else {
      updates[`customers/${order.customerId}/due`] = (data.customers[order.customerId]?.due ?? 0) - order.due
      updates[`customers/${customer.id}/due`] = (data.customers[customer.id]?.due ?? 0) + due
    }

    // The invoice figures changed — reverse every prior ledger entry for
    // this order and repost fresh ones, rather than trying to patch them.
    const previousEntries = getActiveLedgerEntries(data.ledgerEntries, orderId)
    Object.values(buildLedgerReversalEntries(previousEntries, now)).forEach((entry) => {
      updates[`ledgerEntries/${entry.id}`] = entry
    })
    Object.values(
      buildInvoiceLedgerEntries({
        orderId,
        billNumber,
        date: now,
        customerId: customer.id,
        netSales,
        vat,
        cogs,
        total,
        paid,
      })
    ).forEach((entry) => {
      updates[`ledgerEntries/${entry.id}`] = entry
    })

    affectedProductIds.forEach((productId) => {
      const product = data.products[productId]
      const previousQty = previousByProduct.get(productId) ?? 0
      const requestedQty = requestedByProduct.get(productId) ?? 0
      const nextStock = product.stockQty + previousQty - requestedQty
      updates[`products/${product.id}/stockQty`] = nextStock
      updates[`products/${product.id}/status`] = getProductStatus(nextStock, product.minStock)
      updates[`products/${product.id}/updatedAt`] = now
    })

    // Section 18 completion: release whatever batches the original lines
    // drew from, then re-consume fresh FEFO allocations for the edited
    // quantities — same reverse-then-repost shape as the stock/ledger
    // effects above.
    order.items.forEach((item) => {
      releaseBatchAllocations(data, updates, item.batchAllocations)
    })
    const batchAllocationsByProduct = new Map<string, OrderItemBatchAllocation[]>()
    requestedByProduct.forEach((quantity, productId) => {
      const allocations = consumeBatchesFefo(data, updates, productId, quantity)
      if (allocations.length) {
        batchAllocationsByProduct.set(productId, allocations)
      }
    })
    const assignedBatchProducts = new Set<string>()
    updates[`orders/${orderId}/items`] = orderItems.map((item) => {
      if (assignedBatchProducts.has(item.productId)) return item
      const allocations = batchAllocationsByProduct.get(item.productId)
      if (!allocations) return item
      assignedBatchProducts.add(item.productId)
      return { ...item, batchAllocations: allocations }
    })

    await update(ref(db, 'erp'), updates)

    // Section 64 (Approval System): Old Value -> New Value -> User ->
    // Date/Time -> Reason, all captured in one Audit Trail entry.
    await writeActivity('order_updated', 'sales', `Edited order ${order.billNumber} for ${customer.name}.`, {
      oldValue: {
        billNumber: order.billNumber,
        customerName: order.customerName,
        total: order.total,
        paid: order.paid,
        due: order.due,
        items: order.items.map((item) => ({ productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice })),
      },
      newValue: {
        billNumber,
        customerName: customer.name,
        total,
        paid,
        due,
        items: orderItems.map((item) => ({ productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice })),
      },
      reason,
    })
    await writeNotification(
      'Sales order edited',
      `Order ${order.billNumber} was edited by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['super_admin', 'sales_officer', 'accounts']
    )
  }

  async function cancelOrder(orderId: string, reason?: string) {
    if (!data || !currentUser) {
      return
    }

    const db = getDatabaseOrThrow()
    const order = data.orders[orderId]
    if (!order) {
      throw new Error('Order not found.')
    }

    if (order.status === 'cancelled') {
      return
    }

    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {
      [`orders/${orderId}/status`]: 'cancelled',
      [`orders/${orderId}/due`]: 0,
      [`customers/${order.customerId}/due`]: Math.max((data.customers[order.customerId]?.due ?? 0) - order.due, 0),
    }

    const activeEntries = getActiveLedgerEntries(data.ledgerEntries, orderId)
    Object.values(buildLedgerReversalEntries(activeEntries, now)).forEach((entry) => {
      updates[`ledgerEntries/${entry.id}`] = entry
    })

    const returnedByProduct = new Map<string, number>()
    order.items.forEach((item) => {
      returnedByProduct.set(item.productId, (returnedByProduct.get(item.productId) ?? 0) + item.quantity)
    })

    returnedByProduct.forEach((quantity, productId) => {
      const product = data.products[productId]
      if (!product) return
      const nextStock = product.stockQty + quantity
      updates[`products/${product.id}/stockQty`] = nextStock
      updates[`products/${product.id}/status`] = getProductStatus(nextStock, product.minStock)
      updates[`products/${product.id}/updatedAt`] = now
    })

    // Section 18 completion: restore every batch this order's lines had
    // drawn down.
    order.items.forEach((item) => {
      releaseBatchAllocations(data, updates, item.batchAllocations)
    })

    await update(ref(db, 'erp'), updates)

    await writeActivity('order_cancelled', 'sales', `Cancelled order ${order.billNumber} for ${order.customerName}.`, {
      oldValue: { status: order.status, total: order.total, due: order.due },
      newValue: { status: 'cancelled', total: order.total, due: 0 },
      reason,
    })
    await writeNotification(
      'Sales order cancelled',
      `Order ${order.billNumber} was cancelled by ${currentUser?.name ?? 'Admin'}. Stock has been returned.`,
      'warning',
      ['super_admin', 'sales_officer', 'accounts']
    )
  }

  async function updateOrderStatus(orderId: string, status: OrderRecord['status']) {
    if (!data) {
      return
    }

    const db = getDatabaseOrThrow()
    const order = data.orders[orderId]
    if (!order) {
      return
    }

    const updates: Record<string, unknown> = { [`orders/${orderId}/status`]: status }

    // Completing an order clears its balance — payment is considered settled in full.
    if (status === 'completed' && order.due > 0) {
      updates[`orders/${orderId}/paid`] = order.total
      updates[`orders/${orderId}/due`] = 0
      updates[`orders/${orderId}/paymentStatus`] = 'paid'
      updates[`customers/${order.customerId}/due`] = Math.max(
        (data.customers[order.customerId]?.due ?? 0) - order.due,
        0
      )

      // Collection cascade: the outstanding balance was just collected in full.
      const now = new Date().toISOString()
      const collectionId = createId('ledger')
      updates[`ledgerEntries/${collectionId}`] = {
        id: collectionId,
        date: now,
        orderId: order.id,
        billNumber: order.billNumber,
        account: 'cash',
        accountRef: '',
        description: `Collection against ${order.billNumber}`,
        debit: order.due,
        credit: 0,
        createdAt: now,
      } satisfies LedgerEntryRecord
      const collectionCustomerId = createId('ledger')
      updates[`ledgerEntries/${collectionCustomerId}`] = {
        id: collectionCustomerId,
        date: now,
        orderId: order.id,
        billNumber: order.billNumber,
        account: 'customer',
        accountRef: order.customerId,
        description: `Collection against ${order.billNumber}`,
        debit: 0,
        credit: order.due,
        createdAt: now,
      } satisfies LedgerEntryRecord
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity('order_status_changed', 'sales', `Moved order ${orderId} to ${status}.`)
    await writeNotification(
      'Order status updated',
      `Order ${orderId} status was updated to "${status}" by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['super_admin', 'sales_officer', 'accounts']
    )
  }

  // Section 49 — Sales Approval Workflow: an order only sits at
  // approvalStatus "pending" (see createOrder/updateOrder's approvalReasons
  // computation) when it tripped one of the special cases — Credit Limit
  // Exceeded, Special Discount, or Below Minimum Price — otherwise it skips
  // straight to "approved". The spec's chain (Sales Officer → Sales Manager
  // → Finance/Credit Control → Management) collapses to this single
  // orders:approve gate, the same simplification already used here since
  // there's no per-role approve permission for each named stage. Rejecting
  // an order cancels it outright — stock and ledger entries are reversed by
  // cancelOrder — since a rejected invoice should not stand.
  async function updateOrderApproval(orderId: string, approvalStatus: NonNullable<OrderRecord['approvalStatus']>) {
    if (!data || !currentUser) {
      return
    }

    if (!hasPermissionCheck(data, currentUser, 'orders:approve')) {
      throw new Error('You do not have permission to approve sales orders.')
    }

    const order = data.orders[orderId]
    if (!order) {
      throw new Error('Order not found.')
    }

    if (approvalStatus === 'rejected') {
      await cancelOrder(orderId)
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`orders/${orderId}/approvalStatus`]: approvalStatus })
    await writeActivity(
      'order_approval_changed',
      'sales',
      `Order ${order.billNumber} was ${approvalStatus} by ${currentUser.name}.`
    )
    await writeNotification(
      'Sales order approval updated',
      `Order ${order.billNumber} was ${approvalStatus} by ${currentUser.name}.`,
      approvalStatus === 'approved' ? 'info' : 'warning',
      ['super_admin', 'sales_officer', 'accounts']
    )
  }

  // ---- Section 63: Role & Permission Matrix -------------------------------
  // Role-based access control is mandatory, and every role's View / Create /
  // Edit / Delete / Approve / Export permissions are managed independently
  // here rather than only at seed time (see createDefaultERPData's example
  // Role list in defaultData.ts, which just supplies sensible starting
  // permissions for the 15 example roles the spec lists).
  async function saveRole(input: RoleInput, roleId?: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before managing roles.')
    }

    if (!hasPermissionCheck(data, currentUser, roleId ? 'users:edit' : 'users:create')) {
      throw new Error('You do not have permission to manage roles.')
    }

    const name = input.name.trim()
    if (!name) {
      throw new Error('Role name is required.')
    }

    // Only permission ids the system actually knows about get persisted —
    // guards against a stale checkbox list writing dead ids into the role.
    const validPermissionIds = new Set(Object.keys(data.permissions))
    const permissions = toPermissionSet(input.permissions.filter((id) => validPermissionIds.has(id)))

    const db = getDatabaseOrThrow()
    const existing = roleId ? data.roles[roleId] : undefined
    if (roleId && !existing) {
      throw new Error('Role not found.')
    }
    if (roleId === 'super_admin' && Object.keys(permissions).length !== validPermissionIds.size) {
      throw new Error('Super Admin must always keep every permission.')
    }

    const id = roleId ?? createId('role')
    const role: RoleRecord = {
      id,
      name,
      description: input.description?.trim() ?? existing?.description ?? '',
      permissions,
    }

    await update(ref(db, `erp/roles/${id}`), role)
    await writeActivity(roleId ? 'role_updated' : 'role_created', 'users', `${roleId ? 'Updated' : 'Created'} role ${role.name}.`)
    return id
  }

  async function deleteRole(roleId: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before deleting roles.')
    }

    if (!hasPermissionCheck(data, currentUser, 'users:delete')) {
      throw new Error('You do not have permission to delete roles.')
    }

    const existing = data.roles[roleId]
    if (!existing) {
      throw new Error('Role not found.')
    }

    if (roleId === 'super_admin') {
      throw new Error('The Super Admin role cannot be deleted.')
    }

    const assignedUser = users.find((user) => user.roleId === roleId)
    if (assignedUser) {
      throw new Error(`Cannot delete this role — ${assignedUser.name} is still assigned to it.`)
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`roles/${roleId}`]: null })
    await writeActivity('role_deleted', 'users', `Deleted role ${existing.name}.`)
  }

  async function createUser(input: UserInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before creating users.')
    }

    if (!hasPermissionCheck(data, currentUser, 'users:create')) {
      throw new Error('You do not have permission to create new users.')
    }

    if (!input.password) {
      throw new Error('A password is required to create a new user.')
    }

    // Section 66 (Security — Strong Password): at least 8 characters with a
    // letter and a number. Kept in one place so the rule can only drift by
    // editing it here — see the matching client-side hint in
    // UserManagementPanel.tsx.
    if (!isStrongPassword(input.password)) {
      throw new Error('Password must be at least 8 characters and include both a letter and a number.')
    }

    const normalizedLoginId = normalizeLookup(input.loginId)
    const normalizedPhone = normalizePhoneLookup(input.phone)

    const loginIdExists = users.some((user) => normalizeLookup(user.loginId) === normalizedLoginId)
    if (loginIdExists) {
      throw new Error('That login ID is already in use.')
    }

    const phoneExists = users.some((user) => normalizePhoneLookup(user.phone) === normalizedPhone)
    if (phoneExists) {
      throw new Error('That phone number is already in use.')
    }

    if (!data.roles[input.roleId]) {
      throw new Error('Selected role does not exist.')
    }

    const email = `${normalizedLoginId}@${SYNTHETIC_EMAIL_DOMAIN}`

    let uid: string
    try {
      uid = await createManagedUser(email, input.password)
    } catch (reason) {
      console.error('[createUser] Firebase Auth account creation failed:', reason)
      throw new Error('Unable to create a login for this user. Try a different login ID.')
    }

    const db = getDatabaseOrThrow()
    const user: UserRecord = {
      id: uid,
      name: input.name.trim(),
      loginId: normalizedLoginId,
      email,
      phone: normalizedPhone,
      roleId: input.roleId,
      title: input.title.trim(),
      status: 'active',
    }

    await update(ref(db, 'erp/users'), { [uid]: user })
    await writeActivity('user_created', 'users', `Created user ${user.name} with ${data.roles[user.roleId]?.name ?? user.roleId} access.`)
    await writeNotification(
      'New user registered',
      `User ${user.name} was registered as ${data?.roles[user.roleId]?.name || user.roleId} by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['super_admin']
    )
  }

  async function updateUser(userId: string, input: UserInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before updating users.')
    }

    if (!hasPermissionCheck(data, currentUser, 'users:edit')) {
      throw new Error('You do not have permission to update users.')
    }

    const existing = data.users[userId]
    if (!existing) {
      throw new Error('User not found.')
    }

    const normalizedLoginId = normalizeLookup(input.loginId)
    const normalizedPhone = normalizePhoneLookup(input.phone)

    const loginIdExists = users.some(
      (user) => user.id !== userId && normalizeLookup(user.loginId) === normalizedLoginId
    )
    if (loginIdExists) {
      throw new Error('That login ID is already in use.')
    }

    const phoneExists = users.some(
      (user) => user.id !== userId && normalizePhoneLookup(user.phone) === normalizedPhone
    )
    if (phoneExists) {
      throw new Error('That phone number is already in use.')
    }

    if (!data.roles[input.roleId]) {
      throw new Error('Selected role does not exist.')
    }

    const db = getDatabaseOrThrow()
    const updatedUser: UserRecord = {
      ...existing,
      name: input.name.trim(),
      // loginId is a display/uniqueness field only — the account's actual
      // Firebase Auth email can't be changed without an Admin SDK, so it
      // deliberately stays whatever it was set to at creation time.
      loginId: normalizedLoginId,
      phone: normalizedPhone,
      roleId: input.roleId,
      title: input.title.trim(),
    }

    await update(ref(db, `erp/users/${userId}`), updatedUser)
    await writeActivity('user_updated', 'users', `Updated user ${updatedUser.name}.`)
  }

  async function deleteUser(userId: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before deleting users.')
    }

    if (!hasPermissionCheck(data, currentUser, 'users:delete')) {
      throw new Error('You do not have permission to delete users.')
    }

    if (userId === currentUser.id) {
      throw new Error('You cannot delete your own account.')
    }

    const existing = data.users[userId]
    if (!existing) {
      throw new Error('User not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`users/${userId}`]: null,
    })
    await writeActivity('user_deleted', 'users', `Deleted user ${existing.name}.`)
  }

  async function sendPasswordReset(email: string) {
    if (!currentUser) {
      throw new Error('You need to log in before resetting a password.')
    }

    if (!hasPermissionCheck(data, currentUser, 'users:edit')) {
      throw new Error('You do not have permission to reset user passwords.')
    }

    await sendUserPasswordReset(email)
  }

  async function markNotificationRead(notificationId: string) {
    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/notifications/${notificationId}`), { read: true })
  }

  async function markAllNotificationsRead(notificationIds: string[]) {
    if (notificationIds.length === 0) {
      return
    }
    const db = getDatabaseOrThrow()
    const updates: Record<string, boolean> = {}
    for (const id of notificationIds) {
      updates[`erp/notifications/${id}/read`] = true
    }
    await update(ref(db), updates)
  }

  async function saveExpense(input: ExpenseInput, expenseId?: string) {
    if (!data || !currentUser) {
      return
    }

    const category = input.category.trim()
    if (!category) {
      throw new Error('Expense category is required.')
    }

    if (input.amount <= 0) {
      throw new Error('Expense amount must be greater than zero.')
    }

    const db = getDatabaseOrThrow()
    const existingExpense = expenseId ? data.expenses[expenseId] : null
    const id = existingExpense?.id ?? createId('expense')
    const now = new Date().toISOString()
    const paymentMethod = input.paymentMethod ?? existingExpense?.paymentMethod ?? 'cash'
    const expenseDate = input.date?.trim() || now
    const expense: ExpenseRecord = {
      id,
      category,
      amount: input.amount,
      note: input.note?.trim() ?? '',
      date: expenseDate,
      paymentMethod,
      // Section 36: every new expense starts at "pending" until someone
      // with finance:edit reviews it (updateExpenseApproval below); editing
      // an already-reviewed expense leaves its approval status untouched.
      approvalStatus: existingExpense?.approvalStatus ?? 'pending',
      approvedBy: existingExpense?.approvedBy ?? '',
      approvedByName: existingExpense?.approvedByName ?? '',
      approvedAt: existingExpense?.approvedAt ?? '',
      createdBy: existingExpense?.createdBy ?? currentUser.id,
      createdByName: existingExpense?.createdByName ?? currentUser.name,
      createdAt: existingExpense?.createdAt ?? now,
    }

    const updates: Record<string, unknown> = { [`expenses/${id}`]: expense }

    // Reverse-then-repost, same pattern as editing a sales invoice — the
    // original ledger lines stay in the audit trail, just reversed.
    if (existingExpense) {
      const active = getActiveLedgerEntries(data.ledgerEntries, id)
      Object.values(buildLedgerReversalEntries(active, now)).forEach((entry) => {
        updates[`ledgerEntries/${entry.id}`] = entry
      })
    }
    Object.values(
      buildExpenseLedgerEntries({ expenseId: id, date: expenseDate, category, amount: input.amount, paymentMethod })
    ).forEach((entry) => {
      updates[`ledgerEntries/${entry.id}`] = entry
    })

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      existingExpense ? 'expense_updated' : 'expense_created',
      'finance',
      existingExpense ? `Updated ${category} expense entry.` : `Recorded ${category} expense of ${expense.amount}.`
    )
    // Section 37: re-check this category's budget(s) with the just-saved
    // amount folded in — data.expenses is last snapshot, not this write.
    await checkBudgetOverrun(data.budgets, { ...data.expenses, [id]: expense }, writeNotification, category, expenseDate)
  }

  // Section 36 (Expense Approval Workflow): an expense posts to the ledger
  // immediately at entry (see buildExpenseLedgerEntries) and sits at
  // "pending" until someone with finance:edit signs off — same "post
  // first, approve as a review gate" shape as Sales Order approval
  // (updateOrderApproval above). Rejecting reverses the ledger entries (the
  // spend is disallowed) but keeps the record itself for audit, unlike
  // deleteExpense which removes it outright. Only a "pending" expense can
  // be reviewed, to avoid double-reversing or re-posting on a flip-flop.
  async function updateExpenseApproval(expenseId: string, approvalStatus: ExpenseApprovalStatus) {
    if (!data || !currentUser) {
      return
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to approve expenses.')
    }

    const expense = data.expenses[expenseId]
    if (!expense) {
      throw new Error('Expense not found.')
    }

    if (expense.approvalStatus !== 'pending') {
      throw new Error('This expense has already been reviewed.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {
      [`expenses/${expenseId}/approvalStatus`]: approvalStatus,
      [`expenses/${expenseId}/approvedBy`]: currentUser.id,
      [`expenses/${expenseId}/approvedByName`]: currentUser.name,
      [`expenses/${expenseId}/approvedAt`]: now,
    }

    if (approvalStatus === 'rejected') {
      const active = getActiveLedgerEntries(data.ledgerEntries, expenseId)
      Object.values(buildLedgerReversalEntries(active, now)).forEach((entry) => {
        updates[`ledgerEntries/${entry.id}`] = entry
      })
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'expense_approval_changed',
      'finance',
      `${expense.category} expense of ${expense.amount} was ${approvalStatus} by ${currentUser.name}.`
    )
    await writeNotification(
      'Expense approval updated',
      `${expense.category} expense of ${expense.amount} was ${approvalStatus} by ${currentUser.name}.`,
      approvalStatus === 'approved' ? 'info' : 'warning',
      ['super_admin', 'manager', 'accounts']
    )
  }

  // ---- Budget Management (Section 37) ------------------------------------

  async function saveBudget(input: BudgetInput, budgetId?: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before setting a budget.')
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to manage budgets.')
    }

    const category = input.category.trim()
    if (!category) {
      throw new Error('Budget category is required.')
    }
    if (!input.year || input.year < 2000) {
      throw new Error('A valid year is required.')
    }
    if (input.periodType === 'monthly' && (!input.month || input.month < 1 || input.month > 12)) {
      throw new Error('A valid month is required for a monthly budget.')
    }
    if (input.budgetAmount <= 0) {
      throw new Error('Budget amount must be greater than zero.')
    }

    const db = getDatabaseOrThrow()
    const existing = budgetId ? data.budgets[budgetId] : null
    const id = existing?.id ?? createId('budget')
    const now = new Date().toISOString()
    const budget: BudgetRecord = {
      id,
      category,
      periodType: input.periodType,
      year: input.year,
      month: input.periodType === 'monthly' ? (input.month as number) : 0,
      budgetAmount: input.budgetAmount,
      note: input.note?.trim() ?? '',
      createdBy: existing?.createdBy ?? currentUser.id,
      createdByName: existing?.createdByName ?? currentUser.name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/budgets'), { [id]: budget })
    await writeActivity(
      existing ? 'budget_updated' : 'budget_created',
      'finance',
      `${existing ? 'Updated' : 'Set'} ${budget.periodType} budget for ${category} (${budget.periodType === 'monthly' ? `${budget.month}/${budget.year}` : budget.year}): ${budget.budgetAmount}.`
    )
  }

  async function deleteBudget(budgetId: string) {
    if (!data || !currentUser) {
      return
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to manage budgets.')
    }

    const budget = data.budgets[budgetId]
    if (!budget) {
      throw new Error('Budget not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp/budgets'), { [budgetId]: null })
    await writeActivity('budget_deleted', 'finance', `Deleted ${budget.category} budget.`)
  }

  // ---- Sales Target (Section 41) ------------------------------------------
  async function saveSalesTarget(input: SalesTargetInput, targetId?: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before setting a sales target.')
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to set sales targets.')
    }

    if (!/^\d{4}-\d{2}$/.test(input.period)) {
      throw new Error('Period must be in YYYY-MM format.')
    }

    if (!input.entityId) {
      throw new Error('Select who this target applies to.')
    }

    if (input.targetAmount <= 0) {
      throw new Error('Target amount must be greater than zero.')
    }

    const db = getDatabaseOrThrow()
    const existing = targetId ? data.salesTargets[targetId] : null
    const id = existing?.id ?? createId('target')
    const now = new Date().toISOString()
    const target: SalesTargetRecord = {
      id,
      period: input.period,
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName?.trim() || existing?.entityName || input.entityId,
      targetAmount: input.targetAmount,
      createdBy: existing?.createdBy ?? currentUser.id,
      createdByName: existing?.createdByName ?? currentUser.name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/salesTargets'), { [id]: target })
    await writeActivity(
      existing ? 'sales_target_updated' : 'sales_target_created',
      'finance',
      `${existing ? 'Updated' : 'Set'} ${target.period} target for ${target.entityName}: ${target.targetAmount}.`
    )
    return id
  }

  async function deleteSalesTarget(targetId: string) {
    if (!data || !currentUser) {
      return
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to manage sales targets.')
    }

    const target = data.salesTargets[targetId]
    if (!target) {
      throw new Error('Sales target not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp/salesTargets'), { [targetId]: null })
    await writeActivity('sales_target_deleted', 'finance', `Deleted ${target.period} target for ${target.entityName}.`)
  }

  // ---- Commission Management (Section 42) ---------------------------------
  async function saveCommissionRule(input: CommissionRuleInput, ruleId?: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before managing commission rules.')
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to manage commission rules.')
    }

    const name = input.name.trim()
    if (!name) {
      throw new Error('Rule name is required.')
    }

    const slabs = (input.slabs ?? []).map((slab) => ({
      minSales: Math.max(slab.minSales, 0),
      maxSales: slab.maxSales === null || slab.maxSales === undefined ? null : Math.max(slab.maxSales, 0),
      percentage: Math.max(slab.percentage, 0),
    }))
    const productRates = (input.productRates ?? [])
      .filter((rate) => rate.productId)
      .map((rate) => {
        const product = data.products[rate.productId]
        return {
          productId: rate.productId,
          productName: product?.name ?? rate.productName,
          percentage: Math.max(rate.percentage, 0),
        }
      })

    if (input.ruleType === 'slab' && slabs.length === 0) {
      throw new Error('Add at least one sales slab.')
    }
    if (input.ruleType === 'product' && productRates.length === 0) {
      throw new Error('Add at least one product commission rate.')
    }

    const db = getDatabaseOrThrow()
    const existing = ruleId ? data.commissionRules[ruleId] : null
    const id = existing?.id ?? createId('commrule')
    const now = new Date().toISOString()
    const rule: CommissionRuleRecord = {
      id,
      name,
      appliesTo: input.appliesTo,
      ruleType: input.ruleType,
      slabs,
      productRates,
      status: input.status ?? 'active',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/commissionRules'), { [id]: rule })
    await writeActivity(
      existing ? 'commission_rule_updated' : 'commission_rule_created',
      'finance',
      `${existing ? 'Updated' : 'Created'} commission rule "${rule.name}" (${rule.appliesTo}).`
    )
    return id
  }

  async function deleteCommissionRule(ruleId: string) {
    if (!data || !currentUser) {
      return
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to manage commission rules.')
    }

    const rule = data.commissionRules[ruleId]
    if (!rule) {
      throw new Error('Commission rule not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp/commissionRules'), { [ruleId]: null })
    await writeActivity('commission_rule_deleted', 'finance', `Deleted commission rule "${rule.name}".`)
  }

  // Marks one period's auto-calculated commission (computed live from
  // commissionRules + orders, never stored until this point — the same
  // "Actual is never stored" approach as Budget) as
  // actually paid out. Posts Dr Commission / Cr Cash-or-Bank, reusing the
  // existing 'commission' LedgerAccount the Expense Category "Commission"
  // already posts to.
  async function recordCommissionPayout(input: CommissionPayoutInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording a commission payout.')
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to pay out commission.')
    }

    const rule = data.commissionRules[input.ruleId]
    if (!rule) {
      throw new Error('Commission rule not found.')
    }

    if (input.commissionAmount <= 0) {
      throw new Error('Commission amount must be greater than zero.')
    }

    const db = getDatabaseOrThrow()
    const id = createId('compayout')
    const now = new Date().toISOString()
    const receiptNumber = `COMM-${Date.now().toString().slice(-8)}`
    const paymentMethod = input.paymentMethod ?? 'cash'

    const payout: CommissionPayoutRecord = {
      id,
      receiptNumber,
      period: input.period,
      appliesTo: input.appliesTo,
      entityId: input.entityId,
      entityName: input.entityName,
      ruleId: rule.id,
      ruleName: rule.name,
      salesAmount: input.salesAmount,
      commissionAmount: input.commissionAmount,
      paymentMethod,
      paidBy: currentUser.id,
      paidByName: currentUser.name,
      createdAt: now,
    }

    const updates: Record<string, unknown> = {
      [`commissionPayouts/${id}`]: payout,
    }

    const debitId = createId('ledger')
    updates[`ledgerEntries/${debitId}`] = {
      id: debitId,
      date: now,
      orderId: id,
      billNumber: receiptNumber,
      account: 'commission',
      accountRef: input.entityId,
      description: `Commission payout to ${input.entityName} (${input.period})`,
      debit: input.commissionAmount,
      credit: 0,
      createdAt: now,
    } satisfies LedgerEntryRecord
    const creditId = createId('ledger')
    updates[`ledgerEntries/${creditId}`] = {
      id: creditId,
      date: now,
      orderId: id,
      billNumber: receiptNumber,
      account: paymentMethod === 'bank' ? 'bank' : 'cash',
      accountRef: '',
      description: `Commission payout to ${input.entityName} (${input.period})`,
      debit: 0,
      credit: input.commissionAmount,
      createdAt: now,
    } satisfies LedgerEntryRecord

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'commission_paid',
      'finance',
      `Paid ${input.commissionAmount} commission to ${input.entityName} for ${input.period}.`
    )
    return id
  }

  async function saveSettings(input: SettingsInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before changing settings.')
    }

    if (!hasPermissionCheck(data, currentUser, 'users:edit')) {
      throw new Error('You do not have permission to change business settings.')
    }

    const companyName = input.companyName.trim()
    if (!companyName) {
      throw new Error('Company name is required.')
    }

    if (input.returnWindowDays < 0) {
      throw new Error('Return window cannot be negative.')
    }

    const db = getDatabaseOrThrow()
    const settings = {
      companyName,
      currency: input.currency.trim() || 'BDT',
      timezone: input.timezone.trim() || 'Asia/Dhaka',
      returnWindowDays: input.returnWindowDays,
      refundPolicy: input.refundPolicy,
      restockOnReturn: input.restockOnReturn,
    }

    await set(ref(db, 'erp/settings'), settings)
    await writeActivity('settings_updated', 'settings', `${currentUser.name} updated business and return policy settings.`)
  }

  async function saveInvestor(input: InvestorInput, investorId?: string) {
    if (!data) return
    const name = input.name.trim()
    const mobile = input.mobile.trim()
    if (!name) throw new Error('Investor name is required.')
    if (!mobile) throw new Error('Investor mobile number is required.')
    if (input.amount <= 0) throw new Error('Investment amount must be greater than zero.')

    const existing = investorId ? data.investors[investorId] : null
    const id = existing?.id ?? createId('investor')
    const now = new Date().toISOString()
    const investor = {
      id,
      name,
      location: input.location?.trim() ?? '',
      mobile,
      products: input.products?.trim() ?? '',
      amount: input.amount,
      note: input.note?.trim() ?? '',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await update(ref(getDatabaseOrThrow(), 'erp/investors'), { [id]: investor })
    await writeActivity(existing ? 'investor_updated' : 'investor_created', 'finance', `${existing ? 'Updated' : 'Added'} investor ${name}.`)
  }

  async function deleteExpense(expenseId: string) {
    if (!data) {
      return
    }

    const expense = data.expenses[expenseId]
    if (!expense) {
      throw new Error('Expense not found.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = { [`expenses/${expenseId}`]: null }
    const active = getActiveLedgerEntries(data.ledgerEntries, expenseId)
    Object.values(buildLedgerReversalEntries(active, now)).forEach((entry) => {
      updates[`ledgerEntries/${entry.id}`] = entry
    })

    await update(ref(db, 'erp'), updates)
    await writeActivity('expense_deleted', 'finance', `Deleted ${expense.category} expense entry.`)
  }

  // ---- Accounting Module: Chart of Accounts / Journal (Sections 27-29) --

  async function saveChartOfAccount(input: ChartOfAccountInput, accountId?: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before editing the chart of accounts.')
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to edit the chart of accounts.')
    }

    const code = input.code.trim()
    const name = input.name.trim()
    if (!code) {
      throw new Error('Account code is required.')
    }
    if (!name) {
      throw new Error('Account name is required.')
    }

    const existing = accountId ? data.chartOfAccounts[accountId] : null
    if (existing?.isSystem && (existing.code !== code || existing.type !== input.type)) {
      throw new Error('System accounts back the automatic posting engine — rename or deactivate them, but their code and type cannot change.')
    }

    const duplicateCode = Object.values(data.chartOfAccounts).find(
      (account) => account.code === code && account.id !== accountId
    )
    if (duplicateCode) {
      throw new Error(`Account code ${code} is already in use.`)
    }

    const db = getDatabaseOrThrow()
    const id = existing?.id ?? createId('coa')
    const now = new Date().toISOString()
    const account = {
      id,
      code,
      name,
      type: input.type,
      isSystem: existing?.isSystem ?? false,
      openingBalance: input.openingBalance ?? existing?.openingBalance ?? 0,
      status: input.status ?? existing?.status ?? 'active',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(existing?.ledgerAccount ? { ledgerAccount: existing.ledgerAccount } : {}),
    }

    await update(ref(db, 'erp/chartOfAccounts'), { [id]: account })
    await writeActivity(
      existing ? 'chart_of_account_updated' : 'chart_of_account_created',
      'finance',
      `${existing ? 'Updated' : 'Added'} chart of account ${code} - ${name}.`
    )
    return id
  }

  async function deleteChartOfAccount(accountId: string) {
    if (!data || !currentUser) {
      return
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to edit the chart of accounts.')
    }

    const account = data.chartOfAccounts[accountId]
    if (!account) {
      throw new Error('Account not found.')
    }

    if (account.isSystem) {
      throw new Error('System accounts back the automatic posting engine and cannot be deleted — deactivate it instead.')
    }

    const referenced = Object.values(data.journalEntries).some(
      (entry) => entry.status === 'posted' && entry.lines.some((line) => line.accountId === accountId)
    )
    if (referenced) {
      throw new Error('This account has posted journal entries against it and cannot be deleted — deactivate it instead.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`chartOfAccounts/${accountId}`]: null })
    await writeActivity('chart_of_account_deleted', 'finance', `Deleted chart of account ${account.code} - ${account.name}.`)
  }

  // One-shot loader for the Section 28 standard hierarchy — idempotent by
  // `code`, so re-running it after adding custom accounts only fills in
  // whatever's still missing (mirrors the Section 1 starter-catalog loader:
  // this never overwrites data the user already has).
  async function seedStandardChartOfAccounts() {
    if (!data || !currentUser) {
      throw new Error('You need to log in before loading the chart of accounts.')
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to edit the chart of accounts.')
    }

    const existingCodes = new Set(Object.values(data.chartOfAccounts).map((account) => account.code))
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {}
    let added = 0

    STANDARD_CHART_OF_ACCOUNTS.forEach((entry) => {
      if (existingCodes.has(entry.code)) {
        return
      }

      const id = createId('coa')
      updates[`chartOfAccounts/${id}`] = {
        id,
        code: entry.code,
        name: entry.name,
        type: entry.type,
        isSystem: Boolean(entry.ledgerAccount),
        openingBalance: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        ...(entry.ledgerAccount ? { ledgerAccount: entry.ledgerAccount } : {}),
      }
      added += 1
    })

    if (added === 0) {
      throw new Error('The standard chart of accounts is already loaded.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), updates)
    await writeActivity('chart_of_accounts_seeded', 'finance', `Loaded ${added} standard chart of account(s).`)
  }

  // Section 27 (Journal) — the manual escape hatch: anything the automatic
  // engine doesn't post on its own goes through here as a balanced
  // multi-line voucher. Every line posts one ledgerEntries row with
  // account:'manual' and accountRef:<chartAccountId> so it shows up in the
  // same General Ledger / Trial Balance as the automatic postings.
  async function createJournalEntry(input: JournalEntryInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before posting a journal entry.')
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to post journal entries.')
    }

    const narration = input.narration.trim()
    if (!narration) {
      throw new Error('Journal narration is required.')
    }

    const rawLines = input.lines.filter((line) => (line.debit ?? 0) > 0 || (line.credit ?? 0) > 0)
    if (rawLines.length < 2) {
      throw new Error('A journal entry needs at least two lines with an amount.')
    }

    let totalDebit = 0
    let totalCredit = 0
    const resolvedLines: JournalEntryLine[] = rawLines.map((line) => {
      const account = data.chartOfAccounts[line.accountId]
      if (!account) {
        throw new Error('One of the selected accounts was not found.')
      }
      if (line.debit < 0 || line.credit < 0) {
        throw new Error('Amounts cannot be negative.')
      }
      if (line.debit > 0 && line.credit > 0) {
        throw new Error(`${account.name}: enter either a debit or a credit on one line, not both.`)
      }
      totalDebit += line.debit
      totalCredit += line.credit
      return {
        accountId: account.id,
        accountName: account.name,
        debit: line.debit,
        credit: line.credit,
        description: line.description?.trim() ?? '',
      }
    })

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Journal entry is not balanced — debit ${totalDebit.toFixed(2)} vs credit ${totalCredit.toFixed(2)}.`)
    }

    const db = getDatabaseOrThrow()
    const id = createId('journal')
    const journalNumber = `JV-${Date.now().toString().slice(-8)}`
    const now = new Date().toISOString()
    const date = input.date?.trim() || now

    const journalEntry: JournalEntryRecord = {
      id,
      journalNumber,
      date,
      narration,
      lines: resolvedLines,
      status: 'posted',
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: now,
    }

    const updates: Record<string, unknown> = { [`journalEntries/${id}`]: journalEntry }
    resolvedLines.forEach((line) => {
      const ledgerId = createId('ledger')
      updates[`ledgerEntries/${ledgerId}`] = {
        id: ledgerId,
        date,
        orderId: id,
        billNumber: journalNumber,
        account: 'manual',
        accountRef: line.accountId,
        description: line.description || narration,
        debit: line.debit,
        credit: line.credit,
        createdAt: now,
      } satisfies LedgerEntryRecord
    })

    await update(ref(db, 'erp'), updates)
    await writeActivity('journal_entry_posted', 'finance', `Posted journal entry ${journalNumber}: ${narration}.`)
    return id
  }

  // Never a hard delete — reversing keeps the audit trail permanent, same
  // philosophy as every other cancellation in this system.
  async function reverseJournalEntry(journalEntryId: string, reason?: string) {
    if (!data || !currentUser) {
      return
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to reverse journal entries.')
    }

    const journalEntry = data.journalEntries[journalEntryId]
    if (!journalEntry) {
      throw new Error('Journal entry not found.')
    }

    if (journalEntry.status === 'reversed') {
      throw new Error('This journal entry has already been reversed.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const active = getActiveLedgerEntries(data.ledgerEntries, journalEntryId)
    const updates: Record<string, unknown> = {
      [`journalEntries/${journalEntryId}/status`]: 'reversed',
    }
    Object.values(buildLedgerReversalEntries(active, now)).forEach((entry) => {
      updates[`ledgerEntries/${entry.id}`] = entry
    })

    await update(ref(db, 'erp'), updates)
    // Section 64/65: an Accounting Adjustment is exactly the kind of action
    // the Audit Trail must capture — old status, new status, who, when, why.
    await writeActivity('journal_entry_reversed', 'finance', `Reversed journal entry ${journalEntry.journalNumber}.`, {
      oldValue: { status: journalEntry.status, lines: journalEntry.lines },
      newValue: { status: 'reversed' },
      reason,
    })
  }

  // ---- Bank Management (Section 35) --------------------------------------

  // Every bank account auto-gets its own manual Chart of Accounts row
  // (isSystem — it backs this module's automatic posting, same as Cash or
  // Sales) so its balance shows up in the General Ledger / Trial Balance /
  // Balance Sheet exactly like any other account, with zero extra report
  // logic needed.
  async function saveBankAccount(input: BankAccountInput, bankAccountId?: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before editing bank accounts.')
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to edit bank accounts.')
    }

    const bankName = input.bankName.trim()
    const accountNumber = input.accountNumber.trim()
    if (!bankName) {
      throw new Error('Bank name is required.')
    }
    if (!accountNumber) {
      throw new Error('Account number is required.')
    }

    const existing = bankAccountId ? data.bankAccounts[bankAccountId] : null
    const duplicate = Object.values(data.bankAccounts).find(
      (account) => account.accountNumber === accountNumber && account.id !== bankAccountId
    )
    if (duplicate) {
      throw new Error(`Account number ${accountNumber} is already registered.`)
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const branch = input.branch?.trim() ?? ''
    const openingBalance = input.openingBalance ?? existing?.openingBalance ?? 0
    const status = input.status ?? existing?.status ?? 'active'
    const label = `${bankName} — ${accountNumber}`

    const id = existing?.id ?? createId('bank')
    const chartAccountId = existing?.chartAccountId ?? createId('coa')
    const existingChartAccount = existing ? data.chartOfAccounts[existing.chartAccountId] : undefined

    const updates: Record<string, unknown> = {
      [`chartOfAccounts/${chartAccountId}`]: {
        id: chartAccountId,
        code: existingChartAccount?.code ?? `BANK-${chartAccountId.slice(-6)}`,
        name: `Bank — ${label}`,
        type: 'asset',
        isSystem: true,
        openingBalance,
        status,
        createdAt: existingChartAccount?.createdAt ?? now,
        updatedAt: now,
      },
      [`bankAccounts/${id}`]: {
        id,
        bankName,
        branch,
        accountNumber,
        openingBalance,
        chartAccountId,
        status,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      existing ? 'bank_account_updated' : 'bank_account_created',
      'finance',
      `${existing ? 'Updated' : 'Added'} bank account ${label}.`
    )
    return id
  }

  async function deleteBankAccount(bankAccountId: string) {
    if (!data || !currentUser) {
      return
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to edit bank accounts.')
    }

    const bankAccount = data.bankAccounts[bankAccountId]
    if (!bankAccount) {
      throw new Error('Bank account not found.')
    }

    const hasTransactions = Object.values(data.bankTransactions).some(
      (transaction) => transaction.bankAccountId === bankAccountId || transaction.toBankAccountId === bankAccountId
    )
    if (hasTransactions) {
      throw new Error('This bank account has transactions posted against it — deactivate it instead of deleting.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`bankAccounts/${bankAccountId}`]: null,
      [`chartOfAccounts/${bankAccount.chartAccountId}`]: null,
    })
    await writeActivity('bank_account_deleted', 'finance', `Deleted bank account ${bankAccount.bankName} — ${bankAccount.accountNumber}.`)
  }

  // Deposit/Withdrawal move against Cash (the common case: cash-in-hand
  // going into or coming out of the bank) so the form only ever needs one
  // amount field. Transfer moves between two named bank accounts. Bank
  // Charge always hits the standard Bank Charge expense account. Cheque
  // Issued/Deposited ask for a counter account since what a cheque is for
  // varies — same account picker a Journal Entry line uses.
  async function recordBankTransaction(input: BankTransactionInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording a bank transaction.')
    }

    if (!hasPermissionCheck(data, currentUser, 'finance:edit')) {
      throw new Error('You do not have permission to record bank transactions.')
    }

    const bankAccount = data.bankAccounts[input.bankAccountId]
    if (!bankAccount) {
      throw new Error('Bank account not found.')
    }

    if (input.amount <= 0) {
      throw new Error('Amount must be greater than zero.')
    }

    const db = getDatabaseOrThrow()
    const id = createId('banktxn')
    const now = new Date().toISOString()
    const date = input.date?.trim() || now
    const bankLabel = `${bankAccount.bankName} — ${bankAccount.accountNumber}`
    const description = `${input.type.replace(/_/g, ' ')} — ${bankLabel}`

    const record: Record<string, unknown> = {
      id,
      bankAccountId: bankAccount.id,
      bankLabel,
      type: input.type,
      amount: input.amount,
      date,
      chequeNumber: input.chequeNumber?.trim() ?? '',
      payee: input.payee?.trim() ?? '',
      note: input.note?.trim() ?? '',
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: now,
    }

    const updates: Record<string, unknown> = {}
    const postLedger = (account: LedgerAccount, accountRef: string, debit: number, credit: number, ledgerDescription: string) => {
      const ledgerId = createId('ledger')
      updates[`ledgerEntries/${ledgerId}`] = {
        id: ledgerId,
        date,
        orderId: id,
        billNumber: bankLabel,
        account,
        accountRef,
        description: ledgerDescription,
        debit,
        credit,
        createdAt: now,
      } satisfies LedgerEntryRecord
    }

    if (input.type === 'deposit') {
      postLedger('manual', bankAccount.chartAccountId, input.amount, 0, description)
      postLedger('cash', '', 0, input.amount, description)
    } else if (input.type === 'withdrawal') {
      postLedger('cash', '', input.amount, 0, description)
      postLedger('manual', bankAccount.chartAccountId, 0, input.amount, description)
    } else if (input.type === 'transfer') {
      const toBankAccount = input.toBankAccountId ? data.bankAccounts[input.toBankAccountId] : undefined
      if (!toBankAccount) {
        throw new Error('Select a destination bank account.')
      }
      if (toBankAccount.id === bankAccount.id) {
        throw new Error('Source and destination bank accounts must be different.')
      }
      const toLabel = `${toBankAccount.bankName} — ${toBankAccount.accountNumber}`
      postLedger('manual', toBankAccount.chartAccountId, input.amount, 0, `Transfer from ${bankLabel}`)
      postLedger('manual', bankAccount.chartAccountId, 0, input.amount, `Transfer to ${toLabel}`)
      record.toBankAccountId = toBankAccount.id
      record.toBankLabel = toLabel
    } else if (input.type === 'bank_charge') {
      postLedger('bank_charge', '', input.amount, 0, description)
      postLedger('manual', bankAccount.chartAccountId, 0, input.amount, description)
    } else {
      const counterAccount = input.counterAccountId ? data.chartOfAccounts[input.counterAccountId] : undefined
      if (!counterAccount) {
        throw new Error('Select which account this cheque is against.')
      }
      if (input.type === 'cheque_issued') {
        postLedger('manual', counterAccount.id, input.amount, 0, description)
        postLedger('manual', bankAccount.chartAccountId, 0, input.amount, description)
      } else {
        postLedger('manual', bankAccount.chartAccountId, input.amount, 0, description)
        postLedger('manual', counterAccount.id, 0, input.amount, description)
      }
      record.counterAccountId = counterAccount.id
      record.counterAccountName = counterAccount.name
    }

    updates[`bankTransactions/${id}`] = record

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'bank_transaction_recorded',
      'finance',
      `Recorded a ${input.type.replace(/_/g, ' ')} of ${input.amount} on ${bankLabel}.`
    )
    return id
  }

  // ---- Rate Card / Costing Sheet -----------------------------------------
  // See the RateCardRecord comment in types.ts for what each derived total
  // means; this is the one place those formulas are computed so the saved
  // record, the list screen, and every printed voucher all agree.
  function computeRateCardTotals(items: RateCardLineItem[]) {
    const rawRateTotal = items.reduce((sum, item) => sum + item.qty * item.rawRate, 0)
    const manufRateTotal = items.reduce((sum, item) => sum + item.qty * item.manufRate, 0)
    const depotRateTotal = items.reduce((sum, item) => sum + item.qty * item.depotRate, 0)
    const dealerRateTotal = items.reduce((sum, item) => sum + item.qty * item.dealerRate, 0)
    const tpRateTotal = items.reduce((sum, item) => sum + item.qty * (item.tpRate ?? 0), 0)
    const mrpRateTotal = items.reduce((sum, item) => sum + item.qty * (item.mrpRate ?? 0), 0)
    const pouchCartonAmount = manufRateTotal - rawRateTotal
    const usableMoney = depotRateTotal - manufRateTotal
    const usableUDepot = dealerRateTotal - manufRateTotal

    return {
      rawRateTotal,
      manufRateTotal,
      depotRateTotal,
      dealerRateTotal,
      tpRateTotal,
      mrpRateTotal,
      pouchCartonAmount,
      usableMoney,
      usableMoneyPercent: dealerRateTotal ? (usableMoney / dealerRateTotal) * 100 : 0,
      usableUDepot,
      usableUDepotPercent: dealerRateTotal ? (usableUDepot / dealerRateTotal) * 100 : 0,
    }
  }

  async function saveRateCard(input: RateCardInput, rateCardId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const invoiceNo = input.invoiceNo.trim()
    if (!invoiceNo) {
      throw new Error('Invoice number is required.')
    }
    if (!input.recipientName.trim()) {
      throw new Error('Recipient name is required.')
    }
    // Firebase's update()/set() reject `undefined` anywhere in the payload
    // (unlike a plain JS object), so the optional productId/perCtnBgs are
    // included only when they actually have a value rather than spread from
    // the input as-is.
    const items = input.items
      .filter((item) => item.productName.trim())
      .map((item) => ({
        ...(item.productId ? { productId: item.productId } : {}),
        productName: item.productName.trim(),
        qty: Number(item.qty) || 0,
        rawRate: Number(item.rawRate) || 0,
        manufRate: Number(item.manufRate) || 0,
        depotRate: Number(item.depotRate) || 0,
        dealerRate: Number(item.dealerRate) || 0,
        tpRate: Number(item.tpRate) || 0,
        mrpRate: Number(item.mrpRate) || 0,
        ...(item.perCtnBgs?.trim() ? { perCtnBgs: item.perCtnBgs.trim() } : {}),
      }))
    if (items.length === 0) {
      throw new Error('Add at least one product line.')
    }

    const existing = rateCardId ? data.rateCards[rateCardId] : null
    const db = getDatabaseOrThrow()
    const id = existing?.id ?? createId('ratecard')
    const now = new Date().toISOString()
    const totals = computeRateCardTotals(items)
    const previousDue = Number(input.previousDue) || 0
    const damage = Number(input.damage) || 0
    const routeDiscount = Number(input.routeDiscount) || 0
    const targetIncentive = Number(input.targetIncentive) || 0
    const rateCard: RateCardRecord = {
      id,
      invoiceNo,
      recipientName: input.recipientName.trim(),
      date: input.date,
      deliveryDate: input.deliveryDate?.trim() ?? '',
      dealerCustomerId: input.dealerCustomerId ?? '',
      depotName: input.depotName?.trim() ?? '',
      depotAddress: input.depotAddress?.trim() ?? '',
      depotMobile: input.depotMobile?.trim() ?? '',
      depotHelpline: input.depotHelpline?.trim() ?? '',
      previousDue,
      damage,
      routeDiscount,
      targetIncentive,
      items,
      remarks: input.remarks?.trim() ?? '',
      ...totals,
      depotReceivable: totals.dealerRateTotal + previousDue - damage - routeDiscount - targetIncentive,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/rateCards'), { [id]: rateCard })
    await writeActivity(
      existing ? 'ratecard_updated' : 'ratecard_created',
      'sales',
      `${existing ? 'Updated' : 'Created'} rate card ${invoiceNo} for ${rateCard.recipientName}.`
    )

    return id
  }

  async function deleteRateCard(rateCardId: string) {
    if (!data) {
      return
    }

    const rateCard = data.rateCards[rateCardId]
    if (!rateCard) {
      throw new Error('Rate card not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`rateCards/${rateCardId}`]: null })
    await writeActivity('ratecard_deleted', 'sales', `Deleted rate card ${rateCard.invoiceNo}.`)
  }

  const value = useMemo<ERPContextValue>(
    () => ({
      data,
      loading,
      error,
      users,
      currentUser,
      currentPermissions,
      login,
      logout,
      createUser,
      updateUser,
      deleteUser,
      sendPasswordReset,
      hasPermission: (permission) => hasPermissionCheck(data, currentUser, permission),
      saveRole,
      deleteRole,
      saveProduct,
      deleteProduct,
      createStockAdjustmentRequest,
      approveStockAdjustment,
      rejectStockAdjustment,
      createStockCount,
      saveCustomer,
      deleteCustomer,
      createSalesReturn,
      recordCollection,
      releaseQcHold,
      scrapQcHold,
      createOrder,
      updateOrder,
      cancelOrder,
      updateOrderStatus,
      updateOrderApproval,
      markNotificationRead,
      markAllNotificationsRead,
      saveExpense,
      updateExpenseApproval,
      saveInvestor,
      deleteExpense,
      saveBudget,
      deleteBudget,
      saveSalesTarget,
      deleteSalesTarget,
      saveCommissionRule,
      deleteCommissionRule,
      recordCommissionPayout,
      saveChartOfAccount,
      deleteChartOfAccount,
      seedStandardChartOfAccounts,
      createJournalEntry,
      reverseJournalEntry,
      saveBankAccount,
      deleteBankAccount,
      recordBankTransaction,
      saveRateCard,
      deleteRateCard,
      saveSettings,
    }),
    [currentPermissions, currentUser, data, error, loading, users]
  )

  return <ERPContext.Provider value={value}>{children}</ERPContext.Provider>
}

export function useERP() {
  const context = useContext(ERPContext)

  if (!context) {
    throw new Error('useERP must be used inside ERPProvider.')
  }

  return context
}

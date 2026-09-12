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
  CashMaintenanceInput,
  CashMaintenanceRecord,
  ChartOfAccountInput,
  ChartOfAccountRecord,
  CollectionInput,
  CollectionRecord,
  CommissionPayoutInput,
  CommissionPayoutRecord,
  CommissionRuleInput,
  CommissionRuleRecord,
  DealerCategoryInput,
  DealerCategoryRecord,
  DealerInput,
  DealerRecord,
  DepotInput,
  DepotRecord,
  DiscountProductInput,
  DiscountProductRecord,
  ERPData,
  ExpenseApprovalStatus,
  ExpenseInput,
  ExpenseRecord,
  InvestorInput,
  InvestorRecord,
  JournalEntryInput,
  JournalEntryLine,
  JournalEntryRecord,
  LedgerAccount,
  LedgerEntryRecord,
  LoanAccountInput,
  LoanAccountRecord,
  LoanTransactionInput,
  LoanTransactionRecord,
  LoginHistoryRecord,
  OrderInput,
  OrderItem,
  OrderItemBatchAllocation,
  OrderRecord,
  FinishedGoodsInput,
  FinishedGoodsRecord,
  ProductInput,
  ProductionBatchInput,
  ProductionBatchRecord,
  ProductionOutputLine,
  ProductRecord,
  StockShortfallRecord,
  ProductReturnInput,
  ProductReturnRecord,
  PurchaseInput,
  PurchaseItem,
  PurchaseMaterialInput,
  PurchaseMaterialRecord,
  PurchaseRecord,
  QcHoldRecord,
  QualityCheckInput,
  QualityCheckRecord,
  RateCardInput,
  RateCardLineItem,
  RateCardRecord,
  SaleType,
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
  VendorInput,
  VendorPaymentInput,
  VendorPaymentRecord,
  VendorRecord,
  MaterialUsageInput,
  MaterialUsageRecord,
} from '@/lib/erp/types'
import {
  CASH_CATEGORY_GOODS_PURCHASE,
  CASH_CATEGORY_NEW_MARKET_INVESTMENT,
  CASH_CATEGORY_PACKAGING_PURCHASE,
  DIRECT_EXPENSE_CATEGORY,
  EXPENSE_CATEGORY_LEDGER_ACCOUNT,
  EXPENSE_LOAN_REPAYMENT_CATEGORY,
  EXPENSE_SALARY_CATEGORY,
  STANDARD_CHART_OF_ACCOUNTS,
} from '@/lib/erp/standardChartOfAccounts'
import {
  createId,
  getPermissions,
  getProductStatus,
  hasPermission as hasPermissionCheck,
  parsePerCtnMultiplier,
  saleTypeLabel,
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
  saveDealer: (input: DealerInput, dealerId?: string) => Promise<string>
  deleteDealer: (dealerId: string) => Promise<void>
  saveDealerCategory: (input: DealerCategoryInput, categoryId?: string) => Promise<string>
  deleteDealerCategory: (categoryId: string) => Promise<void>
  saveDepot: (input: DepotInput, depotId?: string) => Promise<string>
  deleteDepot: (depotId: string) => Promise<void>
  saveLoanAccount: (input: LoanAccountInput, loanAccountId?: string) => Promise<string>
  deleteLoanAccount: (loanAccountId: string) => Promise<void>
  saveLoanTransaction: (input: LoanTransactionInput, transactionId?: string) => Promise<string>
  deleteLoanTransaction: (transactionId: string) => Promise<void>
  saveCashMaintenance: (input: CashMaintenanceInput, recordId?: string) => Promise<string>
  deleteCashMaintenance: (recordId: string) => Promise<void>
  saveProduct: (input: ProductInput, productId?: string) => Promise<string>
  deleteProduct: (productId: string) => Promise<void>
  saveDiscountProduct: (input: DiscountProductInput, productId?: string) => Promise<string>
  deleteDiscountProduct: (productId: string) => Promise<void>
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
  deleteInvestor: (investorId: string) => Promise<void>
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
  classifyRateCardSaleType: (rateCardId: string, saleType: SaleType) => Promise<void>
  createProductReturn: (input: ProductReturnInput) => Promise<string>
  updateProductReturn: (productReturnId: string, input: ProductReturnInput) => Promise<void>
  deleteProductReturn: (productReturnId: string) => Promise<void>
  recalculateProductReturnExpenses: () => Promise<number>
  saveVendor: (input: VendorInput, vendorId?: string) => Promise<string>
  deleteVendor: (vendorId: string) => Promise<void>
  savePurchaseMaterial: (input: PurchaseMaterialInput, materialId?: string) => Promise<string>
  deletePurchaseMaterial: (materialId: string) => Promise<void>
  createPurchase: (input: PurchaseInput) => Promise<string>
  deletePurchase: (purchaseId: string) => Promise<void>
  recordVendorPayment: (input: VendorPaymentInput) => Promise<string>
  createMaterialUsage: (input: MaterialUsageInput) => Promise<string>
  deleteMaterialUsage: (materialUsageId: string) => Promise<void>
  saveFinishedGoods: (input: FinishedGoodsInput, finishedGoodsId?: string) => Promise<string>
  deleteFinishedGoods: (finishedGoodsId: string) => Promise<void>
  createProductionBatch: (input: ProductionBatchInput) => Promise<string>
  deleteProductionBatch: (productionBatchId: string) => Promise<void>
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
  'dealers',
  'dealerCategories',
  'depots',
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
  'productReturns',
  'qualityChecks',
  'qcHolds',
  'notifications',
  'activities',
  'loginHistory',
  'expenses',
  'loanAccounts',
  'loanTransactions',
  'cashMaintenance',
  'budgets',
  'salesTargets',
  'commissionRules',
  'commissionPayouts',
  'investors',
  'discountProducts',
  'vendors',
  'purchaseMaterials',
  'purchases',
  'vendorPayments',
  'materialUsages',
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

function normalizeDealerRecord(dealer: DealerRecord): DealerRecord {
  const now = new Date().toISOString()

  return {
    ...dealer,
    phone: dealer.phone || '',
    proprietorName: dealer.proprietorName || '',
    address: dealer.address || '',
    categoryId: dealer.categoryId || '',
    depotId: dealer.depotId || '',
    createdAt: dealer.createdAt || now,
    updatedAt: dealer.updatedAt || dealer.createdAt || now,
  }
}

function normalizeDealerMap(dealers?: Record<string, DealerRecord> | null) {
  return Object.fromEntries(
    Object.entries(dealers ?? {}).map(([id, dealer]) => [id, normalizeDealerRecord(dealer)])
  )
}

function normalizeDealerCategoryRecord(category: DealerCategoryRecord): DealerCategoryRecord {
  const now = new Date().toISOString()

  return {
    ...category,
    name: category.name || '',
    createdAt: category.createdAt || now,
    updatedAt: category.updatedAt || category.createdAt || now,
  }
}

function normalizeDealerCategoryMap(categories?: Record<string, DealerCategoryRecord> | null) {
  return Object.fromEntries(
    Object.entries(categories ?? {}).map(([id, category]) => [id, normalizeDealerCategoryRecord(category)])
  )
}

function normalizeDepotRecord(depot: DepotRecord): DepotRecord {
  const now = new Date().toISOString()

  return {
    ...depot,
    phone: depot.phone || '',
    proprietorName: depot.proprietorName || '',
    address: depot.address || '',
    createdAt: depot.createdAt || now,
    updatedAt: depot.updatedAt || depot.createdAt || now,
  }
}

function normalizeDepotMap(depots?: Record<string, DepotRecord> | null) {
  return Object.fromEntries(
    Object.entries(depots ?? {}).map(([id, depot]) => [id, normalizeDepotRecord(depot)])
  )
}

function normalizeDiscountProductRecord(product: DiscountProductRecord): DiscountProductRecord {
  const now = new Date().toISOString()

  return {
    ...product,
    banglaName: product.banglaName || '',
    category: product.category || '',
    perCtnBgs: product.perCtnBgs || '',
    rawRate: Number(product.rawRate ?? 0),
    manufRate: Number(product.manufRate ?? 0),
    depotRate: Number(product.depotRate ?? 0),
    dealerRate: Number(product.dealerRate ?? 0),
    srCommissionPercent: Number(product.srCommissionPercent ?? 8),
    tpPercent: Number(product.tpPercent ?? 0),
    mrpRate: Number(product.mrpRate ?? 0),
    isActive: product.isActive ?? true,
    createdAt: product.createdAt || now,
    updatedAt: product.updatedAt || product.createdAt || now,
  }
}

function normalizeDiscountProductMap(products?: Record<string, DiscountProductRecord> | null) {
  return Object.fromEntries(
    Object.entries(products ?? {}).map(([id, product]) => [id, normalizeDiscountProductRecord(product)])
  )
}

// Fills in returnParty/item.unit for a ProductReturnRecord saved before this
// chunk (against an invoice, with no such fields) so it still renders
// correctly — a record with dealerId set cascaded through the Dealer leg,
// everything else defaults to the Depot leg.
function normalizeProductReturnRecord(entry: ProductReturnRecord): ProductReturnRecord {
  return {
    ...entry,
    returnParty: entry.returnParty ?? (entry.dealerId ? 'dealer' : 'depot'),
    items: entry.items.map((item) => ({ ...item, unit: item.unit ?? 'pcs' })),
  }
}

function normalizeProductReturnMap(entries?: Record<string, ProductReturnRecord> | null) {
  return Object.fromEntries(
    Object.entries(entries ?? {}).map(([id, entry]) => [id, normalizeProductReturnRecord(entry)])
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

// A stray record from the earlier, differently-shaped Purchase Department
// (deleted before this version existed — see the Purchase Section comment
// below) can still sit in the live DB missing fields this shape requires,
// e.g. no `items` array or no `date` — left ungarded that crashes the whole
// page the moment page.tsx does `purchase.items.map(...)` or
// `formatDate(purchase.date)`. Sanitize once here instead of guarding every
// call site.
function normalizePurchaseRecord(purchase: PurchaseRecord): PurchaseRecord {
  const now = new Date().toISOString()

  return {
    ...purchase,
    vendorName: purchase.vendorName || '',
    date: purchase.date || purchase.createdAt || now,
    items: Array.isArray(purchase.items) ? purchase.items : [],
    totalAmount: Number(purchase.totalAmount ?? 0),
    paid: Number(purchase.paid ?? 0),
    due: Number(purchase.due ?? 0),
    createdAt: purchase.createdAt || now,
  }
}

function normalizePurchaseMap(purchases?: Record<string, PurchaseRecord> | null) {
  return Object.fromEntries(
    Object.entries(purchases ?? {}).map(([id, purchase]) => [id, normalizePurchaseRecord(purchase)])
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
// balanced Dr/Cr entry set — Dr Dealer / Cr Sales (+ Cr VAT payable),
// Dr COGS / Cr Inventory for the finished-goods stock decrease, and
// Dr Cash / Cr Dealer for whatever was collected on the spot.
function buildInvoiceLedgerEntries(params: {
  orderId: string
  billNumber: string
  date: string
  dealerId: string
  netSales: number
  vat: number
  cogs: number
  total: number
  paid: number
}): Record<string, LedgerEntryRecord> {
  const { orderId, billNumber, date, dealerId, netSales, vat, cogs, total, paid } = params
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

  post('dealer', dealerId, total, 0, `Invoice ${billNumber}`)
  post('sales', undefined, 0, netSales, `Invoice ${billNumber}`)
  post('vat_payable', undefined, 0, vat, `VAT on ${billNumber}`)
  post('cogs', undefined, cogs, 0, `COGS for ${billNumber}`)
  post('inventory', undefined, 0, cogs, `Finished goods issued for ${billNumber}`)
  post('cash', undefined, paid, 0, `Collection against ${billNumber}`)
  if (paid > 0) {
    post('dealer', dealerId, 0, paid, `Collection against ${billNumber}`)
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

// Purchase cash-flow posting (2026-09-12 client request): the cash actually
// paid out on a purchase — its own `paid` at save time, and any later
// VendorPaymentRecord paydown of the due — auto-posts a CashMaintenanceRecord
// so it shows up on the Loan & Cash Maintenance reconciliation, split
// proportionally across পণ্য ক্রয় ("goods") / প্যাকেজিং মেটেরিয়ালস ক্রয়
// ("packaging") by how much of the purchase's own line items were raw vs
// packaging material — a purchase mixing both categories gets one entry per
// category instead of misclassifying the whole payment as one or the other.
function buildPurchaseCashEntries(
  items: PurchaseItem[],
  amount: number,
  date: string,
  note: string,
  currentUser: { id: string; name: string }
): Record<string, CashMaintenanceRecord> {
  if (amount <= 0) {
    return {}
  }

  const rawTotal = items.filter((item) => item.category === 'raw_material').reduce((sum, item) => sum + item.amount, 0)
  const packagingTotal = items
    .filter((item) => item.category === 'packaging_material')
    .reduce((sum, item) => sum + item.amount, 0)
  const grandTotal = rawTotal + packagingTotal
  const rawShare = grandTotal > 0 ? rawTotal / grandTotal : 1
  const rawAmount = amount * rawShare
  const packagingAmount = amount - rawAmount

  const now = new Date().toISOString()
  const entries: Record<string, CashMaintenanceRecord> = {}
  if (rawAmount > 0) {
    const id = createId('cash_maintenance')
    entries[id] = {
      id,
      category: CASH_CATEGORY_GOODS_PURCHASE,
      amount: rawAmount,
      date,
      note,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: now,
    }
  }
  if (packagingAmount > 0) {
    const id = createId('cash_maintenance')
    entries[id] = {
      id,
      category: CASH_CATEGORY_PACKAGING_PURCHASE,
      amount: packagingAmount,
      date,
      note,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: now,
    }
  }
  return entries
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
    dealers: normalizeDealerMap(source.dealers),
    dealerCategories: normalizeDealerCategoryMap(source.dealerCategories),
    depots: normalizeDepotMap(source.depots),
    products: normalizeProductMap(source.products),
    discountProducts: normalizeDiscountProductMap(source.discountProducts),
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
    productReturns: normalizeProductReturnMap(source.productReturns),
    vendors: source.vendors ?? {},
    purchaseMaterials: source.purchaseMaterials ?? {},
    purchases: normalizePurchaseMap(source.purchases),
    vendorPayments: source.vendorPayments ?? {},
    materialUsages: source.materialUsages ?? {},
    finishedGoods: source.finishedGoods ?? {},
    stockShortfalls: source.stockShortfalls ?? {},
    productionBatches: source.productionBatches ?? {},
    qualityChecks: source.qualityChecks ?? {},
    qcHolds: source.qcHolds ?? {},
    notifications: source.notifications ?? {},
    activities: source.activities ?? {},
    loginHistory: source.loginHistory ?? {},
    expenses: normalizeExpenseMap(source.expenses),
    loanAccounts: source.loanAccounts ?? {},
    loanTransactions: source.loanTransactions ?? {},
    cashMaintenance: source.cashMaintenance ?? {},
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
    packSize: input.packSize.trim(),
    weight: Math.max(input.weight ?? 0, 0),
    purchasePrice: input.purchasePrice,
    sellingPrice: input.sellingPrice,
    wholesalePrice: input.wholesalePrice ?? input.sellingPrice,
    mrp: Math.max(input.mrp ?? 0, 0),
    dealerPrice: Math.max(input.dealerPrice ?? 0, 0),
    distributorPrice: Math.max(input.distributorPrice ?? 0, 0),
    minSellingPrice: Math.max(input.minSellingPrice ?? 0, 0),
    rawRate: Math.max(input.rawRate ?? 0, 0),
    manufRate: Math.max(input.manufRate ?? 0, 0),
    depotRate: Math.max(input.depotRate ?? 0, 0),
    dealerRate: Math.max(input.dealerRate ?? 0, 0),
    tpRate: Math.max(input.tpRate ?? 0, 0),
    mrpRate: Math.max(input.mrpRate ?? 0, 0),
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

function normalizeDealerInput(input: DealerInput) {
  return {
    name: input.name.trim(),
    proprietorName: input.proprietorName?.trim() ?? '',
    address: input.address?.trim() ?? '',
    phone: input.phone.trim(),
    categoryId: input.categoryId?.trim() ?? '',
    depotId: input.depotId?.trim() ?? '',
  }
}

function normalizeDealerCategoryInput(input: DealerCategoryInput) {
  return {
    name: input.name.trim(),
  }
}

function normalizeDepotInput(input: DepotInput) {
  return {
    name: input.name.trim(),
    proprietorName: input.proprietorName?.trim() ?? '',
    address: input.address?.trim() ?? '',
    phone: input.phone?.trim() ?? '',
  }
}

function normalizeVendorInput(input: VendorInput) {
  return {
    name: input.name.trim(),
    proprietorName: input.proprietorName?.trim() ?? '',
    address: input.address?.trim() ?? '',
    phone: input.phone?.trim() ?? '',
  }
}

function normalizeLoanAccountInput(input: LoanAccountInput) {
  return {
    memberName: input.memberName.trim(),
    phone: input.phone?.trim() ?? '',
    address: input.address?.trim() ?? '',
  }
}

function normalizeLoanTransactionInput(input: LoanTransactionInput) {
  return {
    loanAccountId: input.loanAccountId.trim(),
    type: input.type,
    amount: Math.max(input.amount ?? 0, 0),
    date: input.date?.trim() || new Date().toISOString().slice(0, 10),
    note: input.note?.trim() ?? '',
  }
}

function normalizeCashMaintenanceInput(input: CashMaintenanceInput) {
  return {
    category: input.category.trim(),
    amount: Math.max(input.amount ?? 0, 0),
    date: input.date?.trim() || new Date().toISOString().slice(0, 10),
    note: input.note?.trim() ?? '',
  }
}

function normalizeDiscountProductInput(input: DiscountProductInput) {
  return {
    name: input.name.trim(),
    banglaName: input.banglaName?.trim() ?? '',
    category: input.category?.trim() ?? '',
    perCtnBgs: input.perCtnBgs?.trim() ?? '',
    rawRate: Math.max(input.rawRate ?? 0, 0),
    manufRate: Math.max(input.manufRate ?? 0, 0),
    depotRate: Math.max(input.depotRate ?? 0, 0),
    dealerRate: Math.max(input.dealerRate ?? 0, 0),
    srCommissionPercent: Math.max(input.srCommissionPercent ?? 8, 0),
    tpPercent: Math.max(input.tpPercent ?? 0, 0),
    mrpRate: Math.max(input.mrpRate ?? 0, 0),
    isActive: input.isActive ?? true,
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
        // (orders/dealers/ledgerEntries/products/...) whose listeners each
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
        (error) => {
          // RTDB cancels a listener outright on permission_denied — it never
          // retries on its own, even after the rules that caused it are
          // fixed, so a bad ".read" rule silently freezes this collection at
          // null for the rest of the session (looks like "no data" in the
          // UI) until the page is reloaded and the listener re-attaches.
          // Logging it is the only way to tell that apart from "really
          // empty".
          console.error(`[erp] listener for "erp/${key}" was denied/cancelled:`, error)
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
          `${order.dealerName}'s payment of ${order.due} for ${order.billNumber} is past the due date.`,
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

    if (!normalized.packSize) {
      throw new Error('Carton size is required.')
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

  async function saveDealer(input: DealerInput, dealerId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const existingDealer = dealerId ? data.dealers[dealerId] : null
    const normalized = normalizeDealerInput(input)

    if (!normalized.name) {
      throw new Error('Dealer name is required.')
    }

    if (!normalized.phone) {
      throw new Error('Dealer phone number is required.')
    }

    const db = getDatabaseOrThrow()
    const id = existingDealer?.id ?? createId('dealer')
    const now = new Date().toISOString()
    const dealer = {
      id,
      ...normalized,
      createdAt: existingDealer?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/dealers'), { [id]: dealer })
    await writeActivity(
      existingDealer ? 'dealer_updated' : 'dealer_created',
      'dealers',
      existingDealer ? `Updated ${dealer.name} dealer details.` : `Added dealer ${dealer.name}.`
    )

    return id
  }

  async function deleteDealer(dealerId: string) {
    if (!data) {
      return
    }

    const dealer = data.dealers[dealerId]
    if (!dealer) {
      throw new Error('Dealer not found.')
    }

    const hasOrders = Object.values(data.orders).some((order) => order.dealerId === dealerId)
    if (hasOrders) {
      throw new Error('Dealers with purchase history cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`dealers/${dealerId}`]: null,
    })
    await writeActivity('dealer_deleted', 'dealers', `Deleted dealer ${dealer.name}.`)
  }

  async function saveDealerCategory(input: DealerCategoryInput, categoryId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const existingCategory = categoryId ? data.dealerCategories[categoryId] : null
    const normalized = normalizeDealerCategoryInput(input)

    if (!normalized.name) {
      throw new Error('Category name is required.')
    }

    const db = getDatabaseOrThrow()
    const id = existingCategory?.id ?? createId('dealer_category')
    const now = new Date().toISOString()
    const category = {
      id,
      ...normalized,
      createdAt: existingCategory?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/dealerCategories'), { [id]: category })
    await writeActivity(
      existingCategory ? 'dealer_category_updated' : 'dealer_category_created',
      'dealers',
      existingCategory ? `Updated dealer category ${category.name}.` : `Added dealer category ${category.name}.`
    )

    return id
  }

  async function deleteDealerCategory(categoryId: string) {
    if (!data) {
      return
    }

    const category = data.dealerCategories[categoryId]
    if (!category) {
      throw new Error('Dealer category not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`dealerCategories/${categoryId}`]: null,
    })
    await writeActivity('dealer_category_deleted', 'dealers', `Deleted dealer category ${category.name}.`)
  }

  // A depot is the middle party in the Company → Depot → Dealer chain —
  // mirrors saveDealer/deleteDealer above. Deleting one is blocked while any
  // dealer still links to it (see deleteDepot below), the same guard
  // deleteDealer uses against a dealer's own order history.
  async function saveDepot(input: DepotInput, depotId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const existingDepot = depotId ? data.depots[depotId] : null
    const normalized = normalizeDepotInput(input)

    if (!normalized.name) {
      throw new Error('Depot name is required.')
    }

    // Phone is not required here (unlike saveDealer) — the Dealer edit
    // dialog lets someone type a brand-new depot name inline with nothing
    // else on hand; phone/address can be filled in later from Depot List.
    const db = getDatabaseOrThrow()
    const id = existingDepot?.id ?? createId('depot')
    const now = new Date().toISOString()
    const depot = {
      id,
      ...normalized,
      createdAt: existingDepot?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/depots'), { [id]: depot })
    await writeActivity(
      existingDepot ? 'depot_updated' : 'depot_created',
      'dealers',
      existingDepot ? `Updated ${depot.name} depot details.` : `Added depot ${depot.name}.`
    )

    return id
  }

  async function deleteDepot(depotId: string) {
    if (!data) {
      return
    }

    const depot = data.depots[depotId]
    if (!depot) {
      throw new Error('Depot not found.')
    }

    const hasDealers = Object.values(data.dealers).some((dealer) => dealer.depotId === depotId)
    if (hasDealers) {
      throw new Error('Depots with dealers linked to them cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`depots/${depotId}`]: null,
    })
    await writeActivity('depot_deleted', 'dealers', `Deleted depot ${depot.name}.`)
  }

  // ---- Purchase Section (procurement from vendors) ------------------------
  // A vendor is who materials are bought from — mirrors saveDealer/saveDepot
  // above. Deleting one is blocked while any purchase is on file against it,
  // same guard deleteDepot uses against a linked dealer.
  async function saveVendor(input: VendorInput, vendorId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const existingVendor = vendorId ? data.vendors[vendorId] : null
    const normalized = normalizeVendorInput(input)

    if (!normalized.name) {
      throw new Error('Vendor name is required.')
    }

    const db = getDatabaseOrThrow()
    const id = existingVendor?.id ?? createId('vendor')
    const now = new Date().toISOString()
    const vendor = {
      id,
      ...normalized,
      createdAt: existingVendor?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/vendors'), { [id]: vendor })
    await writeActivity(
      existingVendor ? 'vendor_updated' : 'vendor_created',
      'purchase',
      existingVendor ? `Updated ${vendor.name} vendor details.` : `Added vendor ${vendor.name}.`
    )

    return id
  }

  async function deleteVendor(vendorId: string) {
    if (!data) {
      return
    }

    const vendor = data.vendors[vendorId]
    if (!vendor) {
      throw new Error('Vendor not found.')
    }

    const hasPurchases = Object.values(data.purchases).some((purchase) => purchase.vendorId === vendorId)
    if (hasPurchases) {
      throw new Error('Vendors with purchases on file cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`vendors/${vendorId}`]: null,
    })
    await writeActivity('vendor_deleted', 'purchase', `Deleted vendor ${vendor.name}.`)
  }

  // A material/packaging item on the Purchase stock master list — see
  // PurchaseMaterialRecord in types.ts. Deleting one is blocked once it has
  // any purchase or usage history, same reasoning as deleteVendor above.
  async function savePurchaseMaterial(input: PurchaseMaterialInput, materialId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const existing = materialId ? data.purchaseMaterials[materialId] : null
    const name = input.name.trim()
    if (!name) {
      throw new Error('Material name is required.')
    }

    const unitWeightGrams = Number(input.unitWeightGrams)
    const capacityPerUnit = Number(input.capacityPerUnit)

    const db = getDatabaseOrThrow()
    const id = existing?.id ?? createId('material')
    const now = new Date().toISOString()
    const material: PurchaseMaterialRecord = {
      id,
      name,
      category: input.category,
      unit: input.unit,
      stockQty: Number(input.stockQty) || 0,
      minStock: Number(input.minStock) || 0,
      ...(input.category === 'packaging_material' && input.packagingType ? { packagingType: input.packagingType } : {}),
      ...(input.unit === 'kg' && unitWeightGrams > 0 ? { unitWeightGrams } : {}),
      ...(input.unit === 'pcs' && capacityPerUnit > 0 ? { capacityPerUnit } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/purchaseMaterials'), { [id]: material })
    await writeActivity(
      existing ? 'purchase_material_updated' : 'purchase_material_created',
      'purchase',
      existing ? `Updated material ${material.name}.` : `Added material ${material.name} to Purchase stock.`
    )

    if (material.stockQty <= material.minStock) {
      await writeNotification(
        'Material low stock alert',
        `${material.name} is at or below its minimum stock (${material.stockQty} ${material.unit}/${material.minStock} ${material.unit}) — consider purchasing more.`,
        'warning',
        ['super_admin', 'manager', 'warehouse_manager', 'production_manager']
      )
    }

    return id
  }

  async function deletePurchaseMaterial(materialId: string) {
    if (!data) {
      return
    }

    const material = data.purchaseMaterials[materialId]
    if (!material) {
      throw new Error('Material not found.')
    }

    const isReferenced =
      Object.values(data.purchases).some((purchase) => purchase.items.some((item) => item.materialId === materialId)) ||
      Object.values(data.materialUsages).some((usage) => usage.materialId === materialId)
    if (isReferenced) {
      throw new Error('Materials with purchase or usage history cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`purchaseMaterials/${materialId}`]: null,
    })
    await writeActivity('purchase_material_deleted', 'purchase', `Deleted material ${material.name}.`)
  }

  // One procurement transaction — adds to each line's material stock,
  // opens (or fully settles) that much due against the vendor, and posts
  // whatever was actually paid to the Cash Maintenance chart (see
  // buildPurchaseCashEntries). See the PurchaseRecord comment in types.ts
  // for why this still never touches the full ledger/Automatic Accounting
  // Engine.
  async function createPurchase(input: PurchaseInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording a purchase.')
    }
    if (!input.items.length) {
      throw new Error('Add at least one material to the purchase.')
    }

    const vendor = input.vendorId ? data.vendors[input.vendorId] : undefined
    if (input.vendorId && !vendor) {
      throw new Error('Vendor not found.')
    }
    const vendorName = (vendor?.name || input.vendorName?.trim() || '').trim()
    if (!vendorName) {
      throw new Error('Pick or type the vendor this purchase is from.')
    }

    const items: PurchaseItem[] = input.items.map((requested) => {
      const name = requested.materialName.trim()
      if (!name) {
        throw new Error('Every purchase line needs a material.')
      }
      const qty = Number(requested.qty) || 0
      if (qty <= 0) {
        throw new Error(`Quantity for ${name} must be greater than zero.`)
      }
      const rate = Number(requested.rate) || 0
      if (rate < 0) {
        throw new Error(`Rate for ${name} cannot be negative.`)
      }
      const material = requested.materialId ? data.purchaseMaterials[requested.materialId] : undefined
      return {
        ...(requested.materialId ? { materialId: requested.materialId } : {}),
        materialName: material?.name ?? name,
        category: material?.category ?? 'raw_material',
        unit: material?.unit ?? 'kg',
        qty,
        rate,
        amount: qty * rate,
      }
    })

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)
    const paid = Math.min(Math.max(Number(input.paid) || 0, 0), totalAmount)
    const due = totalAmount - paid

    const db = getDatabaseOrThrow()
    const id = createId('purchase')
    const now = new Date().toISOString()
    const date = input.date?.trim() || now.slice(0, 10)
    const purchaseNumber = `PUR-${Date.now().toString().slice(-8)}`

    const cashEntries = buildPurchaseCashEntries(
      items,
      paid,
      date,
      `Purchase ${purchaseNumber} — ${vendorName}`,
      currentUser
    )
    const cashMaintenanceIds = Object.keys(cashEntries)

    const purchase: PurchaseRecord = {
      id,
      purchaseNumber,
      ...(vendor ? { vendorId: vendor.id } : {}),
      vendorName,
      date,
      items,
      totalAmount,
      paid,
      due,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      ...(cashMaintenanceIds.length ? { cashMaintenanceIds } : {}),
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: now,
    }

    const updates: Record<string, unknown> = { [`purchases/${id}`]: purchase }
    Object.entries(cashEntries).forEach(([entryId, entry]) => {
      updates[`cashMaintenance/${entryId}`] = entry
    })

    // Purchased qty adds straight onto each material's running stock — a
    // material can appear on more than one line (unlikely but not
    // disallowed), so deltas are summed before writing.
    const stockDeltas = new Map<string, number>()
    items.forEach((item) => {
      if (!item.materialId) return
      stockDeltas.set(item.materialId, (stockDeltas.get(item.materialId) ?? 0) + item.qty)
    })
    stockDeltas.forEach((delta, materialId) => {
      const material = data.purchaseMaterials[materialId]
      if (!material) return
      updates[`purchaseMaterials/${materialId}/stockQty`] = material.stockQty + delta
      updates[`purchaseMaterials/${materialId}/updatedAt`] = now
    })

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'purchase_created',
      'purchase',
      `Recorded purchase ${purchaseNumber} from ${vendorName} — ${totalAmount.toFixed(2)} total, ${paid.toFixed(2)} paid, ${due.toFixed(2)} due.`
    )

    return id
  }

  async function deletePurchase(purchaseId: string) {
    if (!data) {
      return
    }

    const purchase = data.purchases[purchaseId]
    if (!purchase) {
      throw new Error('Purchase not found.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = { [`purchases/${purchaseId}`]: null }

    // Reverse the stock this purchase added, same as it was added.
    const stockDeltas = new Map<string, number>()
    purchase.items.forEach((item) => {
      if (!item.materialId) return
      stockDeltas.set(item.materialId, (stockDeltas.get(item.materialId) ?? 0) + item.qty)
    })
    stockDeltas.forEach((delta, materialId) => {
      const material = data.purchaseMaterials[materialId]
      if (!material) return
      updates[`purchaseMaterials/${materialId}/stockQty`] = material.stockQty - delta
      updates[`purchaseMaterials/${materialId}/updatedAt`] = now
    })

    // Drop the Cash Maintenance entries this purchase's own `paid` posted.
    purchase.cashMaintenanceIds?.forEach((entryId) => {
      updates[`cashMaintenance/${entryId}`] = null
    })

    // A purchase with payments already recorded against it takes those down
    // with it too, same cascade-delete shape used elsewhere in this file —
    // including each payment's own Cash Maintenance entries.
    Object.values(data.vendorPayments)
      .filter((payment) => payment.purchaseId === purchaseId)
      .forEach((payment) => {
        updates[`vendorPayments/${payment.id}`] = null
        payment.cashMaintenanceIds?.forEach((entryId) => {
          updates[`cashMaintenance/${entryId}`] = null
        })
      })

    await update(ref(db, 'erp'), updates)
    await writeActivity('purchase_deleted', 'purchase', `Deleted purchase ${purchase.purchaseNumber}.`)
  }

  // A paydown against one purchase's due — mirrors recordCollection above,
  // just on the payable side.
  async function recordVendorPayment(input: VendorPaymentInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording a vendor payment.')
    }

    const purchase = data.purchases[input.purchaseId]
    if (!purchase) {
      throw new Error('Purchase not found.')
    }

    const amount = Number(input.amount) || 0
    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero.')
    }
    if (amount > purchase.due) {
      throw new Error('Payment amount cannot exceed the outstanding due.')
    }

    const db = getDatabaseOrThrow()
    const id = createId('vendorpay')
    const now = new Date().toISOString()
    const date = input.date?.trim() || now.slice(0, 10)
    const receiptNumber = `VPAY-${Date.now().toString().slice(-8)}`
    const nextDue = purchase.due - amount
    const nextPaid = purchase.paid + amount

    const cashEntries = buildPurchaseCashEntries(
      purchase.items,
      amount,
      date,
      `Vendor payment ${receiptNumber} — ${purchase.vendorName} (${purchase.purchaseNumber})`,
      currentUser
    )
    const cashMaintenanceIds = Object.keys(cashEntries)

    const payment: VendorPaymentRecord = {
      id,
      receiptNumber,
      purchaseId: purchase.id,
      purchaseNumber: purchase.purchaseNumber,
      ...(purchase.vendorId ? { vendorId: purchase.vendorId } : {}),
      vendorName: purchase.vendorName,
      amount,
      date,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      ...(cashMaintenanceIds.length ? { cashMaintenanceIds } : {}),
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: now,
    }

    const updates: Record<string, unknown> = {
      [`vendorPayments/${id}`]: payment,
      [`purchases/${purchase.id}/paid`]: nextPaid,
      [`purchases/${purchase.id}/due`]: nextDue,
    }
    Object.entries(cashEntries).forEach(([entryId, entry]) => {
      updates[`cashMaintenance/${entryId}`] = entry
    })

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'vendor_payment_recorded',
      'purchase',
      `Paid ${amount.toFixed(2)} to ${purchase.vendorName} against purchase ${purchase.purchaseNumber} — ${nextDue.toFixed(2)} still due.`
    )

    return id
  }

  // Stock going back out — production consuming material, or stock issued
  // out (spec points 2 & 3). Allowed to take stockQty negative rather than
  // block the entry — the point is to surface the shortage on the Materials
  // & Stock report, not to get in the way of logging what actually happened.
  async function createMaterialUsage(input: MaterialUsageInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before logging material usage.')
    }

    const material = data.purchaseMaterials[input.materialId]
    if (!material) {
      throw new Error('Material not found.')
    }

    const qty = Number(input.qty) || 0
    if (qty <= 0) {
      throw new Error('Usage quantity must be greater than zero.')
    }

    const db = getDatabaseOrThrow()
    const id = createId('usage')
    const now = new Date().toISOString()
    const date = input.date?.trim() || now.slice(0, 10)
    const nextStock = material.stockQty - qty

    const usage: MaterialUsageRecord = {
      id,
      materialId: material.id,
      materialName: material.name,
      category: material.category,
      unit: material.unit,
      qty,
      date,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: now,
    }

    await update(ref(db, 'erp'), {
      [`materialUsages/${id}`]: usage,
      [`purchaseMaterials/${material.id}/stockQty`]: nextStock,
      [`purchaseMaterials/${material.id}/updatedAt`]: now,
    })
    await writeActivity(
      'material_usage_recorded',
      'purchase',
      `Logged ${qty} ${material.unit} of ${material.name} used — ${nextStock} ${material.unit} left in stock.`
    )

    if (nextStock <= material.minStock) {
      await writeNotification(
        'Material low stock alert',
        `${material.name} is at or below its minimum stock (${nextStock} ${material.unit}/${material.minStock} ${material.unit}) — consider purchasing more.`,
        'warning',
        ['super_admin', 'manager', 'warehouse_manager', 'production_manager']
      )
    }

    return id
  }

  async function deleteMaterialUsage(materialUsageId: string) {
    if (!data) {
      return
    }

    const usage = data.materialUsages[materialUsageId]
    if (!usage) {
      throw new Error('Material usage entry not found.')
    }

    const material = data.purchaseMaterials[usage.materialId]
    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = { [`materialUsages/${materialUsageId}`]: null }

    if (material) {
      updates[`purchaseMaterials/${material.id}/stockQty`] = material.stockQty + usage.qty
      updates[`purchaseMaterials/${material.id}/updatedAt`] = now
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity('material_usage_deleted', 'purchase', `Deleted material usage entry for ${usage.materialName}.`)
  }

  // ---- Finished Goods (Production output) ---------------------------------
  // Its own list rather than the main Product List — a Finished Goods item
  // only ever comes out of a Production batch (see createProductionBatch
  // below) and is sold through Rate Card / Trade Sales invoicing via
  // RateCardLineItem.finishedGoodsId.
  async function saveFinishedGoods(input: FinishedGoodsInput, finishedGoodsId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const existing = finishedGoodsId ? data.finishedGoods[finishedGoodsId] : null
    const name = input.name.trim()
    if (!name) {
      throw new Error('Finished goods name is required.')
    }

    const rawMaterial = input.rawMaterialId ? data.purchaseMaterials[input.rawMaterialId] : undefined
    if (input.rawMaterialId && !rawMaterial) {
      throw new Error('Raw material not found.')
    }

    const db = getDatabaseOrThrow()
    const id = existing?.id ?? createId('finishedgoods')
    const now = new Date().toISOString()
    const record: FinishedGoodsRecord = {
      id,
      name,
      ...(rawMaterial ? { rawMaterialId: rawMaterial.id, rawMaterialName: rawMaterial.name } : {}),
      ...(input.packSize?.trim() ? { packSize: input.packSize.trim() } : {}),
      unitWeightKg: Math.max(Number(input.unitWeightKg) || 0, 0),
      stockQty: Number(input.stockQty) || 0,
      minStock: Number(input.minStock) || 0,
      rawRate: Math.max(Number(input.rawRate) || 0, 0),
      manufRate: Math.max(Number(input.manufRate) || 0, 0),
      depotRate: Math.max(Number(input.depotRate) || 0, 0),
      dealerRate: Math.max(Number(input.dealerRate) || 0, 0),
      tpRate: Math.max(Number(input.tpRate) || 0, 0),
      mrpRate: Math.max(Number(input.mrpRate) || 0, 0),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/finishedGoods'), { [id]: record })
    await writeActivity(
      existing ? 'finished_goods_updated' : 'finished_goods_created',
      'purchase',
      existing ? `Updated finished goods ${record.name}.` : `Added finished goods ${record.name}.`
    )

    return id
  }

  async function deleteFinishedGoods(finishedGoodsId: string) {
    if (!data) {
      return
    }

    const record = data.finishedGoods[finishedGoodsId]
    if (!record) {
      throw new Error('Finished goods item not found.')
    }

    const isReferenced =
      Object.values(data.productionBatches).some((batch) =>
        batch.outputs.some((output) => output.finishedGoodsId === finishedGoodsId)
      ) ||
      Object.values(data.rateCards).some((card) => card.items.some((item) => item.finishedGoodsId === finishedGoodsId))
    if (isReferenced) {
      throw new Error('Finished goods with production or invoice history cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`finishedGoods/${finishedGoodsId}`]: null })
    await writeActivity('finished_goods_deleted', 'purchase', `Deleted finished goods ${record.name}.`)
  }

  // ---- Production (Raw Material → Finished Goods) --------------------------
  // Raw material stock drops by the batch total (posted as a MaterialUsageRecord
  // too, so it shows on the Materials & Stock "Recent usage" log like any other
  // consumption — see the MaterialUsageRecord comment in types.ts), and every
  // output line's Finished Goods stock rises by its qtyProduced. Allowed to
  // take raw material stock negative rather than block the batch — same
  // reasoning as createMaterialUsage: surface the shortage, don't get in the
  // way of logging what actually happened on the floor.
  async function createProductionBatch(input: ProductionBatchInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording a production batch.')
    }
    if (!input.outputs.length) {
      throw new Error('Add at least one output pack size.')
    }

    const rawMaterial = data.purchaseMaterials[input.rawMaterialId]
    if (!rawMaterial) {
      throw new Error('Raw material not found.')
    }

    const outputs: ProductionOutputLine[] = input.outputs.map((requested) => {
      const finishedGoods = data.finishedGoods[requested.finishedGoodsId]
      if (!finishedGoods) {
        throw new Error('Finished goods item not found.')
      }
      const qtyProduced = Number(requested.qtyProduced) || 0
      if (qtyProduced <= 0) {
        throw new Error(`Quantity produced for ${finishedGoods.name} must be greater than zero.`)
      }
      const unitWeightKg = Math.max(Number(requested.unitWeightKg) || 0, 0)
      return {
        finishedGoodsId: finishedGoods.id,
        finishedGoodsName: finishedGoods.name,
        ...(finishedGoods.packSize ? { packSize: finishedGoods.packSize } : {}),
        qtyProduced,
        unitWeightKg,
        rawKgConsumed: qtyProduced * unitWeightKg,
      }
    })

    const rawKgConsumedTotal = outputs.reduce((sum, output) => sum + output.rawKgConsumed, 0)

    const db = getDatabaseOrThrow()
    const id = createId('production')
    const now = new Date().toISOString()
    const date = input.date?.trim() || now.slice(0, 10)
    const batchNumber = `PB-${Date.now().toString().slice(-8)}`
    const nextRawStock = rawMaterial.stockQty - rawKgConsumedTotal

    const usageId = createId('usage')
    const usage: MaterialUsageRecord = {
      id: usageId,
      materialId: rawMaterial.id,
      materialName: rawMaterial.name,
      category: rawMaterial.category,
      unit: rawMaterial.unit,
      qty: rawKgConsumedTotal,
      date,
      note: `Consumed by Production batch ${batchNumber}.`,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: now,
    }

    const batch: ProductionBatchRecord = {
      id,
      batchNumber,
      date,
      rawMaterialId: rawMaterial.id,
      rawMaterialName: rawMaterial.name,
      rawKgConsumedTotal,
      outputs,
      materialUsageId: usageId,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      createdBy: currentUser.id,
      createdByName: currentUser.name,
      createdAt: now,
    }

    const updates: Record<string, unknown> = {
      [`productionBatches/${id}`]: batch,
      [`materialUsages/${usageId}`]: usage,
      [`purchaseMaterials/${rawMaterial.id}/stockQty`]: nextRawStock,
      [`purchaseMaterials/${rawMaterial.id}/updatedAt`]: now,
    }

    // A finished goods item can appear as more than one output line only if
    // picked twice by mistake — deltas are summed first, same guard
    // createPurchase uses for repeated materials.
    const outputDeltas = new Map<string, number>()
    outputs.forEach((output) => {
      outputDeltas.set(output.finishedGoodsId, (outputDeltas.get(output.finishedGoodsId) ?? 0) + output.qtyProduced)
    })
    outputDeltas.forEach((delta, finishedGoodsId) => {
      const finishedGoods = data.finishedGoods[finishedGoodsId]
      if (!finishedGoods) return
      updates[`finishedGoods/${finishedGoodsId}/stockQty`] = finishedGoods.stockQty + delta
      updates[`finishedGoods/${finishedGoodsId}/updatedAt`] = now
      // "পুরনো ডিলার ইনভয়েসের stock reconciliation" (2026-09-12): this
      // freshly produced stock auto-covers whatever open shortfalls earlier
      // invoices left against this same Finished Goods item.
      resolveFinishedGoodsShortfalls(updates, data, finishedGoodsId, delta, id, date, now)
    })

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'production_batch_created',
      'purchase',
      `Recorded production batch ${batchNumber} — ${rawKgConsumedTotal} Kg of ${rawMaterial.name} repacked into ${outputs.length} pack size(s).`
    )

    if (nextRawStock <= rawMaterial.minStock) {
      await writeNotification(
        'Material low stock alert',
        `${rawMaterial.name} is at or below its minimum stock (${nextRawStock} ${rawMaterial.unit}/${rawMaterial.minStock} ${rawMaterial.unit}) — consider purchasing more.`,
        'warning',
        ['super_admin', 'manager', 'warehouse_manager', 'production_manager']
      )
    }

    return id
  }

  async function deleteProductionBatch(productionBatchId: string) {
    if (!data) {
      return
    }

    const batch = data.productionBatches[productionBatchId]
    if (!batch) {
      throw new Error('Production batch not found.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = { [`productionBatches/${productionBatchId}`]: null }

    // Un-cover whatever shortfalls this batch had resolved before reversing
    // its stock effect below.
    reverseFinishedGoodsShortfallResolutions(updates, data, productionBatchId, now)

    const rawMaterial = data.purchaseMaterials[batch.rawMaterialId]
    if (rawMaterial) {
      updates[`purchaseMaterials/${rawMaterial.id}/stockQty`] = rawMaterial.stockQty + batch.rawKgConsumedTotal
      updates[`purchaseMaterials/${rawMaterial.id}/updatedAt`] = now
    }

    if (batch.materialUsageId && data.materialUsages[batch.materialUsageId]) {
      updates[`materialUsages/${batch.materialUsageId}`] = null
    }

    const outputDeltas = new Map<string, number>()
    batch.outputs.forEach((output) => {
      outputDeltas.set(output.finishedGoodsId, (outputDeltas.get(output.finishedGoodsId) ?? 0) + output.qtyProduced)
    })
    outputDeltas.forEach((delta, finishedGoodsId) => {
      const finishedGoods = data.finishedGoods[finishedGoodsId]
      if (!finishedGoods) return
      updates[`finishedGoods/${finishedGoodsId}/stockQty`] = finishedGoods.stockQty - delta
      updates[`finishedGoods/${finishedGoodsId}/updatedAt`] = now
    })

    await update(ref(db, 'erp'), updates)
    await writeActivity('production_batch_deleted', 'purchase', `Deleted production batch ${batch.batchNumber}.`)
  }

  // ---- Loan Management (Loan Chart) ---------------------------------------
  // A loan account is who the loan is with — mirrors saveDealer above; the
  // running balance is never stored here, only ever derived live from its
  // transactions (see computeLoanBalance in utils.ts).
  async function saveLoanAccount(input: LoanAccountInput, loanAccountId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const existingAccount = loanAccountId ? data.loanAccounts[loanAccountId] : null
    const normalized = normalizeLoanAccountInput(input)

    if (!normalized.memberName) {
      throw new Error('Member name is required.')
    }

    const db = getDatabaseOrThrow()
    const id = existingAccount?.id ?? createId('loan_account')
    const now = new Date().toISOString()
    const account: LoanAccountRecord = {
      id,
      memberName: normalized.memberName,
      phone: normalized.phone,
      address: normalized.address,
      createdAt: existingAccount?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/loanAccounts'), { [id]: account })
    await writeActivity(
      existingAccount ? 'loan_account_updated' : 'loan_account_created',
      'finance',
      existingAccount ? `Updated loan member ${account.memberName}.` : `Added loan member ${account.memberName}.`
    )

    return id
  }

  async function deleteLoanAccount(loanAccountId: string) {
    if (!data) {
      return
    }

    const account = data.loanAccounts[loanAccountId]
    if (!account) {
      throw new Error('Loan member not found.')
    }

    const hasTransactions = Object.values(data.loanTransactions).some((entry) => entry.loanAccountId === loanAccountId)
    if (hasTransactions) {
      throw new Error('Loan members with recorded transactions cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`loanAccounts/${loanAccountId}`]: null,
    })
    await writeActivity('loan_account_deleted', 'finance', `Deleted loan member ${account.memberName}.`)
  }

  // A withdrawal raises the loan account's derived balance, a repayment
  // lowers it — see computeLoanBalance in utils.ts, which is what the Loan
  // Chart's "Remaining balance" column and the reconciliation check on the
  // Loan & Cash Maintenance page both read live.
  async function saveLoanTransaction(input: LoanTransactionInput, transactionId?: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording a loan transaction.')
    }

    const existingTransaction = transactionId ? data.loanTransactions[transactionId] : null
    const normalized = normalizeLoanTransactionInput(input)
    const account = data.loanAccounts[normalized.loanAccountId]
    if (!account) {
      throw new Error('Pick a loan member for this transaction.')
    }

    if (normalized.amount <= 0) {
      throw new Error('Amount must be greater than zero.')
    }

    const db = getDatabaseOrThrow()
    const id = existingTransaction?.id ?? createId('loan_txn')
    const now = new Date().toISOString()
    const transaction: LoanTransactionRecord = {
      id,
      loanAccountId: account.id,
      memberName: account.memberName,
      type: normalized.type,
      amount: normalized.amount,
      date: normalized.date,
      note: normalized.note,
      createdBy: existingTransaction?.createdBy ?? currentUser.id,
      createdByName: existingTransaction?.createdByName ?? currentUser.name,
      createdAt: existingTransaction?.createdAt ?? now,
    }

    await update(ref(db, 'erp/loanTransactions'), { [id]: transaction })
    await writeActivity(
      existingTransaction ? 'loan_transaction_updated' : 'loan_transaction_created',
      'finance',
      `${normalized.type === 'withdrawal' ? 'Recorded new loan withdrawal of' : 'Recorded loan repayment of'} ${normalized.amount} for ${account.memberName}.`
    )

    return id
  }

  async function deleteLoanTransaction(transactionId: string) {
    if (!data) {
      return
    }

    const transaction = data.loanTransactions[transactionId]
    if (!transaction) {
      throw new Error('Loan transaction not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`loanTransactions/${transactionId}`]: null,
    })
    await writeActivity(
      'loan_transaction_deleted',
      'finance',
      `Deleted ${transaction.type === 'withdrawal' ? 'loan withdrawal' : 'loan repayment'} of ${transaction.amount} for ${transaction.memberName}.`
    )
  }

  // ---- Cash Maintenance Chart ----------------------------------------------
  // Deliberately not posted to ledgerEntries/the Automatic Accounting Engine
  // — see the CashMaintenanceRecord comment in types.ts for why this stays a
  // standalone cash log alongside, not inside, the P&L expense chart.
  async function saveCashMaintenance(input: CashMaintenanceInput, recordId?: string) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording a cash entry.')
    }

    const existingRecord = recordId ? data.cashMaintenance[recordId] : null
    const normalized = normalizeCashMaintenanceInput(input)

    if (!normalized.category) {
      throw new Error('Category is required.')
    }

    if (normalized.amount <= 0) {
      throw new Error('Amount must be greater than zero.')
    }

    const db = getDatabaseOrThrow()
    const id = existingRecord?.id ?? createId('cash_maintenance')
    const now = new Date().toISOString()
    const record: CashMaintenanceRecord = {
      id,
      category: normalized.category,
      amount: normalized.amount,
      date: normalized.date,
      note: normalized.note,
      isDirectExpense: normalized.category === DIRECT_EXPENSE_CATEGORY,
      createdBy: existingRecord?.createdBy ?? currentUser.id,
      createdByName: existingRecord?.createdByName ?? currentUser.name,
      createdAt: existingRecord?.createdAt ?? now,
    }

    await update(ref(db, 'erp/cashMaintenance'), { [id]: record })
    await writeActivity(
      existingRecord ? 'cash_maintenance_updated' : 'cash_maintenance_created',
      'finance',
      `${existingRecord ? 'Updated' : 'Recorded'} ${normalized.category} cash entry of ${normalized.amount}.`
    )

    return id
  }

  async function deleteCashMaintenance(recordId: string) {
    if (!data) {
      return
    }

    const record = data.cashMaintenance[recordId]
    if (!record) {
      throw new Error('Cash maintenance entry not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`cashMaintenance/${recordId}`]: null,
    })
    await writeActivity('cash_maintenance_deleted', 'finance', `Deleted ${record.category} cash entry of ${record.amount}.`)
  }

  async function saveDiscountProduct(input: DiscountProductInput, productId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const normalized = normalizeDiscountProductInput(input)

    if (!normalized.name) {
      throw new Error('Product name is required.')
    }

    const db = getDatabaseOrThrow()
    const existingProduct = productId ? data.discountProducts[productId] : null
    const id = existingProduct?.id ?? createId('discount_product')
    const now = new Date().toISOString()
    const product: DiscountProductRecord = {
      id,
      ...normalized,
      createdAt: existingProduct?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/discountProducts'), { [id]: product })
    await writeActivity(
      existingProduct ? 'discount_product_updated' : 'discount_product_created',
      'inventory',
      existingProduct ? `Updated ${product.name} in the discount product list.` : `Added ${product.name} to the discount product list.`
    )

    return id
  }

  async function deleteDiscountProduct(productId: string) {
    if (!data) {
      return
    }

    const product = data.discountProducts[productId]
    if (!product) {
      throw new Error('Product not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`discountProducts/${productId}`]: null,
    })
    await writeActivity('discount_product_deleted', 'inventory', `Deleted ${product.name} from the discount product list.`)
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

  // Section 11: Dealer Return → Return Inspection → Good/Bad Stock
  // Classification → Stock Update → Dealer Ledger Adjustment →
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
      dealerId: order.dealerId,
      dealerName: order.dealerName,
      items,
      totalRefund,
      restockedQty,
      writtenOffQty,
      inspectionNote: input.inspectionNote?.trim() ?? '',
      processedBy: currentUser.id,
      processedByName: currentUser.name,
      createdAt: now,
    }

    // A dealer's outstanding balance is always derived live from order.due
    // (see computeDealerDue in utils.ts) rather than stored on the dealer
    // itself, so the refund has to come off this order's own due here.
    const nextOrderDue = Math.max(order.due - totalRefund, 0)
    const updates: Record<string, unknown> = {
      [`salesReturns/${id}`]: salesReturn,
      [`orders/${order.id}/due`]: nextOrderDue,
      [`orders/${order.id}/paymentStatus`]: nextOrderDue === 0 ? 'paid' : order.paid > 0 ? 'partial' : 'unpaid',
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
    const dealerCreditId = createId('ledger')
    updates[`ledgerEntries/${dealerCreditId}`] = {
      id: dealerCreditId,
      date: now,
      orderId: order.id,
      billNumber: returnNumber,
      account: 'dealer',
      accountRef: order.dealerId,
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
  // generates the receipt the UI prints. Dealer Ledger updates
  // automatically via the same 'dealer' ledger account (accountRef =
  // dealerId) every other dealer posting already uses.
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
      dealerId: order.dealerId,
      dealerName: order.dealerName,
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
      account: 'dealer',
      accountRef: order.dealerId,
      description: `Collection against ${order.billNumber}`,
      debit: 0,
      credit: input.amount,
      createdAt: now,
    } satisfies LedgerEntryRecord

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'collection_recorded',
      'finance',
      `Collected ${input.amount} against ${order.billNumber} (${order.dealerName}) via ${input.method}.`
    )
    return id
  }

  async function createOrder(input: OrderInput) {
    if (!data || !currentUser) {
      return
    }

    const db = getDatabaseOrThrow()
    const dealer = data.dealers[input.dealerId]
    if (!dealer) {
      throw new Error('Dealer not found.')
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
    const priceMode = input.priceMode ?? 'retail'
    const cogs = getOrderCogs(orderItems)

    // Section 49 — Sales Approval Workflow: approval is only required for
    // the special cases the spec lists. A plain order (none of these) skips
    // straight to "approved" instead of sitting in every approver's queue.
    const approvalReasons: string[] = []
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
        dealerId: dealer.id,
        dealerName: dealer.name,
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
      ...batchWrites,
    }

    const invoiceEntries = buildInvoiceLedgerEntries({
      orderId,
      billNumber,
      date: orderDate,
      dealerId: dealer.id,
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

    await writeActivity('order_created', 'sales', `Created order for ${dealer.name} with ${orderItems.length} product line(s).`)
    await writeNotification(
      'New sales order',
      `Order ${orderId} created for ${dealer.name} by ${currentUser?.name ?? 'Admin'}. Awaiting fulfillment.`,
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

    const dealer = data.dealers[input.dealerId]
    if (!dealer) {
      throw new Error('Dealer not found.')
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
    const priceMode = input.priceMode ?? 'retail'
    const billNumber = input.billNumber?.trim() || order.billNumber
    const cogs = getOrderCogs(orderItems)

    // Section 49: re-check the special-case triggers, since editing can be
    // what pushes an order into a special discount / below the minimum
    // price in the first place.
    const approvalReasons: string[] = []
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
      [`orders/${orderId}/dealerId`]: dealer.id,
      [`orders/${orderId}/dealerName`]: dealer.name,
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
        dealerId: dealer.id,
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
    await writeActivity('order_updated', 'sales', `Edited order ${order.billNumber} for ${dealer.name}.`, {
      oldValue: {
        billNumber: order.billNumber,
        dealerName: order.dealerName,
        total: order.total,
        paid: order.paid,
        due: order.due,
        items: order.items.map((item) => ({ productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice })),
      },
      newValue: {
        billNumber,
        dealerName: dealer.name,
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

    await writeActivity('order_cancelled', 'sales', `Cancelled order ${order.billNumber} for ${order.dealerName}.`, {
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
      const collectionDealerId = createId('ledger')
      updates[`ledgerEntries/${collectionDealerId}`] = {
        id: collectionDealerId,
        date: now,
        orderId: order.id,
        billNumber: order.billNumber,
        account: 'dealer',
        accountRef: order.dealerId,
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
  // computation) when it tripped one of the special cases — Special
  // Discount or Below Minimum Price — otherwise it skips
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
    // Only a সেলারি-category expense can carry the employee tag (Loan/Cash
    // Maintenance spec's Section 5, salary history) — dropped otherwise even
    // if one was somehow passed in.
    const employee =
      category === EXPENSE_SALARY_CATEGORY && input.employeeId?.trim() ? data.users[input.employeeId.trim()] : null
    // Only an EXPENSE_LOAN_REPAYMENT_CATEGORY entry can carry the loan tag
    // (2026-09-12 client request) — see the ExpenseRecord.loanAccountId
    // comment in types.ts for why this also auto-posts a LoanTransactionRecord.
    const loanAccount =
      category === EXPENSE_LOAN_REPAYMENT_CATEGORY && input.loanAccountId?.trim()
        ? data.loanAccounts[input.loanAccountId.trim()]
        : null
    if (category === EXPENSE_LOAN_REPAYMENT_CATEGORY && input.loanAccountId?.trim() && !loanAccount) {
      throw new Error('Pick a valid loan account for this repayment.')
    }
    // Carries forward the previous loan transaction id on an edit that keeps
    // the loan tag, so the same LoanTransactionRecord is updated in place
    // instead of a duplicate being created every time this expense is edited.
    const loanTxnId = loanAccount ? existingExpense?.loanTransactionId ?? createId('loan_txn') : null
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
      ...(employee
        ? { employeeId: employee.id, employeeName: employee.name }
        : existingExpense?.employeeId
          ? { employeeId: existingExpense.employeeId, employeeName: existingExpense.employeeName }
          : {}),
      ...(loanAccount
        ? { loanAccountId: loanAccount.id, loanMemberName: loanAccount.memberName, loanTransactionId: loanTxnId ?? undefined }
        : {}),
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

    if (loanAccount && loanTxnId) {
      updates[`loanTransactions/${loanTxnId}`] = {
        id: loanTxnId,
        loanAccountId: loanAccount.id,
        memberName: loanAccount.memberName,
        type: 'repayment',
        amount: input.amount,
        date: expenseDate,
        note: expense.note || `Recorded from Expense — ${category}`,
        createdBy: existingExpense?.createdBy ?? currentUser.id,
        createdByName: existingExpense?.createdByName ?? currentUser.name,
        createdAt: existingExpense?.createdAt ?? now,
      }
    } else if (existingExpense?.loanTransactionId) {
      // Category was switched away from ঋণ পরিশোধ, or the loan tag was
      // cleared, on an edit — drop the loan transaction this expense used to
      // own so it doesn't linger on the Loan & Investment ledger unowned.
      updates[`loanTransactions/${existingExpense.loanTransactionId}`] = null
    }

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
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording an investor.')
    }
    const name = input.name.trim()
    const mobile = input.mobile.trim()
    if (!name) throw new Error('Investor name is required.')
    if (!mobile) throw new Error('Investor mobile number is required.')
    if (input.amount <= 0) throw new Error('Investment amount must be greater than zero.')

    const existing = investorId ? data.investors[investorId] : null
    const id = existing?.id ?? createId('investor')
    const now = new Date().toISOString()
    // 2026-09-12 client request: hits cash flow the same way a Purchase's
    // paid amount does — one CashMaintenanceRecord per investor, kept in
    // sync (not re-created) as the investor's `amount` is edited, since
    // `amount` is a running total on the investor, not a per-transaction
    // ledger entry.
    const cashMaintenanceId = existing?.cashMaintenanceId ?? createId('cash_maintenance')
    const investor: InvestorRecord = {
      id,
      name,
      location: input.location?.trim() ?? '',
      mobile,
      products: input.products?.trim() ?? '',
      amount: input.amount,
      note: input.note?.trim() ?? '',
      cashMaintenanceId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    const previousCashEntry = data.cashMaintenance[cashMaintenanceId]
    const cashEntry: CashMaintenanceRecord = {
      id: cashMaintenanceId,
      category: CASH_CATEGORY_NEW_MARKET_INVESTMENT,
      amount: input.amount,
      date: previousCashEntry?.date ?? now.slice(0, 10),
      note: `Investment from ${name}`,
      createdBy: previousCashEntry?.createdBy ?? currentUser.id,
      createdByName: previousCashEntry?.createdByName ?? currentUser.name,
      createdAt: previousCashEntry?.createdAt ?? now,
    }
    await update(ref(getDatabaseOrThrow(), 'erp'), {
      [`investors/${id}`]: investor,
      [`cashMaintenance/${cashMaintenanceId}`]: cashEntry,
    })
    await writeActivity(existing ? 'investor_updated' : 'investor_created', 'finance', `${existing ? 'Updated' : 'Added'} investor ${name}.`)
  }

  async function deleteInvestor(investorId: string) {
    if (!data) {
      return
    }

    const investor = data.investors[investorId]
    if (!investor) {
      throw new Error('Investor not found.')
    }

    const updates: Record<string, unknown> = { [`investors/${investorId}`]: null }
    if (investor.cashMaintenanceId) {
      updates[`cashMaintenance/${investor.cashMaintenanceId}`] = null
    }

    await update(ref(getDatabaseOrThrow(), 'erp'), updates)
    await writeActivity('investor_deleted', 'finance', `Deleted investor ${investor.name}.`)
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
    if (expense.loanTransactionId) {
      updates[`loanTransactions/${expense.loanTransactionId}`] = null
    }

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
    // pieces = qty (cartons/bags) × how many pieces one carton/bag holds.
    const pieces = (item: RateCardLineItem) => item.qty * parsePerCtnMultiplier(item.perCtnBgs)
    const rawRateTotal = items.reduce((sum, item) => sum + pieces(item) * item.rawRate, 0)
    const manufRateTotal = items.reduce((sum, item) => sum + pieces(item) * item.manufRate, 0)
    const depotRateTotal = items.reduce((sum, item) => sum + pieces(item) * item.depotRate, 0)
    const dealerRateTotal = items.reduce((sum, item) => sum + pieces(item) * item.dealerRate, 0)
    const tpRateTotal = items.reduce((sum, item) => sum + pieces(item) * (item.tpRate ?? 0), 0)
    const mrpRateTotal = items.reduce((sum, item) => sum + pieces(item) * (item.mrpRate ?? 0), 0)
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

  // How many actual units (Product List or Finished Goods) a rate card's
  // items move — same "qty × per-carton multiplier" pieces math
  // computeRateCardTotals uses, grouped by which stock collection each line
  // actually belongs to (a line sets at most one of productId/
  // finishedGoodsId — see the RateCardLineItem comment in types.ts).
  function rateCardStockPieces(items: RateCardLineItem[]) {
    const productPieces = new Map<string, number>()
    const finishedGoodsPieces = new Map<string, number>()
    items.forEach((item) => {
      const pieces = item.qty * parsePerCtnMultiplier(item.perCtnBgs)
      if (item.finishedGoodsId) {
        finishedGoodsPieces.set(item.finishedGoodsId, (finishedGoodsPieces.get(item.finishedGoodsId) ?? 0) + pieces)
      } else if (item.productId) {
        productPieces.set(item.productId, (productPieces.get(item.productId) ?? 0) + pieces)
      }
    })
    return { productPieces, finishedGoodsPieces }
  }

  // Nets an old-items-vs-new-items pieces delta straight into `updates` —
  // used by saveRateCard so editing an invoice only moves stock by the
  // difference, not the full old and new amounts stacked on top of each
  // other. Takes stock negative rather than blocking the save, the same
  // stance createMaterialUsage/createProductionBatch take: surface the
  // shortage on the relevant stock report, don't get in the way of billing.
  function applyRateCardStockDeltas(
    updates: Record<string, unknown>,
    collectionPath: 'products' | 'finishedGoods',
    recordsById: Record<string, { stockQty: number }>,
    oldPieces: Map<string, number>,
    newPieces: Map<string, number>,
    now: string
  ) {
    const ids = new Set<string>([...oldPieces.keys(), ...newPieces.keys()])
    ids.forEach((id) => {
      const record = recordsById[id]
      if (!record) return
      const delta = (newPieces.get(id) ?? 0) - (oldPieces.get(id) ?? 0)
      if (delta === 0) return
      updates[`${collectionPath}/${id}/stockQty`] = record.stockQty - delta
      updates[`${collectionPath}/${id}/updatedAt`] = now
    })
  }

  // Section: Stock Shortfall (2026-09-12 client request, "auto-link
  // matching") — tracks how much of a Finished Goods item's negative stock
  // a SPECIFIC rate card is responsible for, keyed to (rateCardId,
  // finishedGoodsId). Mirrors applyRateCardStockDeltas' old-vs-new diffing
  // so editing an invoice only moves the shortfall by the difference, the
  // same way it only moves stockQty by the difference. `shortfallDelta` is
  // the single unifying number for create/increase (positive — this save
  // pushed stock further negative) and edit-down/delete (negative — this
  // save restored stock, shrinking whatever this invoice used to owe) —
  // see StockShortfallRecord in types.ts for the full picture and
  // resolveFinishedGoodsShortfalls below for the Production side.
  function applyFinishedGoodsShortfallDeltas(
    updates: Record<string, unknown>,
    erpData: ERPData,
    rateCardId: string,
    invoiceNo: string,
    date: string,
    oldPieces: Map<string, number>,
    newPieces: Map<string, number>,
    now: string
  ) {
    const ids = new Set<string>([...oldPieces.keys(), ...newPieces.keys()])
    ids.forEach((finishedGoodsId) => {
      const record = erpData.finishedGoods[finishedGoodsId]
      if (!record) return
      const delta = (newPieces.get(finishedGoodsId) ?? 0) - (oldPieces.get(finishedGoodsId) ?? 0)
      if (delta === 0) return
      const beforeQty = record.stockQty
      const afterQty = beforeQty - delta
      const shortfallDelta = Math.max(0, -afterQty) - Math.max(0, -beforeQty)
      if (shortfallDelta === 0) return

      const existing = Object.values(erpData.stockShortfalls).find(
        (row) => row.rateCardId === rateCardId && row.finishedGoodsId === finishedGoodsId
      )

      if (shortfallDelta > 0) {
        if (existing) {
          updates[`stockShortfalls/${existing.id}/shortfallQty`] = existing.shortfallQty + shortfallDelta
          updates[`stockShortfalls/${existing.id}/remainingQty`] = existing.remainingQty + shortfallDelta
          updates[`stockShortfalls/${existing.id}/status`] = 'open'
          updates[`stockShortfalls/${existing.id}/updatedAt`] = now
        } else {
          const shortfallId = createId('shortfall')
          const entry: StockShortfallRecord = {
            id: shortfallId,
            finishedGoodsId,
            finishedGoodsName: record.name,
            rateCardId,
            invoiceNo,
            date,
            shortfallQty: shortfallDelta,
            remainingQty: shortfallDelta,
            status: 'open',
            resolutions: [],
            createdAt: now,
            updatedAt: now,
          }
          updates[`stockShortfalls/${shortfallId}`] = entry
        }
      } else if (existing) {
        // Editing this invoice down, or deleting it, restores stock —
        // shrink (or drop entirely) the shortfall it's responsible for.
        // Capped at what's still open; if Production already resolved part
        // of it, this can't claw that back below zero.
        const reduceBy = Math.min(-shortfallDelta, existing.remainingQty)
        const nextRemaining = existing.remainingQty - reduceBy
        const nextShortfall = Math.max(0, existing.shortfallQty - reduceBy)
        if (nextRemaining <= 0 && existing.resolutions.length === 0) {
          updates[`stockShortfalls/${existing.id}`] = null
        } else {
          updates[`stockShortfalls/${existing.id}/shortfallQty`] = nextShortfall
          updates[`stockShortfalls/${existing.id}/remainingQty`] = nextRemaining
          updates[`stockShortfalls/${existing.id}/status`] = nextRemaining <= 0 ? 'resolved' : 'open'
          updates[`stockShortfalls/${existing.id}/updatedAt`] = now
        }
      }
    })
  }

  // The Production side of the same feature — newly produced Finished
  // Goods stock auto-covers the oldest open shortfalls first (FIFO), same
  // "earliest claim first" shape as a dealer's due netting down as
  // collections come in. Only ever consumes up to `producedQty`; any
  // leftover production beyond what a shortfall needed is just normal
  // surplus stock, untouched here.
  function resolveFinishedGoodsShortfalls(
    updates: Record<string, unknown>,
    erpData: ERPData,
    finishedGoodsId: string,
    producedQty: number,
    productionBatchId: string,
    date: string,
    now: string
  ) {
    let remaining = producedQty
    const openShortfalls = Object.values(erpData.stockShortfalls)
      .filter((row) => row.finishedGoodsId === finishedGoodsId && row.status === 'open' && row.remainingQty > 0)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))

    for (const shortfall of openShortfalls) {
      if (remaining <= 0) break
      const covered = Math.min(remaining, shortfall.remainingQty)
      const nextRemaining = shortfall.remainingQty - covered
      updates[`stockShortfalls/${shortfall.id}/remainingQty`] = nextRemaining
      updates[`stockShortfalls/${shortfall.id}/status`] = nextRemaining <= 0 ? 'resolved' : 'open'
      updates[`stockShortfalls/${shortfall.id}/resolutions`] = [
        ...shortfall.resolutions,
        { productionBatchId, qty: covered, date },
      ]
      updates[`stockShortfalls/${shortfall.id}/updatedAt`] = now
      remaining -= covered
    }
  }

  // Reverses resolveFinishedGoodsShortfalls — deleting a production batch
  // un-covers whatever shortfalls it had resolved, restoring their
  // remainingQty and dropping back to 'open'.
  function reverseFinishedGoodsShortfallResolutions(
    updates: Record<string, unknown>,
    erpData: ERPData,
    productionBatchId: string,
    now: string
  ) {
    Object.values(erpData.stockShortfalls).forEach((shortfall) => {
      const matches = shortfall.resolutions.filter((resolution) => resolution.productionBatchId === productionBatchId)
      if (!matches.length) return
      const restored = matches.reduce((sum, resolution) => sum + resolution.qty, 0)
      const nextRemaining = shortfall.remainingQty + restored
      const nextResolutions = shortfall.resolutions.filter(
        (resolution) => resolution.productionBatchId !== productionBatchId
      )
      updates[`stockShortfalls/${shortfall.id}/remainingQty`] = nextRemaining
      updates[`stockShortfalls/${shortfall.id}/status`] = nextRemaining > 0 ? 'open' : 'resolved'
      updates[`stockShortfalls/${shortfall.id}/resolutions`] = nextResolutions
      updates[`stockShortfalls/${shortfall.id}/updatedAt`] = now
    })
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
        ...(item.finishedGoodsId ? { finishedGoodsId: item.finishedGoodsId } : item.productId ? { productId: item.productId } : {}),
        productName: item.productName.trim(),
        qty: Number(item.qty) || 0,
        rawRate: Number(item.rawRate) || 0,
        manufRate: Number(item.manufRate) || 0,
        depotRate: Number(item.depotRate) || 0,
        dealerRate: Number(item.dealerRate) || 0,
        tpRate: Number(item.tpRate) || 0,
        mrpRate: Number(item.mrpRate) || 0,
        ...(item.perCtnBgs?.trim() ? { perCtnBgs: item.perCtnBgs.trim() } : {}),
        ...(item.srCommissionPercent ? { srCommissionPercent: Number(item.srCommissionPercent) || 0 } : {}),
        ...(item.tpPercent ? { tpPercent: Number(item.tpPercent) || 0 } : {}),
      }))
    if (items.length === 0) {
      throw new Error('Add at least one product line.')
    }

    const existing = rateCardId ? data.rateCards[rateCardId] : null
    const db = getDatabaseOrThrow()
    const id = existing?.id ?? createId('ratecard')
    const now = new Date().toISOString()
    const totals = computeRateCardTotals(items)
    const rateCard: RateCardRecord = {
      id,
      invoiceNo,
      recipientName: input.recipientName.trim(),
      date: input.date,
      deliveryDate: input.deliveryDate?.trim() ?? '',
      dealerId: input.dealerId ?? '',
      ...(input.saleType ? { saleType: input.saleType } : {}),
      items,
      remarks: input.remarks?.trim() ?? '',
      ...totals,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    const updates: Record<string, unknown> = { [`rateCards/${id}`]: rateCard }
    const oldPieces = existing
      ? rateCardStockPieces(existing.items)
      : { productPieces: new Map<string, number>(), finishedGoodsPieces: new Map<string, number>() }
    const newPieces = rateCardStockPieces(items)
    applyRateCardStockDeltas(updates, 'products', data.products, oldPieces.productPieces, newPieces.productPieces, now)
    applyRateCardStockDeltas(
      updates,
      'finishedGoods',
      data.finishedGoods,
      oldPieces.finishedGoodsPieces,
      newPieces.finishedGoodsPieces,
      now
    )
    applyFinishedGoodsShortfallDeltas(
      updates,
      data,
      id,
      invoiceNo,
      rateCard.date,
      oldPieces.finishedGoodsPieces,
      newPieces.finishedGoodsPieces,
      now
    )

    await update(ref(db, 'erp'), updates)
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
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = { [`rateCards/${rateCardId}`]: null }
    const pieces = rateCardStockPieces(rateCard.items)
    const empty = new Map<string, number>()
    applyRateCardStockDeltas(updates, 'products', data.products, pieces.productPieces, empty, now)
    applyRateCardStockDeltas(updates, 'finishedGoods', data.finishedGoods, pieces.finishedGoodsPieces, empty, now)
    applyFinishedGoodsShortfallDeltas(
      updates,
      data,
      rateCardId,
      rateCard.invoiceNo,
      rateCard.date,
      pieces.finishedGoodsPieces,
      empty,
      now
    )

    await update(ref(db, 'erp'), updates)
    await writeActivity('ratecard_deleted', 'sales', `Deleted rate card ${rateCard.invoiceNo}.`)
  }

  // Bulk-classify helper for the Sales Reports "Unclassified" list — sets
  // saleType on a legacy rate card (saved before that field existed) without
  // touching its items/rates, unlike saveRateCard which expects a full
  // RateCardInput.
  async function classifyRateCardSaleType(rateCardId: string, saleType: SaleType) {
    if (!data) {
      return
    }

    const rateCard = data.rateCards[rateCardId]
    if (!rateCard) {
      throw new Error('Rate card not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`rateCards/${rateCardId}/saleType`]: saleType,
      [`rateCards/${rateCardId}/updatedAt`]: new Date().toISOString(),
    })
    await writeActivity(
      'ratecard_updated',
      'sales',
      `Classified rate card ${rateCard.invoiceNo} as ${saleTypeLabel(saleType, toArray(data.dealerCategories)) ?? saleType}.`
    )
  }

  // ---- Product Return (Damage/Return against the Product List) ----------
  // Straight qty x rate, no per-carton/bag conversion — a return is entered
  // directly in whichever unit (Pcs/Kg) came back. See the returnParty
  // comment on ProductReturnRecord in types.ts for what each leg means.
  function computeProductReturnTotals(items: ProductReturnRecord['items']) {
    const rawRateTotal = items.reduce((sum, item) => sum + item.qty * item.rawRate, 0)
    const manufRateTotal = items.reduce((sum, item) => sum + item.qty * item.manufRate, 0)
    const depotRateTotal = items.reduce((sum, item) => sum + item.qty * item.depotRate, 0)
    const dealerRateTotal = items.reduce((sum, item) => sum + item.qty * item.dealerRate, 0)
    const tpRateTotal = items.reduce((sum, item) => sum + item.qty * (item.tpRate ?? 0), 0)
    const mrpRateTotal = items.reduce((sum, item) => sum + item.qty * (item.mrpRate ?? 0), 0)

    // Return value is always credited at Depot Purchase Price (depotRate),
    // regardless of returnParty — see the ProductReturnRecord.returnParty
    // comment in types.ts. companyProfit alone (depotRateTotal -
    // manufRateTotal) is the only profit adjustment a return makes now; the
    // old separate depotProfit (dealerRateTotal - depotRateTotal) deduction
    // is gone.
    return {
      rawRateTotal,
      manufRateTotal,
      depotRateTotal,
      dealerRateTotal,
      tpRateTotal,
      mrpRateTotal,
      companyProfit: depotRateTotal - manufRateTotal,
      depotProfit: 0,
      dealerProfit: 0,
    }
  }

  async function createProductReturn(input: ProductReturnInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording a product return.')
    }
    if (!input.items.length) {
      throw new Error('Add at least one product to return.')
    }

    const depot = input.depotId ? data.depots[input.depotId] : undefined
    if (input.depotId && !depot) {
      throw new Error('Depot not found.')
    }
    const dealer = input.dealerId ? data.dealers[input.dealerId] : undefined
    if (input.dealerId && !dealer) {
      throw new Error('Dealer not found.')
    }
    const recipientName = (depot?.name || dealer?.name || input.recipientName?.trim() || '').trim()
    if (!recipientName) {
      throw new Error(
        input.returnParty === 'depot' ? 'Pick the depot this return is against.' : 'Pick the dealer this return is against.'
      )
    }

    const items: ProductReturnRecord['items'] = input.items.map((requested) => {
      const name = requested.productName.trim()
      if (!name) {
        throw new Error('Every return line needs a product.')
      }
      const qty = Number(requested.qty) || 0
      if (qty <= 0) {
        throw new Error(`Return quantity for ${name} must be greater than zero.`)
      }
      // Rates are prefilled from the Product List when picked but can be
      // hand-edited before saving (a return can land long after the price
      // list moved on) — see the ProductReturnItem comment in types.ts. So
      // whatever the line shows at save time is what's recorded, not a
      // fresh lookup off the current Product List.
      return {
        ...(requested.productId ? { productId: requested.productId } : {}),
        productName: name,
        qty,
        unit: requested.unit,
        rawRate: Math.max(requested.rawRate ?? 0, 0),
        manufRate: Math.max(requested.manufRate ?? 0, 0),
        depotRate: Math.max(requested.depotRate ?? 0, 0),
        dealerRate: Math.max(requested.dealerRate ?? 0, 0),
        tpRate: Math.max(requested.tpRate ?? 0, 0),
        mrpRate: Math.max(requested.mrpRate ?? 0, 0),
        ...(requested.perCtnBgs ? { perCtnBgs: requested.perCtnBgs } : {}),
      }
    })

    const db = getDatabaseOrThrow()
    const id = createId('prtn')
    const now = new Date().toISOString()
    const returnDate = input.date?.trim() || now.slice(0, 10)
    const returnNumber = `PRTN-${Date.now().toString().slice(-8)}`
    const totals = computeProductReturnTotals(items)

    const updates: Record<string, unknown> = {}

    // Per the 2026-09-10 request: these are informational cost figures only
    // — no longer posted as ExpenseRecords (they used to double-count
    // against companyProfit, which already nets out the return's full P&L
    // impact — see the ProductReturnRecord comment in types.ts).
    const manufacturingExpenseAmount = totals.manufRateTotal - totals.rawRateTotal
    const rawMaterialExpenseAmount = totals.rawRateTotal * 0.3

    const productReturn: ProductReturnRecord = {
      id,
      returnNumber,
      returnParty: input.returnParty,
      ...(depot ? { depotId: depot.id } : {}),
      ...(dealer ? { dealerId: dealer.id } : {}),
      recipientName,
      date: returnDate,
      items,
      reason: input.reason?.trim() ?? '',
      ...totals,
      manufacturingExpenseAmount,
      rawMaterialExpenseAmount,
      processedBy: currentUser.id,
      processedByName: currentUser.name,
      createdAt: now,
    }
    updates[`productReturns/${id}`] = productReturn

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'product_return_created',
      'sales',
      `Recorded product return ${returnNumber} from ${input.returnParty === 'depot' ? 'Depot' : 'Dealer'} ${recipientName} — return value ${totals.depotRateTotal.toFixed(2)} credited at Depot Rate, company profit down ${totals.companyProfit.toFixed(2)}.`
    )

    return id
  }

  // Edits an existing return in place (same id/returnNumber) — the write-off
  // expenses it posted are reversed and re-posted at the (possibly changed)
  // totals, the same reverse-then-post shape deleteProductReturn/
  // createProductReturn each use on their own, just combined into one atomic
  // update() so there's no window where the return exists without its
  // expenses reconciled.
  async function updateProductReturn(productReturnId: string, input: ProductReturnInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before editing a product return.')
    }
    const existing = data.productReturns[productReturnId]
    if (!existing) {
      throw new Error('Product return not found.')
    }
    if (!input.items.length) {
      throw new Error('Add at least one product to return.')
    }

    const depot = input.depotId ? data.depots[input.depotId] : undefined
    if (input.depotId && !depot) {
      throw new Error('Depot not found.')
    }
    const dealer = input.dealerId ? data.dealers[input.dealerId] : undefined
    if (input.dealerId && !dealer) {
      throw new Error('Dealer not found.')
    }
    const recipientName = (depot?.name || dealer?.name || input.recipientName?.trim() || '').trim()
    if (!recipientName) {
      throw new Error(
        input.returnParty === 'depot' ? 'Pick the depot this return is against.' : 'Pick the dealer this return is against.'
      )
    }

    const items: ProductReturnRecord['items'] = input.items.map((requested) => {
      const name = requested.productName.trim()
      if (!name) {
        throw new Error('Every return line needs a product.')
      }
      const qty = Number(requested.qty) || 0
      if (qty <= 0) {
        throw new Error(`Return quantity for ${name} must be greater than zero.`)
      }
      return {
        ...(requested.productId ? { productId: requested.productId } : {}),
        productName: name,
        qty,
        unit: requested.unit,
        rawRate: Math.max(requested.rawRate ?? 0, 0),
        manufRate: Math.max(requested.manufRate ?? 0, 0),
        depotRate: Math.max(requested.depotRate ?? 0, 0),
        dealerRate: Math.max(requested.dealerRate ?? 0, 0),
        tpRate: Math.max(requested.tpRate ?? 0, 0),
        mrpRate: Math.max(requested.mrpRate ?? 0, 0),
        ...(requested.perCtnBgs ? { perCtnBgs: requested.perCtnBgs } : {}),
      }
    })

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const returnDate = input.date?.trim() || existing.date
    const totals = computeProductReturnTotals(items)

    const updates: Record<string, unknown> = {}

    // A legacy record (created before the 2026-09-10 change) may still carry
    // write-off expense ids — reverse them on edit so they don't keep
    // double-counting against companyProfit. A record created after that
    // change never has these ids, so this is a no-op for it.
    ;[existing.manufacturingExpenseId, existing.rawMaterialExpenseId].forEach((expenseId) => {
      if (!expenseId || !data.expenses[expenseId]) {
        return
      }
      updates[`expenses/${expenseId}`] = null
      const active = getActiveLedgerEntries(data.ledgerEntries, expenseId)
      Object.values(buildLedgerReversalEntries(active, now)).forEach((entry) => {
        updates[`ledgerEntries/${entry.id}`] = entry
      })
    })

    // Informational cost figures only — see createProductReturn.
    const manufacturingExpenseAmount = totals.manufRateTotal - totals.rawRateTotal
    const rawMaterialExpenseAmount = totals.rawRateTotal * 0.3

    const updatedReturn: ProductReturnRecord = {
      id: existing.id,
      returnNumber: existing.returnNumber,
      ...(existing.rateCardId ? { rateCardId: existing.rateCardId } : {}),
      ...(existing.invoiceNo ? { invoiceNo: existing.invoiceNo } : {}),
      returnParty: input.returnParty,
      ...(depot ? { depotId: depot.id } : {}),
      ...(dealer ? { dealerId: dealer.id } : {}),
      recipientName,
      date: returnDate,
      items,
      reason: input.reason?.trim() ?? '',
      ...totals,
      manufacturingExpenseAmount,
      rawMaterialExpenseAmount,
      processedBy: existing.processedBy,
      processedByName: existing.processedByName,
      createdAt: existing.createdAt,
    }
    updates[`productReturns/${existing.id}`] = updatedReturn

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'product_return_updated',
      'sales',
      `Edited product return ${existing.returnNumber} from ${input.returnParty === 'depot' ? 'Depot' : 'Dealer'} ${recipientName}.`
    )
  }

  async function deleteProductReturn(productReturnId: string) {
    if (!data) {
      return
    }

    const productReturn = data.productReturns[productReturnId]
    if (!productReturn) {
      throw new Error('Product return not found.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = { [`productReturns/${productReturnId}`]: null }

    // Undo the manufacturing/raw-material write-off expenses this return
    // posted (see createProductReturn) — same reverse-and-delete shape
    // deleteExpense uses, so the ledger keeps a clean audit trail.
    ;[productReturn.manufacturingExpenseId, productReturn.rawMaterialExpenseId].forEach((expenseId) => {
      if (!expenseId || !data.expenses[expenseId]) {
        return
      }
      updates[`expenses/${expenseId}`] = null
      const active = getActiveLedgerEntries(data.ledgerEntries, expenseId)
      Object.values(buildLedgerReversalEntries(active, now)).forEach((entry) => {
        updates[`ledgerEntries/${entry.id}`] = entry
      })
    })

    await update(ref(db, 'erp'), updates)
    await writeActivity('product_return_deleted', 'sales', `Deleted product return ${productReturn.returnNumber}.`)
  }

  // One-off cleanup for the 2026-09-10 change: product returns used to post
  // "Factory Expense"/"Raw Material" write-offs as real ExpenseRecords,
  // which double-counted against companyProfit (already the return's full
  // P&L hit) and inflated Company Earnings' Total Expenses with no matching
  // manual entry. createProductReturn/updateProductReturn no longer post
  // these, but records saved before the change still have live
  // ExpenseRecords linked via manufacturingExpenseId/rawMaterialExpenseId —
  // this walks every ProductReturnRecord, reverses+deletes any such expense
  // (ledger entries included), and clears the id fields. Safe to run more
  // than once — a record with no linked expense id is left untouched.
  // Returns how many records were cleaned up.
  async function recalculateProductReturnExpenses() {
    if (!data || !currentUser) {
      throw new Error('You need to log in before cleaning up product returns.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {}
    let changed = 0

    for (const productReturn of toArray(data.productReturns)) {
      const linkedExpenseIds = [productReturn.manufacturingExpenseId, productReturn.rawMaterialExpenseId].filter(
        (expenseId): expenseId is string => Boolean(expenseId && data.expenses[expenseId])
      )
      if (!linkedExpenseIds.length) {
        continue
      }

      linkedExpenseIds.forEach((expenseId) => {
        updates[`expenses/${expenseId}`] = null
        const active = getActiveLedgerEntries(data.ledgerEntries, expenseId)
        Object.values(buildLedgerReversalEntries(active, now)).forEach((entry) => {
          updates[`ledgerEntries/${entry.id}`] = entry
        })
      })

      updates[`productReturns/${productReturn.id}/manufacturingExpenseId`] = null
      updates[`productReturns/${productReturn.id}/rawMaterialExpenseId`] = null
      changed += 1
    }

    if (changed === 0) {
      return 0
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'product_return_updated',
      'sales',
      `Removed write-off expenses posted by ${changed} older product return(s) — they no longer count against Total Expenses.`
    )

    return changed
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
      saveDiscountProduct,
      deleteDiscountProduct,
      createStockAdjustmentRequest,
      approveStockAdjustment,
      rejectStockAdjustment,
      createStockCount,
      saveDealer,
      deleteDealer,
      saveDealerCategory,
      deleteDealerCategory,
      saveDepot,
      deleteDepot,
      saveLoanAccount,
      deleteLoanAccount,
      saveLoanTransaction,
      deleteLoanTransaction,
      saveCashMaintenance,
      deleteCashMaintenance,
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
      deleteInvestor,
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
      classifyRateCardSaleType,
      createProductReturn,
      updateProductReturn,
      deleteProductReturn,
      recalculateProductReturnExpenses,
      saveVendor,
      deleteVendor,
      savePurchaseMaterial,
      deletePurchaseMaterial,
      createPurchase,
      deletePurchase,
      recordVendorPayment,
      createMaterialUsage,
      deleteMaterialUsage,
      saveFinishedGoods,
      deleteFinishedGoods,
      createProductionBatch,
      deleteProductionBatch,
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

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

import { createDefaultERPData } from '@/lib/erp/defaultData'
import type {
  BankAccountInput,
  BankAccountRecord,
  BankTransactionInput,
  BankTransactionRecord,
  BatchRecord,
  BillOfMaterialInput,
  BillOfMaterialRecord,
  ChartOfAccountInput,
  ChartOfAccountRecord,
  CollectionInput,
  CollectionRecord,
  CourierInput,
  CourierRecord,
  CustomerInput,
  CustomerRecord,
  ERPData,
  ExpenseInput,
  InvestorInput,
  JournalEntryInput,
  JournalEntryLine,
  JournalEntryRecord,
  LedgerAccount,
  LedgerEntryRecord,
  LoginHistoryRecord,
  OrderInput,
  OrderItem,
  OrderRecord,
  ProductInput,
  ProductRecord,
  ProductionCompleteInput,
  ProductionOrderInput,
  ProductionOrderRecord,
  PurchaseInput,
  PurchaseOrderInput,
  PurchaseOrderRecord,
  PurchaseReceiveInput,
  PurchaseRequisitionRecord,
  PurchaseReturnInput,
  PurchaseReturnRecord,
  QcHoldRecord,
  QualityCheckInput,
  QualityCheckRecord,
  QualityCheckStatus,
  RoleRecord,
  SalesReturnInput,
  SalesReturnRecord,
  SellerInput,
  SellerTransactionInput,
  SettingsInput,
  StockAdjustmentInput,
  StockAdjustmentRecord,
  StockCountInput,
  StockCountRecord,
  StockTransferInput,
  StockTransferRecord,
  SupplierInput,
  SupplierRecord,
  TaskInput,
  TaskRecord,
  UserInput,
  UserRecord,
  WarehouseInput,
  WarehouseStockRecord,
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
  saveCustomer: (input: CustomerInput, customerId?: string) => Promise<string>
  deleteCustomer: (customerId: string) => Promise<void>
  saveSupplier: (input: SupplierInput, supplierId?: string) => Promise<string>
  deleteSupplier: (supplierId: string) => Promise<void>
  saveProduct: (input: ProductInput, productId?: string) => Promise<string>
  deleteProduct: (productId: string) => Promise<void>
  createStockAdjustmentRequest: (input: StockAdjustmentInput) => Promise<string>
  approveStockAdjustment: (adjustmentId: string) => Promise<void>
  rejectStockAdjustment: (adjustmentId: string) => Promise<void>
  createStockCount: (input: StockCountInput) => Promise<string>
  saveWarehouse: (input: WarehouseInput, warehouseId?: string) => Promise<string>
  deleteWarehouse: (warehouseId: string) => Promise<void>
  recordPurchase: (input: PurchaseInput) => Promise<void>
  dismissPurchaseRequisition: (requisitionId: string) => Promise<void>
  createPurchaseOrder: (input: PurchaseOrderInput) => Promise<string>
  receivePurchaseOrder: (purchaseOrderId: string, input: PurchaseReceiveInput) => Promise<void>
  cancelPurchaseOrder: (purchaseOrderId: string) => Promise<void>
  recordSupplierPayment: (purchaseOrderId: string, amount: number) => Promise<void>
  createPurchaseReturn: (input: PurchaseReturnInput) => Promise<string>
  createSalesReturn: (input: SalesReturnInput) => Promise<string>
  recordCollection: (input: CollectionInput) => Promise<string>
  createStockTransferRequest: (input: StockTransferInput) => Promise<string>
  approveStockTransfer: (transferId: string) => Promise<void>
  rejectStockTransfer: (transferId: string) => Promise<void>
  dispatchStockTransfer: (transferId: string) => Promise<void>
  receiveStockTransfer: (transferId: string) => Promise<void>
  cancelStockTransfer: (transferId: string) => Promise<void>
  releaseQcHold: (qcHoldId: string) => Promise<void>
  scrapQcHold: (qcHoldId: string) => Promise<void>
  saveBillOfMaterial: (input: BillOfMaterialInput, previousVersionId?: string) => Promise<string>
  approveBillOfMaterial: (bomId: string) => Promise<void>
  rejectBillOfMaterial: (bomId: string) => Promise<void>
  deleteBillOfMaterial: (bomId: string) => Promise<void>
  createProductionOrder: (input: ProductionOrderInput) => Promise<string>
  issueMaterialsForProduction: (productionOrderId: string) => Promise<void>
  completeProduction: (productionOrderId: string, input: ProductionCompleteInput) => Promise<void>
  cancelProductionOrder: (productionOrderId: string) => Promise<void>
  createOrder: (input: OrderInput) => Promise<void>
  updateOrder: (orderId: string, input: OrderInput) => Promise<void>
  cancelOrder: (orderId: string) => Promise<void>
  updateOrderStatus: (orderId: string, status: OrderRecord['status']) => Promise<void>
  updateOrderApproval: (orderId: string, approvalStatus: NonNullable<OrderRecord['approvalStatus']>) => Promise<void>
  createTask: (input: TaskInput) => Promise<void>
  updateTaskStatus: (taskId: string, status: TaskRecord['status']) => Promise<void>
  markNotificationRead: (notificationId: string) => Promise<void>
  markAllNotificationsRead: (notificationIds: string[]) => Promise<void>
  saveExpense: (input: ExpenseInput, expenseId?: string) => Promise<void>
  saveInvestor: (input: InvestorInput, investorId?: string) => Promise<void>
  deleteExpense: (expenseId: string) => Promise<void>
  saveChartOfAccount: (input: ChartOfAccountInput, accountId?: string) => Promise<string>
  deleteChartOfAccount: (accountId: string) => Promise<void>
  seedStandardChartOfAccounts: () => Promise<void>
  createJournalEntry: (input: JournalEntryInput) => Promise<string>
  reverseJournalEntry: (journalEntryId: string) => Promise<void>
  saveBankAccount: (input: BankAccountInput, bankAccountId?: string) => Promise<string>
  deleteBankAccount: (bankAccountId: string) => Promise<void>
  recordBankTransaction: (input: BankTransactionInput) => Promise<string>
  saveSeller: (input: SellerInput, sellerId?: string) => Promise<void>
  deleteSeller: (sellerId: string) => Promise<void>
  recordSellerTransaction: (input: SellerTransactionInput) => Promise<void>
  deleteSellerTransaction: (transactionId: string) => Promise<void>
  saveCourier: (input: CourierInput, courierId?: string) => Promise<void>
  updateCourierStatus: (courierId: string, status: CourierRecord['status']) => Promise<void>
  deleteCourier: (courierId: string) => Promise<void>
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
  'warehouses',
  'suppliers',
  'customers',
  'products',
  'orders',
  'ledgerEntries',
  'chartOfAccounts',
  'journalEntries',
  'bankAccounts',
  'bankTransactions',
  'purchaseRequisitions',
  'purchaseOrders',
  'purchaseReturns',
  'salesReturns',
  'collections',
  'warehouseStocks',
  'stockTransfers',
  'batches',
  'stockAdjustments',
  'stockCounts',
  'billOfMaterials',
  'productionOrders',
  'qualityChecks',
  'qcHolds',
  'purchases',
  'tasks',
  'notifications',
  'activities',
  'loginHistory',
  'expenses',
  'sellers',
  'sellerTransactions',
  'couriers',
  'investors',
  'settings',
  'meta',
] as const satisfies readonly (keyof ERPData)[]

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

function normalizeSupplierRecord(supplier: SupplierRecord): SupplierRecord {
  const now = new Date().toISOString()

  return {
    ...supplier,
    supplierCode: supplier.supplierCode || '',
    company: supplier.company || supplier.name || 'Supplier',
    contactPerson: supplier.contactPerson || '',
    phone: supplier.phone || '',
    email: supplier.email || '',
    location: supplier.location || '',
    productCategory: supplier.productCategory || '',
    supplierType: supplier.supplierType ?? 'local',
    country: supplier.country || 'Bangladesh',
    lcNumber: supplier.lcNumber || '',
    lcStatus: supplier.lcStatus ?? 'not-required',
    productCost: Number(supplier.productCost ?? 0),
    shippingCost: Number(supplier.shippingCost ?? 0),
    customsDuty: Number(supplier.customsDuty ?? 0),
    otherCost: Number(supplier.otherCost ?? 0),
    currency: supplier.currency || 'BDT',
    paymentTerms: supplier.paymentTerms || '',
    creditDays: Number(supplier.creditDays ?? 0),
    openingBalance: Number(supplier.openingBalance ?? 0),
    bankAccount: supplier.bankAccount || '',
    supplierRating: Number(supplier.supplierRating ?? 0),
    status: supplier.status ?? 'active',
    notes: supplier.notes || '',
    createdAt: supplier.createdAt || now,
    updatedAt: supplier.updatedAt || supplier.createdAt || now,
  }
}

function normalizeSupplierMap(suppliers?: Record<string, SupplierRecord> | null) {
  return Object.fromEntries(
    Object.entries(suppliers ?? {}).map(([id, supplier]) => [id, normalizeSupplierRecord(supplier)])
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
    promotionalDiscount: Number(order.promotionalDiscount ?? 0),
    vat: Number(order.vat ?? 0),
    warehouseId: order.warehouseId || '',
    remarks: order.remarks || '',
  }
}

function normalizeOrderMap(orders?: Record<string, OrderRecord> | null) {
  return Object.fromEntries(
    Object.entries(orders ?? {}).map(([id, order]) => [id, normalizeOrderRecord(order)])
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

// Section 13 (Purchase Requisition): whenever a stock-moving action leaves a
// product below its reorder level (minStock), the system should auto-flag
// it — and clear the flag once a later receipt brings stock back up. Called
// from every place stock moves (sales, edits, purchase receipts). Returns
// the requisition it just opened, if any, so the caller can notify about it.
function syncPurchaseRequisitionForStock(
  data: ERPData,
  product: ProductRecord,
  nextStock: number,
  updates: Record<string, unknown>
): PurchaseRequisitionRecord | null {
  const existingOpen = Object.values(data.purchaseRequisitions).find(
    (requisition) => requisition.productId === product.id && requisition.status === 'open'
  )
  const now = new Date().toISOString()

  if (nextStock < product.minStock) {
    if (existingOpen) {
      updates[`purchaseRequisitions/${existingOpen.id}/currentStock`] = nextStock
      return null
    }

    const id = createId('requisition')
    const suggestedQty = Math.max(product.maxStock - nextStock, product.minStock * 2 - nextStock, 1)
    const requisition: PurchaseRequisitionRecord = {
      id,
      productId: product.id,
      productName: product.name,
      currentStock: nextStock,
      reorderLevel: product.minStock,
      suggestedQty,
      status: 'open',
      note: `${product.name} stock below reorder level.`,
      createdAt: now,
      updatedAt: now,
    }
    updates[`purchaseRequisitions/${id}`] = requisition
    return requisition
  }

  if (existingOpen) {
    updates[`purchaseRequisitions/${existingOpen.id}/status`] = 'dismissed'
    updates[`purchaseRequisitions/${existingOpen.id}/note`] = 'Stock replenished above reorder level.'
    updates[`purchaseRequisitions/${existingOpen.id}/updatedAt`] = now
  }

  return null
}

function warehouseStockKey(productId: string, warehouseId: string) {
  return `${productId}__${warehouseId}`
}

// Section 15/17: keeps the per-warehouse breakdown in sync wherever stock
// actually moves. `product.stockQty` (the company-wide total everything
// else already reads) is updated separately by each caller — this only
// tracks which warehouse physically holds how much of it. A blank
// warehouseId is a no-op: not every stock movement names a specific
// warehouse yet, and that's fine — the aggregate total still stays right.
function adjustWarehouseStock(
  data: ERPData,
  updates: Record<string, unknown>,
  product: ProductRecord,
  warehouseId: string,
  delta: number
) {
  if (!warehouseId || delta === 0) {
    return
  }

  const key = warehouseStockKey(product.id, warehouseId)
  // A single write batch can adjust the same product+warehouse twice (e.g.
  // editing an order that keeps the same warehouse) — read back whatever
  // this batch already staged so the second call composes instead of
  // clobbering the first.
  const pending = updates[`warehouseStocks/${key}`] as WarehouseStockRecord | undefined
  const baseQuantity = pending?.quantity ?? data.warehouseStocks[key]?.quantity ?? 0
  const nextQuantity = Math.max(baseQuantity + delta, 0)
  const now = new Date().toISOString()

  updates[`warehouseStocks/${key}`] = {
    id: key,
    productId: product.id,
    productName: product.name,
    warehouseId,
    quantity: nextQuantity,
    updatedAt: now,
  } satisfies WarehouseStockRecord
}

function normalizeERPData(data: ERPData | null): ERPData {
  const source = data ?? ({} as Partial<ERPData>)

  return {
    permissions: DEFAULT_ERP_DATA.permissions,
    roles: normalizeRoleMap(mergeRecordMap(DEFAULT_ERP_DATA.roles, source.roles)),
    users: source.users ?? {},
    warehouses: source.warehouses ?? {},
    suppliers: normalizeSupplierMap(source.suppliers),
    customers: normalizeCustomerMap(source.customers),
    products: normalizeProductMap(source.products),
    orders: normalizeOrderMap(source.orders),
    ledgerEntries: source.ledgerEntries ?? {},
    chartOfAccounts: source.chartOfAccounts ?? {},
    journalEntries: source.journalEntries ?? {},
    bankAccounts: source.bankAccounts ?? {},
    bankTransactions: source.bankTransactions ?? {},
    purchaseRequisitions: source.purchaseRequisitions ?? {},
    purchaseOrders: source.purchaseOrders ?? {},
    purchaseReturns: source.purchaseReturns ?? {},
    salesReturns: source.salesReturns ?? {},
    collections: source.collections ?? {},
    warehouseStocks: source.warehouseStocks ?? {},
    stockTransfers: source.stockTransfers ?? {},
    batches: source.batches ?? {},
    stockAdjustments: source.stockAdjustments ?? {},
    stockCounts: source.stockCounts ?? {},
    billOfMaterials: source.billOfMaterials ?? {},
    productionOrders: source.productionOrders ?? {},
    qualityChecks: source.qualityChecks ?? {},
    qcHolds: source.qcHolds ?? {},
    purchases: source.purchases ?? {},
    tasks: source.tasks ?? {},
    notifications: source.notifications ?? {},
    activities: source.activities ?? {},
    loginHistory: source.loginHistory ?? {},
    expenses: source.expenses ?? {},
    sellers: source.sellers ?? {},
    sellerTransactions: source.sellerTransactions ?? {},
    couriers: source.couriers ?? {},
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
    warehouseId: input.warehouseId,
    supplierId: input.supplierId?.trim() ?? '',
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

function normalizeWarehouseInput(input: WarehouseInput) {
  return {
    name: input.name.trim(),
    location: input.location.trim(),
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

function normalizeSupplierInput(input: SupplierInput) {
  return {
    supplierCode: input.supplierCode?.trim() ?? '',
    name: input.name.trim(),
    company: input.company?.trim() || input.name.trim(),
    contactPerson: input.contactPerson?.trim() ?? '',
    phone: input.phone.trim(),
    email: input.email?.trim() ?? '',
    location: input.location?.trim() ?? '',
    productCategory: input.productCategory?.trim() ?? '',
    supplierType: input.supplierType ?? 'local',
    country: input.country?.trim() || 'Bangladesh',
    lcNumber: input.lcNumber?.trim() ?? '',
    lcStatus: input.lcStatus ?? 'not-required',
    productCost: Math.max(input.productCost ?? 0, 0),
    shippingCost: Math.max(input.shippingCost ?? 0, 0),
    customsDuty: Math.max(input.customsDuty ?? 0, 0),
    otherCost: Math.max(input.otherCost ?? 0, 0),
    currency: input.currency?.trim().toUpperCase() || 'BDT',
    paymentTerms: input.paymentTerms?.trim() ?? '',
    creditDays: Math.max(input.creditDays ?? 0, 0),
    openingBalance: Math.max(input.openingBalance ?? 0, 0),
    bankAccount: input.bankAccount?.trim() ?? '',
    supplierRating: Math.min(Math.max(input.supplierRating ?? 0, 0), 5),
    status: input.status ?? 'active',
    notes: input.notes?.trim() ?? '',
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
    const raw: Partial<Record<(typeof ERP_TOP_LEVEL_KEYS)[number], unknown>> = {}
    const loadedKeys = new Set<string>()

    function commit() {
      if (cancelled) return
      setData(normalizeERPData(raw as ERPData))
      if (loadedKeys.size >= ERP_TOP_LEVEL_KEYS.length) {
        setLoading(false)
      }
    }

    const unsubscribes = ERP_TOP_LEVEL_KEYS.map((key) =>
      onValue(
        ref(db, `erp/${key}`),
        (snapshot) => {
          raw[key] = snapshot.val()
          loadedKeys.add(key)
          commit()
        },
        () => {
          raw[key] = null
          loadedKeys.add(key)
          commit()
        }
      )
    )

    return () => {
      cancelled = true
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
    const loginHistoryId = createId('login')
    await update(ref(db, 'erp/loginHistory'), {
      [loginHistoryId]: {
        id: loginHistoryId,
        userId: authenticatedUser.id,
        userName: authenticatedUser.name,
        roleId: authenticatedUser.roleId,
        roleName,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        createdAt: new Date().toISOString(),
      } satisfies LoginHistoryRecord,
    })

    return authenticatedUser
  }

  function logout() {
    setCurrentUserId(null)
    persistCurrentUserId(null)
    persistSessionExpiresAt(null)
    if (auth) {
      void signOut(auth)
    }
  }

  async function writeActivity(action: string, module: string, message: string) {
    if (!currentUser) {
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
        userId: currentUser.id,
        userName: currentUser.name,
        createdAt: new Date().toISOString(),
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

    if (!data.warehouses[normalized.warehouseId]) {
      throw new Error('Select a valid warehouse.')
    }

    if (normalized.supplierId && !data.suppliers[normalized.supplierId]) {
      throw new Error('Selected supplier was not found.')
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

    if (!existingProduct) {
      adjustWarehouseStock(data, updates, product, product.warehouseId, product.stockQty)
    } else if (existingProduct.warehouseId === product.warehouseId) {
      adjustWarehouseStock(data, updates, product, product.warehouseId, product.stockQty - existingProduct.stockQty)
    } else {
      // Home warehouse changed — move the full quantity across rather than leaving it stranded.
      adjustWarehouseStock(data, updates, existingProduct, existingProduct.warehouseId, -existingProduct.stockQty)
      adjustWarehouseStock(data, updates, product, product.warehouseId, product.stockQty)
    }
    syncPurchaseRequisitionForStock(data, product, product.stockQty, updates)

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      existingProduct ? 'product_updated' : 'product_created',
      'inventory',
      existingProduct
        ? `Updated ${product.name} inventory details.`
        : `Added ${product.name} with ${product.stockQty} units in stock.`
    )

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

    const warehouse = data.warehouses[input.warehouseId]
    if (!warehouse) {
      throw new Error('Select a valid warehouse.')
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
    const quantityBefore = data.warehouseStocks[warehouseStockKey(product.id, warehouse.id)]?.quantity ?? 0

    const adjustment: StockAdjustmentRecord = {
      id,
      productId: product.id,
      productName: product.name,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
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
      `Requested stock adjustment for ${product.name} at ${warehouse.name} (${quantityBefore} → ${input.newQuantity}). Reason: ${adjustment.reason}`
    )
    await writeNotification(
      'Stock adjustment requested',
      `${product.name} at ${warehouse.name}: ${quantityBefore} → ${input.newQuantity}. Reason: ${adjustment.reason}`,
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
    adjustWarehouseStock(data, updates, product, adjustment.warehouseId, adjustment.delta)
    syncPurchaseRequisitionForStock(data, product, nextStock, updates)

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'stock_adjustment_approved',
      'inventory',
      `Approved stock adjustment for ${product.name} at ${adjustment.warehouseName} (${adjustment.quantityBefore} → ${adjustment.quantityAfter}). Reason: ${adjustment.reason}.`
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
      `Rejected stock adjustment for ${adjustment.productName} at ${adjustment.warehouseName}.`
    )
  }

  // Section 20: a physical count is purely a variance report against
  // system stock — it never touches stockQty itself. Raise a Stock
  // Adjustment (Section 19) for any line that needs correcting.
  async function createStockCount(input: StockCountInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording a stock count.')
    }

    const warehouse = data.warehouses[input.warehouseId]
    if (!warehouse) {
      throw new Error('Select a valid warehouse.')
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
      const systemQty = data.warehouseStocks[warehouseStockKey(product.id, warehouse.id)]?.quantity ?? 0
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
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
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
      `Recorded stock count ${countNumber} at ${warehouse.name} — ${varianceCount} variance line(s).`
    )
    if (varianceCount > 0) {
      await writeNotification(
        'Stock count variance found',
        `${countNumber} at ${warehouse.name}: ${varianceCount} product(s) differ from system stock. Review and raise adjustments as needed.`,
        'warning',
        ['super_admin', 'manager']
      )
    }

    return id
  }

  async function saveWarehouse(input: WarehouseInput, warehouseId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const normalized = normalizeWarehouseInput(input)

    if (!normalized.name) {
      throw new Error('Warehouse name is required.')
    }

    if (!normalized.location) {
      throw new Error('Warehouse location is required.')
    }

    const db = getDatabaseOrThrow()
    const existingWarehouse = warehouseId ? data.warehouses[warehouseId] : null
    const id = existingWarehouse?.id ?? createId('warehouse')
    const warehouse = {
      id,
      ...normalized,
    }

    await update(ref(db, 'erp/warehouses'), { [id]: warehouse })
    await writeActivity(
      existingWarehouse ? 'warehouse_updated' : 'warehouse_created',
      'warehouse',
      existingWarehouse
        ? `Updated ${warehouse.name} warehouse details.`
        : `Added ${warehouse.name} warehouse.`
    )

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

  async function saveSupplier(input: SupplierInput, supplierId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const normalized = normalizeSupplierInput(input)

    if (!normalized.name) {
      throw new Error('Supplier name is required.')
    }

    if (!normalized.phone) {
      throw new Error('Supplier phone number is required.')
    }

    const db = getDatabaseOrThrow()
    const existingSupplier = supplierId ? data.suppliers[supplierId] : null
    const id = existingSupplier?.id ?? createId('supplier')
    const now = new Date().toISOString()
    const supplier = {
      id,
      ...normalized,
      createdAt: existingSupplier?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/suppliers'), { [id]: supplier })
    await writeActivity(
      existingSupplier ? 'supplier_updated' : 'supplier_created',
      'suppliers',
      existingSupplier
        ? `Updated ${supplier.name} supplier and import details.`
        : `Added supplier ${supplier.name}.`
    )

    return id
  }

  async function deleteSupplier(supplierId: string) {
    if (!data) {
      return
    }

    const supplier = data.suppliers[supplierId]
    if (!supplier) {
      throw new Error('Supplier not found.')
    }

    const hasProducts = Object.values(data.products).some((product) => product.supplierId === supplierId)
    const hasPurchases = Object.values(data.purchases).some((purchase) => purchase.supplierId === supplierId)
    if (hasProducts || hasPurchases) {
      throw new Error('Suppliers with product or purchase history cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`suppliers/${supplierId}`]: null,
    })
    await writeActivity('supplier_deleted', 'suppliers', `Deleted supplier ${supplier.name}.`)
  }

  async function deleteWarehouse(warehouseId: string) {
    if (!data) {
      return
    }

    const warehouse = data.warehouses[warehouseId]
    if (!warehouse) {
      throw new Error('Warehouse not found.')
    }

    const assignedProducts = Object.values(data.products).filter((product) => product.warehouseId === warehouseId)
    if (assignedProducts.length > 0) {
      throw new Error('Move or delete the products in this warehouse before removing it.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`warehouses/${warehouseId}`]: null,
    })
    await writeActivity('warehouse_deleted', 'warehouse', `Deleted ${warehouse.name} warehouse.`)
  }

  async function recordPurchase(input: PurchaseInput) {
    if (!data) {
      return
    }

    const db = getDatabaseOrThrow()
    const product = data.products[input.productId]
    const supplier = data.suppliers[input.supplierId]
    if (!product || !supplier) {
      throw new Error('Product or supplier not found.')
    }

    const purchaseId = createId('purchase')
    const nextStock = product.stockQty + input.quantity
    const now = new Date().toISOString()

    const updates: Record<string, unknown> = {
      [`purchases/${purchaseId}`]: {
        id: purchaseId,
        productId: product.id,
        productName: product.name,
        supplierId: supplier.id,
        supplierName: supplier.name,
        quantity: input.quantity,
        unitCost: input.unitCost,
        currency: input.currency,
        total: input.quantity * input.unitCost,
        status: 'received',
        createdAt: now,
      },
      [`products/${product.id}/stockQty`]: nextStock,
      [`products/${product.id}/purchasePrice`]: input.unitCost,
      [`products/${product.id}/status`]: getProductStatus(nextStock, product.minStock),
      [`products/${product.id}/updatedAt`]: now,
    }
    syncPurchaseRequisitionForStock(data, product, nextStock, updates)
    adjustWarehouseStock(data, updates, product, product.warehouseId, input.quantity)

    await update(ref(db, 'erp'), updates)

    await writeActivity('purchase_received', 'inventory', `Restocked ${product.name} by ${input.quantity} units.`)
    await writeNotification(
      'Purchase recorded',
      `Restocked ${product.name} by ${input.quantity} units from ${supplier.name} by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['super_admin', 'manager', 'accounts']
    )
  }

  // Section 13: dismiss an auto-raised (or already-ordered) requisition
  // without placing a purchase order for it.
  async function dismissPurchaseRequisition(requisitionId: string) {
    if (!data) {
      return
    }

    const requisition = data.purchaseRequisitions[requisitionId]
    if (!requisition) {
      throw new Error('Purchase requisition not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`purchaseRequisitions/${requisitionId}/status`]: 'dismissed',
      [`purchaseRequisitions/${requisitionId}/updatedAt`]: new Date().toISOString(),
    })
    await writeActivity(
      'requisition_dismissed',
      'inventory',
      `Dismissed purchase requisition for ${requisition.productName}.`
    )
  }

  // Section 12, stage 1-2: Purchase Requisition (optional link) → Purchase
  // Order placed with a supplier. No stock or accounting effect yet — that
  // only happens once goods are actually received (receivePurchaseOrder).
  async function createPurchaseOrder(input: PurchaseOrderInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before creating a purchase order.')
    }

    const supplier = data.suppliers[input.supplierId]
    if (!supplier) {
      throw new Error('Supplier not found.')
    }

    const warehouse = data.warehouses[input.warehouseId]
    if (!warehouse) {
      throw new Error('Select a valid receiving warehouse.')
    }

    if (!input.items.length) {
      throw new Error('Add at least one product to the purchase order.')
    }

    const items = input.items.map((item) => {
      const product = data.products[item.productId]
      if (!product) throw new Error('Product not found.')
      if (item.quantity <= 0) throw new Error(`Quantity for ${product.name} must be greater than zero.`)
      if (item.unitCost < 0) throw new Error(`Unit cost for ${product.name} cannot be negative.`)
      return {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitCost: item.unitCost,
        receivedQuantity: 0,
        rejectedQuantity: 0,
      }
    })

    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0)
    const db = getDatabaseOrThrow()
    const id = createId('po')
    const now = new Date().toISOString()
    const poNumber = `PO-${Date.now().toString().slice(-8)}`

    const purchaseOrder: PurchaseOrderRecord = {
      id,
      poNumber,
      requisitionId: input.requisitionId ?? '',
      supplierId: supplier.id,
      supplierName: supplier.name,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      items,
      currency: input.currency?.trim().toUpperCase() || 'BDT',
      subtotal,
      status: 'ordered',
      qualityCheckStatus: 'pending',
      qualityCheckNote: '',
      grnNumber: '',
      transportCost: 0,
      otherCost: 0,
      totalLandedCost: subtotal,
      billStatus: 'unbilled',
      paid: 0,
      due: 0,
      expectedDate: input.expectedDate?.trim() ?? '',
      createdAt: now,
      updatedAt: now,
    }

    const updates: Record<string, unknown> = {
      [`purchaseOrders/${id}`]: purchaseOrder,
    }

    if (input.requisitionId && data.purchaseRequisitions[input.requisitionId]) {
      updates[`purchaseRequisitions/${input.requisitionId}/status`] = 'ordered'
      updates[`purchaseRequisitions/${input.requisitionId}/updatedAt`] = now
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity('purchase_order_created', 'inventory', `Created purchase order ${poNumber} with ${supplier.name}.`)
    await writeNotification(
      'Purchase order created',
      `Purchase order ${poNumber} was placed with ${supplier.name} by ${currentUser.name}.`,
      'info',
      ['super_admin', 'manager', 'accounts']
    )

    return id
  }

  // Section 12, stage 3-6: Goods Receive → Quality Check → GRN → Warehouse
  // Receive, all in one step — only quality-passed quantities are added to
  // stock, and the accepted value becomes the Supplier Bill / Accounts
  // Payable (stage 7-8) posted to the ledger.
  async function receivePurchaseOrder(purchaseOrderId: string, input: PurchaseReceiveInput) {
    if (!data || !currentUser) {
      return
    }

    const purchaseOrder = data.purchaseOrders[purchaseOrderId]
    if (!purchaseOrder) {
      throw new Error('Purchase order not found.')
    }

    if (purchaseOrder.status !== 'ordered') {
      throw new Error('Only orders awaiting receipt can be received.')
    }

    if (!input.items.length) {
      throw new Error('Specify received quantities for at least one product.')
    }

    const receiptByProduct = new Map<
      string,
      { receivedQuantity: number; rejectedQuantity: number; batchNumber?: string; manufacturingDate?: string; expiryDate?: string }
    >()
    input.items.forEach((item) => {
      if (item.receivedQuantity < 0 || (item.rejectedQuantity ?? 0) < 0) {
        throw new Error('Received/rejected quantities cannot be negative.')
      }
      receiptByProduct.set(item.productId, {
        receivedQuantity: item.receivedQuantity,
        rejectedQuantity: item.rejectedQuantity ?? 0,
        batchNumber: item.batchNumber?.trim(),
        manufacturingDate: item.manufacturingDate?.trim(),
        expiryDate: item.expiryDate?.trim(),
      })
    })

    // Section 14 (GRN): every received line records its batch, manufacturing
    // date, and expiry date alongside the accepted/rejected split.
    const items = purchaseOrder.items.map((item) => {
      const receipt = receiptByProduct.get(item.productId)
      if (!receipt) {
        return item
      }
      const receivedQuantity = Math.min(receipt.receivedQuantity, item.quantity)
      const rejectedQuantity = Math.min(receipt.rejectedQuantity, item.quantity - receivedQuantity)
      return {
        ...item,
        receivedQuantity,
        rejectedQuantity,
        batchNumber: receipt.batchNumber || item.batchNumber || '',
        manufacturingDate: receipt.manufacturingDate || item.manufacturingDate || '',
        expiryDate: receipt.expiryDate || item.expiryDate || '',
      }
    })

    const totalAccepted = items.reduce((sum, item) => sum + item.receivedQuantity, 0)
    const totalRejected = items.reduce((sum, item) => sum + item.rejectedQuantity, 0)
    const goodsAmount = items.reduce((sum, item) => sum + item.receivedQuantity * item.unitCost, 0)
    const transportCost = Math.max(input.transportCost ?? 0, 0)
    const otherCost = Math.max(input.otherCost ?? 0, 0)
    const totalLandedCost = goodsAmount + transportCost + otherCost

    let qualityCheckStatus: QualityCheckStatus = 'passed'
    if (totalRejected > 0) {
      qualityCheckStatus = totalAccepted === 0 ? 'failed' : 'partial'
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()

    const updates: Record<string, unknown> = {
      [`purchaseOrders/${purchaseOrderId}/items`]: items,
      [`purchaseOrders/${purchaseOrderId}/status`]: 'received',
      [`purchaseOrders/${purchaseOrderId}/qualityCheckStatus`]: qualityCheckStatus,
      [`purchaseOrders/${purchaseOrderId}/qualityCheckNote`]: input.qualityCheckNote?.trim() ?? '',
      [`purchaseOrders/${purchaseOrderId}/grnNumber`]: input.grnNumber?.trim() || `GRN-${Date.now().toString().slice(-8)}`,
      [`purchaseOrders/${purchaseOrderId}/transportCost`]: transportCost,
      [`purchaseOrders/${purchaseOrderId}/otherCost`]: otherCost,
      [`purchaseOrders/${purchaseOrderId}/totalLandedCost`]: totalLandedCost,
      [`purchaseOrders/${purchaseOrderId}/billStatus`]: totalLandedCost > 0 ? 'billed' : 'unbilled',
      [`purchaseOrders/${purchaseOrderId}/due`]: totalLandedCost,
      [`purchaseOrders/${purchaseOrderId}/updatedAt`]: now,
    }

    items.forEach((item) => {
      if (item.receivedQuantity <= 0) {
        return
      }
      const product = data.products[item.productId]
      if (!product) {
        return
      }
      const nextStock = product.stockQty + item.receivedQuantity
      updates[`products/${product.id}/stockQty`] = nextStock
      updates[`products/${product.id}/purchasePrice`] = item.unitCost
      updates[`products/${product.id}/status`] = getProductStatus(nextStock, product.minStock)
      updates[`products/${product.id}/updatedAt`] = now
      syncPurchaseRequisitionForStock(data, product, nextStock, updates)
      adjustWarehouseStock(data, updates, product, purchaseOrder.warehouseId, item.receivedQuantity)

      // Section 18: a batch/expiry-tracked receipt becomes a pickable batch
      // for FEFO suggestions — purely informational until something
      // explicitly consumes it.
      if (item.batchNumber || item.expiryDate) {
        const batchId = createId('batch')
        updates[`batches/${batchId}`] = {
          id: batchId,
          productId: product.id,
          productName: product.name,
          warehouseId: purchaseOrder.warehouseId,
          batchNumber: item.batchNumber || `AUTO-${batchId.slice(-6).toUpperCase()}`,
          manufacturingDate: item.manufacturingDate || '',
          expiryDate: item.expiryDate || '',
          quantity: item.receivedQuantity,
          purchaseOrderId: purchaseOrderId,
          createdAt: now,
          updatedAt: now,
        } satisfies BatchRecord
      }

      // Section 26: quantity that failed QC never enters sellable stock —
      // it's parked here instead of just vanishing, so it stays trackable
      // (rework/return-to-supplier/scrap) rather than an unexplained gap
      // between what was ordered and what was stocked.
      if (item.rejectedQuantity > 0) {
        const holdId = createId('qchold')
        updates[`qcHolds/${holdId}`] = {
          id: holdId,
          sourceType: 'purchase',
          sourceId: purchaseOrderId,
          sourceReference: purchaseOrder.poNumber,
          productId: product.id,
          productName: product.name,
          warehouseId: purchaseOrder.warehouseId,
          warehouseName: purchaseOrder.warehouseName,
          quantity: item.rejectedQuantity,
          unitCost: item.unitCost,
          reason: input.qualityCheckNote?.trim() || 'Failed quality check on receipt',
          status: 'held',
          createdAt: now,
          updatedAt: now,
        } satisfies QcHoldRecord
      }
    })

    if (input.qc) {
      const qcId = createId('qc')
      const primaryItem = items.find((item) => item.receivedQuantity > 0 || item.rejectedQuantity > 0) ?? items[0]
      const primaryProduct = primaryItem ? data.products[primaryItem.productId] : undefined
      updates[`qualityChecks/${qcId}`] = {
        id: qcId,
        sourceType: 'purchase',
        sourceId: purchaseOrderId,
        sourceReference: purchaseOrder.poNumber,
        productId: primaryProduct?.id ?? '',
        productName: primaryProduct?.name ?? '',
        batchNumber: input.qc.batchNumber?.trim() ?? '',
        moisture: input.qc.moisture?.trim() ?? '',
        colour: input.qc.colour?.trim() ?? '',
        aroma: input.qc.aroma?.trim() ?? '',
        weight: input.qc.weight?.trim() ?? '',
        qualityGrade: input.qc.qualityGrade?.trim() ?? '',
        testResult: qualityCheckStatus === 'failed' ? 'fail' : 'pass',
        qcOfficerName: input.qc.qcOfficerName?.trim() || currentUser.name,
        remarks: input.qc.remarks?.trim() ?? '',
        createdAt: now,
      } satisfies QualityCheckRecord
    }

    if (totalLandedCost > 0) {
      const debitId = createId('ledger')
      updates[`ledgerEntries/${debitId}`] = {
        id: debitId,
        date: now,
        orderId: purchaseOrderId,
        billNumber: purchaseOrder.poNumber,
        account: 'inventory',
        accountRef: '',
        description: `GRN for ${purchaseOrder.poNumber} (goods + transport + other)`,
        debit: totalLandedCost,
        credit: 0,
        createdAt: now,
      } satisfies LedgerEntryRecord
      const creditId = createId('ledger')
      updates[`ledgerEntries/${creditId}`] = {
        id: creditId,
        date: now,
        orderId: purchaseOrderId,
        billNumber: purchaseOrder.poNumber,
        account: 'accounts_payable',
        accountRef: purchaseOrder.supplierId,
        description: `Supplier bill for ${purchaseOrder.poNumber}`,
        debit: 0,
        credit: totalLandedCost,
        createdAt: now,
      } satisfies LedgerEntryRecord
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity('purchase_order_received', 'inventory', `Received purchase order ${purchaseOrder.poNumber} (GRN).`)
    await writeNotification(
      'Goods received',
      `Purchase order ${purchaseOrder.poNumber} received via GRN${totalRejected > 0 ? ` — ${totalRejected} unit(s) failed quality check` : ''}.`,
      totalRejected > 0 ? 'warning' : 'info',
      ['super_admin', 'manager', 'accounts']
    )
  }

  // Resolves a QC Hold either back into sellable stock (release — the
  // batch turned out fine on re-test, or a decision was made to accept it
  // after all) or as a permanent write-off (scrap). Works for holds from
  // either Purchase or Production since both post through the same model.
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
    syncPurchaseRequisitionForStock(data, product, nextStock, updates)
    adjustWarehouseStock(data, updates, product, hold.warehouseId, hold.quantity)

    const value = hold.quantity * hold.unitCost
    if (value > 0) {
      if (hold.sourceType === 'production') {
        // Reverse the write-off booked when the hold was created — this
        // cost is a real finished-goods asset now, not a loss.
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
      } else {
        // Rejected purchase quantity was never billed at receipt time —
        // releasing it means accepting it after all, so bill it now.
        const purchaseOrder = data.purchaseOrders[hold.sourceId]
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
          account: 'accounts_payable',
          accountRef: purchaseOrder?.supplierId ?? '',
          description: `Supplier bill for released QC hold — ${hold.sourceReference}`,
          debit: 0,
          credit: value,
          createdAt: now,
        } satisfies LedgerEntryRecord
        if (purchaseOrder) {
          updates[`purchaseOrders/${purchaseOrder.id}/due`] = purchaseOrder.due + value
          updates[`purchaseOrders/${purchaseOrder.id}/totalLandedCost`] = purchaseOrder.totalLandedCost + value
          updates[`purchaseOrders/${purchaseOrder.id}/billStatus`] = 'billed'
        }
      }
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

  async function cancelPurchaseOrder(purchaseOrderId: string) {
    if (!data) {
      return
    }

    const purchaseOrder = data.purchaseOrders[purchaseOrderId]
    if (!purchaseOrder) {
      throw new Error('Purchase order not found.')
    }

    if (purchaseOrder.status !== 'ordered') {
      throw new Error('Only orders awaiting receipt can be cancelled.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`purchaseOrders/${purchaseOrderId}/status`]: 'cancelled',
      [`purchaseOrders/${purchaseOrderId}/updatedAt`]: new Date().toISOString(),
    })
    await writeActivity('purchase_order_cancelled', 'inventory', `Cancelled purchase order ${purchaseOrder.poNumber}.`)
  }

  // Closes the Accounts Payable loop from Section 12: Dr Accounts Payable /
  // Cr Cash for whatever was just paid to the supplier against a GRN'd bill.
  async function recordSupplierPayment(purchaseOrderId: string, amount: number) {
    if (!data || !currentUser) {
      return
    }

    const purchaseOrder = data.purchaseOrders[purchaseOrderId]
    if (!purchaseOrder) {
      throw new Error('Purchase order not found.')
    }

    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero.')
    }

    if (amount > purchaseOrder.due) {
      throw new Error('Payment cannot exceed the outstanding due amount.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const nextDue = purchaseOrder.due - amount

    const updates: Record<string, unknown> = {
      [`purchaseOrders/${purchaseOrderId}/paid`]: purchaseOrder.paid + amount,
      [`purchaseOrders/${purchaseOrderId}/due`]: nextDue,
      [`purchaseOrders/${purchaseOrderId}/billStatus`]: nextDue <= 0 ? 'paid' : 'billed',
      [`purchaseOrders/${purchaseOrderId}/updatedAt`]: now,
    }

    const debitId = createId('ledger')
    updates[`ledgerEntries/${debitId}`] = {
      id: debitId,
      date: now,
      orderId: purchaseOrderId,
      billNumber: purchaseOrder.poNumber,
      account: 'accounts_payable',
      accountRef: purchaseOrder.supplierId,
      description: `Payment against ${purchaseOrder.poNumber}`,
      debit: amount,
      credit: 0,
      createdAt: now,
    } satisfies LedgerEntryRecord
    const creditId = createId('ledger')
    updates[`ledgerEntries/${creditId}`] = {
      id: creditId,
      date: now,
      orderId: purchaseOrderId,
      billNumber: purchaseOrder.poNumber,
      account: 'cash',
      accountRef: '',
      description: `Payment against ${purchaseOrder.poNumber}`,
      debit: 0,
      credit: amount,
      createdAt: now,
    } satisfies LedgerEntryRecord

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'supplier_payment_recorded',
      'finance',
      `Recorded a payment of ${amount} against ${purchaseOrder.poNumber} (${purchaseOrder.supplierName}).`
    )
  }

  // Section 30 (Supplier Payable ledger): the supplier-side counterpart of
  // createSalesReturn — goods already received on a GRN'd PO go back out,
  // and whatever's still unbilled-and-unpaid on that PO shrinks by the
  // returned value. Only what was actually accepted into stock (received
  // minus rejected minus already-returned) can be returned again.
  async function createPurchaseReturn(input: PurchaseReturnInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before recording a purchase return.')
    }

    const purchaseOrder = data.purchaseOrders[input.purchaseOrderId]
    if (!purchaseOrder) {
      throw new Error('Purchase order not found.')
    }

    if (purchaseOrder.status !== 'received') {
      throw new Error('Only a received purchase order can have goods returned against it.')
    }

    if (!input.items.length) {
      throw new Error('Add at least one product to return.')
    }

    const alreadyReturnedByProduct = new Map<string, number>()
    Object.values(data.purchaseReturns)
      .filter((entry) => entry.purchaseOrderId === purchaseOrder.id)
      .forEach((purchaseReturn) => {
        purchaseReturn.items.forEach((item) => {
          alreadyReturnedByProduct.set(item.productId, (alreadyReturnedByProduct.get(item.productId) ?? 0) + item.quantity)
        })
      })

    const items = input.items.map((requested) => {
      const poItem = purchaseOrder.items.find((item) => item.productId === requested.productId)
      if (!poItem) {
        throw new Error('That product was not part of the original purchase order.')
      }
      if (requested.quantity <= 0) {
        throw new Error(`Return quantity for ${poItem.productName} must be greater than zero.`)
      }
      const accepted = poItem.receivedQuantity - poItem.rejectedQuantity
      const alreadyReturned = alreadyReturnedByProduct.get(requested.productId) ?? 0
      if (alreadyReturned + requested.quantity > accepted) {
        throw new Error(`Cannot return more than what was accepted into stock for ${poItem.productName}.`)
      }
      const product = data.products[requested.productId]
      if (product && product.stockQty < requested.quantity) {
        throw new Error(`Not enough ${poItem.productName} left in stock to return.`)
      }
      return { productId: poItem.productId, productName: poItem.productName, quantity: requested.quantity, unitCost: poItem.unitCost }
    })

    const totalValue = items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0)

    const db = getDatabaseOrThrow()
    const id = createId('preturn')
    const now = new Date().toISOString()
    const returnNumber = `PRTN-${Date.now().toString().slice(-8)}`

    const purchaseReturn: PurchaseReturnRecord = {
      id,
      returnNumber,
      purchaseOrderId: purchaseOrder.id,
      poNumber: purchaseOrder.poNumber,
      supplierId: purchaseOrder.supplierId,
      supplierName: purchaseOrder.supplierName,
      warehouseId: purchaseOrder.warehouseId,
      warehouseName: purchaseOrder.warehouseName,
      items,
      totalValue,
      reason: input.reason?.trim() ?? '',
      processedBy: currentUser.id,
      processedByName: currentUser.name,
      createdAt: now,
    }

    const nextDue = Math.max(purchaseOrder.due - totalValue, 0)
    const updates: Record<string, unknown> = {
      [`purchaseReturns/${id}`]: purchaseReturn,
      [`purchaseOrders/${purchaseOrder.id}/due`]: nextDue,
      [`purchaseOrders/${purchaseOrder.id}/billStatus`]: nextDue <= 0 ? 'paid' : 'billed',
      [`purchaseOrders/${purchaseOrder.id}/updatedAt`]: now,
    }

    items.forEach((item) => {
      const product = data.products[item.productId]
      if (!product) return
      const nextStock = product.stockQty - item.quantity
      updates[`products/${product.id}/stockQty`] = nextStock
      updates[`products/${product.id}/status`] = getProductStatus(nextStock, product.minStock)
      updates[`products/${product.id}/updatedAt`] = now
      adjustWarehouseStock(data, updates, product, purchaseOrder.warehouseId, -item.quantity)
    })

    if (totalValue > 0) {
      const debitId = createId('ledger')
      updates[`ledgerEntries/${debitId}`] = {
        id: debitId,
        date: now,
        orderId: purchaseOrder.id,
        billNumber: returnNumber,
        account: 'accounts_payable',
        accountRef: purchaseOrder.supplierId,
        description: `Purchase return ${returnNumber} for ${purchaseOrder.poNumber}`,
        debit: totalValue,
        credit: 0,
        createdAt: now,
      } satisfies LedgerEntryRecord
      const creditId = createId('ledger')
      updates[`ledgerEntries/${creditId}`] = {
        id: creditId,
        date: now,
        orderId: purchaseOrder.id,
        billNumber: returnNumber,
        account: 'inventory',
        accountRef: '',
        description: `Purchase return ${returnNumber} for ${purchaseOrder.poNumber}`,
        debit: 0,
        credit: totalValue,
        createdAt: now,
      } satisfies LedgerEntryRecord
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'purchase_return_recorded',
      'inventory',
      `Recorded purchase return ${returnNumber} against ${purchaseOrder.poNumber} (${purchaseOrder.supplierName}).`
    )
    return id
  }

  // Section 11: Customer Return → Return Inspection → Good/Bad Stock
  // Classification → Warehouse Stock Update → Customer Ledger Adjustment →
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
      syncPurchaseRequisitionForStock(data, product, nextStock, updates)
      adjustWarehouseStock(data, updates, product, order.warehouseId || product.warehouseId, quantity)
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

  // Section 17: Transfer Request → Approval → Dispatch → In Transit →
  // Receive → Stock Update. Both warehouses' stock updates automatically —
  // the source loses it on dispatch, the destination gains it on receive.
  async function createStockTransferRequest(input: StockTransferInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before requesting a stock transfer.')
    }

    const product = data.products[input.productId]
    if (!product) {
      throw new Error('Product not found.')
    }

    const fromWarehouse = data.warehouses[input.fromWarehouseId]
    const toWarehouse = data.warehouses[input.toWarehouseId]
    if (!fromWarehouse || !toWarehouse) {
      throw new Error('Select valid source and destination warehouses.')
    }

    if (fromWarehouse.id === toWarehouse.id) {
      throw new Error('Source and destination warehouses must be different.')
    }

    if (input.quantity <= 0) {
      throw new Error('Transfer quantity must be greater than zero.')
    }

    const db = getDatabaseOrThrow()
    const id = createId('transfer')
    const now = new Date().toISOString()
    const transferNumber = `STF-${Date.now().toString().slice(-8)}`

    const transfer: StockTransferRecord = {
      id,
      transferNumber,
      productId: product.id,
      productName: product.name,
      fromWarehouseId: fromWarehouse.id,
      fromWarehouseName: fromWarehouse.name,
      toWarehouseId: toWarehouse.id,
      toWarehouseName: toWarehouse.name,
      quantity: input.quantity,
      status: 'requested',
      note: input.note?.trim() ?? '',
      requestedBy: currentUser.id,
      requestedByName: currentUser.name,
      approvedBy: '',
      approvedByName: '',
      createdAt: now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/stockTransfers'), { [id]: transfer })
    await writeActivity(
      'stock_transfer_requested',
      'warehouse',
      `Requested transfer of ${input.quantity} x ${product.name} from ${fromWarehouse.name} to ${toWarehouse.name}.`
    )
    await writeNotification(
      'Stock transfer requested',
      `${transferNumber}: ${input.quantity} x ${product.name} from ${fromWarehouse.name} to ${toWarehouse.name}.`,
      'info',
      ['super_admin', 'manager']
    )

    return id
  }

  async function approveStockTransfer(transferId: string) {
    if (!data || !currentUser) {
      return
    }

    const transfer = data.stockTransfers[transferId]
    if (!transfer) {
      throw new Error('Stock transfer not found.')
    }

    if (transfer.status !== 'requested') {
      throw new Error('Only requested transfers can be approved.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`stockTransfers/${transferId}/status`]: 'approved',
      [`stockTransfers/${transferId}/approvedBy`]: currentUser.id,
      [`stockTransfers/${transferId}/approvedByName`]: currentUser.name,
      [`stockTransfers/${transferId}/updatedAt`]: new Date().toISOString(),
    })
    await writeActivity('stock_transfer_approved', 'warehouse', `Approved transfer ${transfer.transferNumber}.`)
  }

  async function rejectStockTransfer(transferId: string) {
    if (!data || !currentUser) {
      return
    }

    const transfer = data.stockTransfers[transferId]
    if (!transfer) {
      throw new Error('Stock transfer not found.')
    }

    if (transfer.status !== 'requested' && transfer.status !== 'approved') {
      throw new Error('Only a requested or approved transfer can be rejected.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`stockTransfers/${transferId}/status`]: 'rejected',
      [`stockTransfers/${transferId}/updatedAt`]: new Date().toISOString(),
    })
    await writeActivity('stock_transfer_rejected', 'warehouse', `Rejected transfer ${transfer.transferNumber}.`)
  }

  async function dispatchStockTransfer(transferId: string) {
    if (!data || !currentUser) {
      return
    }

    const transfer = data.stockTransfers[transferId]
    if (!transfer) {
      throw new Error('Stock transfer not found.')
    }

    if (transfer.status !== 'approved') {
      throw new Error('Only an approved transfer can be dispatched.')
    }

    const product = data.products[transfer.productId]
    if (!product) {
      throw new Error('Product not found.')
    }

    const sourceKey = warehouseStockKey(transfer.productId, transfer.fromWarehouseId)
    const sourceQty = data.warehouseStocks[sourceKey]?.quantity ?? 0
    if (sourceQty < transfer.quantity) {
      throw new Error(`Insufficient stock at ${transfer.fromWarehouseName} to dispatch this transfer.`)
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {
      [`stockTransfers/${transferId}/status`]: 'in-transit',
      [`stockTransfers/${transferId}/updatedAt`]: now,
    }
    adjustWarehouseStock(data, updates, product, transfer.fromWarehouseId, -transfer.quantity)

    await update(ref(db, 'erp'), updates)
    await writeActivity('stock_transfer_dispatched', 'warehouse', `Dispatched transfer ${transfer.transferNumber} — in transit.`)
  }

  async function receiveStockTransfer(transferId: string) {
    if (!data || !currentUser) {
      return
    }

    const transfer = data.stockTransfers[transferId]
    if (!transfer) {
      throw new Error('Stock transfer not found.')
    }

    if (transfer.status !== 'in-transit') {
      throw new Error('Only a transfer that is in transit can be received.')
    }

    const product = data.products[transfer.productId]
    if (!product) {
      throw new Error('Product not found.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {
      [`stockTransfers/${transferId}/status`]: 'received',
      [`stockTransfers/${transferId}/updatedAt`]: now,
    }
    adjustWarehouseStock(data, updates, product, transfer.toWarehouseId, transfer.quantity)

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'stock_transfer_received',
      'warehouse',
      `Received transfer ${transfer.transferNumber} at ${transfer.toWarehouseName}.`
    )
    await writeNotification(
      'Stock transfer completed',
      `${transfer.transferNumber}: ${transfer.quantity} x ${transfer.productName} arrived at ${transfer.toWarehouseName}.`,
      'info',
      ['super_admin', 'manager']
    )
  }

  async function cancelStockTransfer(transferId: string) {
    if (!data || !currentUser) {
      return
    }

    const transfer = data.stockTransfers[transferId]
    if (!transfer) {
      throw new Error('Stock transfer not found.')
    }

    if (transfer.status !== 'requested' && transfer.status !== 'approved') {
      throw new Error('A dispatched transfer cannot be cancelled — receive it instead.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`stockTransfers/${transferId}/status`]: 'cancelled',
      [`stockTransfers/${transferId}/updatedAt`]: new Date().toISOString(),
    })
    await writeActivity('stock_transfer_cancelled', 'warehouse', `Cancelled transfer ${transfer.transferNumber}.`)
  }

  // Section 21: Manufacturing / Production. A recipe/BOM is the standing
  // "how many raw materials per batch" definition; a production order is
  // one run of it through Production Plan → Raw Material Requirement →
  // Material Issue → Production → Quality Check → Finished Goods →
  // Warehouse Receive → Cost Calculation.
  // Sections 22-23: saving a recipe/BOM NEVER mutates or deletes a previous
  // version — "editing" one writes a brand-new record (version + 1, linked
  // back via previousVersionId) and only flips the old version's isActive
  // off. Every version a formula ever had stays queryable forever.
  async function saveBillOfMaterial(input: BillOfMaterialInput, previousVersionId?: string) {
    if (!data) {
      throw new Error('ERP data not loaded yet.')
    }

    const finishedProduct = data.products[input.finishedProductId]
    if (!finishedProduct) {
      throw new Error('Select a valid finished product.')
    }

    if (!input.components.length) {
      throw new Error('Add at least one raw material component.')
    }

    if (input.outputQuantity <= 0) {
      throw new Error('Output quantity must be greater than zero.')
    }

    const components = input.components.map((component) => {
      const rawMaterial = data.products[component.productId]
      if (!rawMaterial) {
        throw new Error('Component product not found.')
      }
      if (component.quantityPerBatch <= 0) {
        throw new Error(`Quantity for ${rawMaterial.name} must be greater than zero.`)
      }
      return {
        productId: rawMaterial.id,
        productName: rawMaterial.name,
        quantityPerBatch: component.quantityPerBatch,
        // Firebase rejects an explicit `undefined` value, so an untracked
        // composition percentage is stored as 0 rather than omitted.
        percentage: component.percentage ?? 0,
      }
    })

    const db = getDatabaseOrThrow()
    const previousVersion = previousVersionId ? data.billOfMaterials[previousVersionId] : null
    const id = createId('bom')
    const now = new Date().toISOString()

    const bom: BillOfMaterialRecord = {
      id,
      formulaCode: previousVersion?.formulaCode || `FRM-${Date.now().toString().slice(-8)}`,
      finishedProductId: finishedProduct.id,
      finishedProductName: finishedProduct.name,
      version: (previousVersion?.version ?? 0) + 1,
      previousVersionId: previousVersion?.id ?? '',
      isActive: true,
      outputQuantity: input.outputQuantity,
      expectedYieldPercentage: Math.min(Math.max(input.expectedYieldPercentage ?? 100, 0), 100),
      processingLossPercentage: Math.min(Math.max(input.processingLossPercentage ?? 0, 0), 100),
      packagingRequirement: input.packagingRequirement?.trim() ?? '',
      components,
      approvalStatus: 'draft',
      approvedBy: '',
      approvedByName: '',
      createdAt: now,
      updatedAt: now,
    }

    const updates: Record<string, unknown> = {
      [`billOfMaterials/${id}`]: bom,
    }
    if (previousVersion) {
      updates[`billOfMaterials/${previousVersion.id}/isActive`] = false
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      previousVersion ? 'bom_version_created' : 'bom_created',
      'manufacturing',
      previousVersion
        ? `Created version ${bom.version} of the ${finishedProduct.name} formula (${bom.formulaCode}) — pending approval.`
        : `Created recipe/formula ${bom.formulaCode} for ${finishedProduct.name} — pending approval.`
    )

    return id
  }

  async function approveBillOfMaterial(bomId: string) {
    if (!data || !currentUser) {
      return
    }

    const bom = data.billOfMaterials[bomId]
    if (!bom) {
      throw new Error('Recipe/formula not found.')
    }

    if (bom.approvalStatus !== 'draft') {
      throw new Error('Only a draft formula can be approved.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`billOfMaterials/${bomId}/approvalStatus`]: 'approved',
      [`billOfMaterials/${bomId}/approvedBy`]: currentUser.id,
      [`billOfMaterials/${bomId}/approvedByName`]: currentUser.name,
      [`billOfMaterials/${bomId}/updatedAt`]: new Date().toISOString(),
    })
    await writeActivity(
      'bom_approved',
      'manufacturing',
      `Approved version ${bom.version} of the ${bom.finishedProductName} formula (${bom.formulaCode}).`
    )
  }

  async function rejectBillOfMaterial(bomId: string) {
    if (!data || !currentUser) {
      return
    }

    const bom = data.billOfMaterials[bomId]
    if (!bom) {
      throw new Error('Recipe/formula not found.')
    }

    if (bom.approvalStatus !== 'draft') {
      throw new Error('Only a draft formula can be rejected.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), {
      [`billOfMaterials/${bomId}/approvalStatus`]: 'rejected',
      [`billOfMaterials/${bomId}/approvedBy`]: currentUser.id,
      [`billOfMaterials/${bomId}/approvedByName`]: currentUser.name,
      [`billOfMaterials/${bomId}/updatedAt`]: new Date().toISOString(),
    })
    await writeActivity(
      'bom_rejected',
      'manufacturing',
      `Rejected version ${bom.version} of the ${bom.finishedProductName} formula (${bom.formulaCode}).`
    )
  }

  // Deleting is only ever for cleaning up a mistaken draft — an approved or
  // historical version is never removable, matching the spec's "old
  // formula is never deleted" rule for anything that's actually been used.
  async function deleteBillOfMaterial(bomId: string) {
    if (!data) {
      return
    }

    const bom = data.billOfMaterials[bomId]
    if (!bom) {
      throw new Error('Recipe/formula not found.')
    }

    if (bom.approvalStatus !== 'draft') {
      throw new Error('Only a draft formula can be deleted — approved and historical versions are kept permanently.')
    }

    const hasProductionOrders = Object.values(data.productionOrders).some((order) => order.bomId === bomId)
    if (hasProductionOrders) {
      throw new Error('This formula has production history and cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    const updates: Record<string, unknown> = { [`billOfMaterials/${bomId}`]: null }
    if (bom.previousVersionId && data.billOfMaterials[bom.previousVersionId]) {
      updates[`billOfMaterials/${bom.previousVersionId}/isActive`] = true
    }
    await update(ref(db, 'erp'), updates)
    await writeActivity('bom_deleted', 'manufacturing', `Deleted draft formula version ${bom.version} for ${bom.finishedProductName}.`)
  }

  async function createProductionOrder(input: ProductionOrderInput) {
    if (!data || !currentUser) {
      throw new Error('You need to log in before planning production.')
    }

    const bom = data.billOfMaterials[input.bomId]
    if (!bom) {
      throw new Error('Recipe/formula not found.')
    }

    if (bom.approvalStatus !== 'approved') {
      throw new Error('Only an approved formula can be used to plan production.')
    }

    const warehouse = data.warehouses[input.warehouseId]
    if (!warehouse) {
      throw new Error('Select a valid warehouse.')
    }

    if (input.plannedBatches <= 0) {
      throw new Error('Planned batches must be greater than zero.')
    }

    const materials = bom.components.map((component) => {
      const rawMaterial = data.products[component.productId]
      return {
        productId: component.productId,
        productName: component.productName,
        requiredQty: component.quantityPerBatch * input.plannedBatches,
        issuedQty: 0,
        unitCost: rawMaterial?.purchasePrice ?? 0,
      }
    })

    const db = getDatabaseOrThrow()
    const id = createId('production')
    const now = new Date().toISOString()
    const productionNumber = `PRD-${Date.now().toString().slice(-8)}`

    const productionOrder: ProductionOrderRecord = {
      id,
      productionNumber,
      bomId: bom.id,
      finishedProductId: bom.finishedProductId,
      finishedProductName: bom.finishedProductName,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      plannedBatches: input.plannedBatches,
      plannedOutputQty: bom.outputQuantity * input.plannedBatches,
      materials,
      status: 'planned',
      qualityCheckStatus: 'pending',
      qualityCheckNote: '',
      finishedGoodsQty: 0,
      qcHoldQty: 0,
      rawMaterialCost: 0,
      packagingCost: 0,
      directLabourCost: 0,
      electricityCost: 0,
      gasFuelCost: 0,
      factoryOverheadCost: 0,
      processingCost: 0,
      otherCost: 0,
      totalCost: 0,
      unitCost: 0,
      productionLossQty: 0,
      productionLossPercentage: 0,
      varianceAlert: false,
      createdAt: now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/productionOrders'), { [id]: productionOrder })
    await writeActivity(
      'production_order_created',
      'manufacturing',
      `Planned production ${productionNumber} for ${bom.finishedProductName} (${productionOrder.plannedOutputQty} units).`
    )
    await writeNotification(
      'Production plan created',
      `${productionNumber}: ${input.plannedBatches} batch(es) of ${bom.finishedProductName} planned by ${currentUser.name}.`,
      'info',
      ['super_admin', 'manager']
    )

    return id
  }

  async function issueMaterialsForProduction(productionOrderId: string) {
    if (!data || !currentUser) {
      return
    }

    const productionOrder = data.productionOrders[productionOrderId]
    if (!productionOrder) {
      throw new Error('Production order not found.')
    }

    if (productionOrder.status !== 'planned') {
      throw new Error('Materials have already been issued for this production order.')
    }

    productionOrder.materials.forEach((material) => {
      const product = data.products[material.productId]
      if (!product || product.stockQty < material.requiredQty) {
        throw new Error(`Insufficient stock of ${material.productName} to issue for this production order.`)
      }
    })

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const issuedMaterials = productionOrder.materials.map((material) => ({ ...material, issuedQty: material.requiredQty }))

    const updates: Record<string, unknown> = {
      [`productionOrders/${productionOrderId}/status`]: 'material-issued',
      [`productionOrders/${productionOrderId}/materials`]: issuedMaterials,
      [`productionOrders/${productionOrderId}/updatedAt`]: now,
    }

    // Section 24: packaging materials are tracked as their own cost
    // component, separate from true raw materials, based on the
    // component product's stock-type classification.
    let rawMaterialCost = 0
    let packagingCost = 0
    issuedMaterials.forEach((material) => {
      const product = data.products[material.productId]
      if (!product) return
      const nextStock = product.stockQty - material.requiredQty
      updates[`products/${product.id}/stockQty`] = nextStock
      updates[`products/${product.id}/status`] = getProductStatus(nextStock, product.minStock)
      updates[`products/${product.id}/updatedAt`] = now
      syncPurchaseRequisitionForStock(data, product, nextStock, updates)
      adjustWarehouseStock(data, updates, product, productionOrder.warehouseId, -material.requiredQty)
      const cost = material.requiredQty * material.unitCost
      if (product.productType === 'Packaging Material') {
        packagingCost += cost
      } else {
        rawMaterialCost += cost
      }
    })

    const materialCost = rawMaterialCost + packagingCost
    updates[`productionOrders/${productionOrderId}/rawMaterialCost`] = rawMaterialCost
    updates[`productionOrders/${productionOrderId}/packagingCost`] = packagingCost

    if (materialCost > 0) {
      const debitId = createId('ledger')
      updates[`ledgerEntries/${debitId}`] = {
        id: debitId,
        date: now,
        orderId: productionOrderId,
        billNumber: productionOrder.productionNumber,
        account: 'wip',
        accountRef: '',
        description: `Material issue for ${productionOrder.productionNumber}`,
        debit: materialCost,
        credit: 0,
        createdAt: now,
      } satisfies LedgerEntryRecord
      const creditId = createId('ledger')
      updates[`ledgerEntries/${creditId}`] = {
        id: creditId,
        date: now,
        orderId: productionOrderId,
        billNumber: productionOrder.productionNumber,
        account: 'inventory',
        accountRef: '',
        description: `Raw material + packaging issued for ${productionOrder.productionNumber}`,
        debit: 0,
        credit: materialCost,
        createdAt: now,
      } satisfies LedgerEntryRecord
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'production_material_issued',
      'manufacturing',
      `Issued raw materials for production ${productionOrder.productionNumber}.`
    )
  }

  async function completeProduction(productionOrderId: string, input: ProductionCompleteInput) {
    if (!data || !currentUser) {
      return
    }

    const productionOrder = data.productionOrders[productionOrderId]
    if (!productionOrder) {
      throw new Error('Production order not found.')
    }

    if (productionOrder.status !== 'material-issued') {
      throw new Error('Materials must be issued before production can be completed.')
    }

    if (input.finishedGoodsQty < 0) {
      throw new Error('Finished goods quantity cannot be negative.')
    }

    const finishedProduct = data.products[productionOrder.finishedProductId]
    if (!finishedProduct) {
      throw new Error('Finished product not found.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()

    // Section 24: Total Production Cost ÷ Finished Quantity = Unit Cost,
    // with every component tracked separately.
    const directLabourCost = Math.max(input.directLabourCost ?? 0, 0)
    const electricityCost = Math.max(input.electricityCost ?? 0, 0)
    const gasFuelCost = Math.max(input.gasFuelCost ?? 0, 0)
    const factoryOverheadCost = Math.max(input.factoryOverheadCost ?? 0, 0)
    const processingCost = Math.max(input.processingCost ?? 0, 0)
    const otherCost = Math.max(input.otherCost ?? 0, 0)
    const materialCost = productionOrder.rawMaterialCost + productionOrder.packagingCost
    const conversionCost = directLabourCost + electricityCost + gasFuelCost + factoryOverheadCost + processingCost + otherCost
    const totalCost = materialCost + conversionCost
    const unitCost = input.finishedGoodsQty > 0 ? totalCost / input.finishedGoodsQty : 0

    // Section 25: Production Loss = planned output vs. actual output,
    // compared against the recipe's own standard (processingLossPercentage).
    const productionLossQty = Math.max(productionOrder.plannedOutputQty - input.finishedGoodsQty, 0)
    const productionLossPercentage =
      productionOrder.plannedOutputQty > 0 ? (productionLossQty / productionOrder.plannedOutputQty) * 100 : 0
    const bom = data.billOfMaterials[productionOrder.bomId]
    const standardLossPercentage = bom?.processingLossPercentage ?? 0
    const varianceAlert = productionLossPercentage > standardLossPercentage

    // Section 26: a failed batch never reaches sellable stock — it becomes
    // a QC Hold instead, and its cost is written off (not capitalized as
    // finished goods) until someone explicitly releases or scraps it.
    const passedQc = input.qualityCheckStatus !== 'failed'

    const updates: Record<string, unknown> = {
      [`productionOrders/${productionOrderId}/status`]: 'completed',
      [`productionOrders/${productionOrderId}/qualityCheckStatus`]: input.qualityCheckStatus,
      [`productionOrders/${productionOrderId}/qualityCheckNote`]: input.qualityCheckNote?.trim() ?? '',
      [`productionOrders/${productionOrderId}/finishedGoodsQty`]: passedQc ? input.finishedGoodsQty : 0,
      [`productionOrders/${productionOrderId}/qcHoldQty`]: passedQc ? 0 : input.finishedGoodsQty,
      [`productionOrders/${productionOrderId}/directLabourCost`]: directLabourCost,
      [`productionOrders/${productionOrderId}/electricityCost`]: electricityCost,
      [`productionOrders/${productionOrderId}/gasFuelCost`]: gasFuelCost,
      [`productionOrders/${productionOrderId}/factoryOverheadCost`]: factoryOverheadCost,
      [`productionOrders/${productionOrderId}/processingCost`]: processingCost,
      [`productionOrders/${productionOrderId}/otherCost`]: otherCost,
      [`productionOrders/${productionOrderId}/totalCost`]: totalCost,
      [`productionOrders/${productionOrderId}/unitCost`]: unitCost,
      [`productionOrders/${productionOrderId}/productionLossQty`]: productionLossQty,
      [`productionOrders/${productionOrderId}/productionLossPercentage`]: productionLossPercentage,
      [`productionOrders/${productionOrderId}/varianceAlert`]: varianceAlert,
      [`productionOrders/${productionOrderId}/updatedAt`]: now,
    }

    if (passedQc && input.finishedGoodsQty > 0) {
      const nextStock = finishedProduct.stockQty + input.finishedGoodsQty
      updates[`products/${finishedProduct.id}/stockQty`] = nextStock
      updates[`products/${finishedProduct.id}/status`] = getProductStatus(nextStock, finishedProduct.minStock)
      updates[`products/${finishedProduct.id}/updatedAt`] = now
      if (unitCost > 0) {
        updates[`products/${finishedProduct.id}/purchasePrice`] = unitCost
      }
      syncPurchaseRequisitionForStock(data, finishedProduct, nextStock, updates)
      adjustWarehouseStock(data, updates, finishedProduct, productionOrder.warehouseId, input.finishedGoodsQty)
    } else if (!passedQc && input.finishedGoodsQty > 0) {
      const holdId = createId('qchold')
      updates[`qcHolds/${holdId}`] = {
        id: holdId,
        sourceType: 'production',
        sourceId: productionOrderId,
        sourceReference: productionOrder.productionNumber,
        productId: finishedProduct.id,
        productName: finishedProduct.name,
        warehouseId: productionOrder.warehouseId,
        warehouseName: productionOrder.warehouseName,
        quantity: input.finishedGoodsQty,
        unitCost,
        reason: input.qualityCheckNote?.trim() || 'Failed quality check',
        status: 'held',
        createdAt: now,
        updatedAt: now,
      } satisfies QcHoldRecord
    }

    if (input.qc) {
      const qcId = createId('qc')
      updates[`qualityChecks/${qcId}`] = {
        id: qcId,
        sourceType: 'production',
        sourceId: productionOrderId,
        sourceReference: productionOrder.productionNumber,
        productId: finishedProduct.id,
        productName: finishedProduct.name,
        batchNumber: input.qc.batchNumber?.trim() ?? '',
        moisture: input.qc.moisture?.trim() ?? '',
        colour: input.qc.colour?.trim() ?? '',
        aroma: input.qc.aroma?.trim() ?? '',
        weight: input.qc.weight?.trim() ?? '',
        qualityGrade: input.qc.qualityGrade?.trim() ?? '',
        testResult: passedQc ? 'pass' : 'fail',
        qcOfficerName: input.qc.qcOfficerName?.trim() || currentUser.name,
        remarks: input.qc.remarks?.trim() ?? '',
        createdAt: now,
      } satisfies QualityCheckRecord
    }

    if (totalCost > 0) {
      const finishedGoodsDebitId = createId('ledger')
      updates[`ledgerEntries/${finishedGoodsDebitId}`] = {
        id: finishedGoodsDebitId,
        date: now,
        orderId: productionOrderId,
        billNumber: productionOrder.productionNumber,
        // A failed batch's cost is a loss (cogs), not an asset (inventory).
        account: passedQc ? 'inventory' : 'cogs',
        accountRef: '',
        description: passedQc
          ? `Finished goods from ${productionOrder.productionNumber}`
          : `Written off — ${productionOrder.productionNumber} failed quality check`,
        debit: totalCost,
        credit: 0,
        createdAt: now,
      } satisfies LedgerEntryRecord
      const wipCreditId = createId('ledger')
      updates[`ledgerEntries/${wipCreditId}`] = {
        id: wipCreditId,
        date: now,
        orderId: productionOrderId,
        billNumber: productionOrder.productionNumber,
        account: 'wip',
        accountRef: '',
        description: `WIP cleared for ${productionOrder.productionNumber}`,
        debit: 0,
        credit: materialCost,
        createdAt: now,
      } satisfies LedgerEntryRecord
      if (conversionCost > 0) {
        const conversionCreditId = createId('ledger')
        updates[`ledgerEntries/${conversionCreditId}`] = {
          id: conversionCreditId,
          date: now,
          orderId: productionOrderId,
          billNumber: productionOrder.productionNumber,
          account: 'cash',
          accountRef: '',
          description: `Labour, utilities, and overhead for ${productionOrder.productionNumber}`,
          debit: 0,
          credit: conversionCost,
          createdAt: now,
        } satisfies LedgerEntryRecord
      }
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity(
      'production_completed',
      'manufacturing',
      `Completed production ${productionOrder.productionNumber} — ${input.finishedGoodsQty} units of ${productionOrder.finishedProductName} (QC ${input.qualityCheckStatus}) at unit cost ${unitCost.toFixed(2)}.`
    )
    await writeNotification(
      passedQc ? 'Production completed' : 'Production failed QC — stock on hold',
      passedQc
        ? `${productionOrder.productionNumber}: ${input.finishedGoodsQty} units of ${productionOrder.finishedProductName} added to ${productionOrder.warehouseName}.`
        : `${productionOrder.productionNumber}: ${input.finishedGoodsQty} units of ${productionOrder.finishedProductName} failed QC and are on hold — not available for sale.`,
      passedQc ? 'info' : 'warning',
      ['super_admin', 'manager', 'accounts']
    )
    if (varianceAlert) {
      await writeNotification(
        'Production variance alert',
        `${productionOrder.productionNumber}: production loss ${productionLossQty} units (${productionLossPercentage.toFixed(1)}%) exceeds the standard loss of ${standardLossPercentage}% for this formula.`,
        'warning',
        ['super_admin', 'manager']
      )
    }
  }

  async function cancelProductionOrder(productionOrderId: string) {
    if (!data || !currentUser) {
      return
    }

    const productionOrder = data.productionOrders[productionOrderId]
    if (!productionOrder) {
      throw new Error('Production order not found.')
    }

    if (productionOrder.status === 'completed') {
      throw new Error('A completed production order cannot be cancelled.')
    }

    const db = getDatabaseOrThrow()
    const now = new Date().toISOString()
    const updates: Record<string, unknown> = {
      [`productionOrders/${productionOrderId}/status`]: 'cancelled',
      [`productionOrders/${productionOrderId}/updatedAt`]: now,
    }

    if (productionOrder.status === 'material-issued') {
      productionOrder.materials.forEach((material) => {
        const product = data.products[material.productId]
        if (!product || material.issuedQty <= 0) return
        const nextStock = product.stockQty + material.issuedQty
        updates[`products/${product.id}/stockQty`] = nextStock
        updates[`products/${product.id}/status`] = getProductStatus(nextStock, product.minStock)
        updates[`products/${product.id}/updatedAt`] = now
        syncPurchaseRequisitionForStock(data, product, nextStock, updates)
        adjustWarehouseStock(data, updates, product, productionOrder.warehouseId, material.issuedQty)
      })

      const entries = getActiveLedgerEntries(data.ledgerEntries, productionOrderId)
      Object.values(buildLedgerReversalEntries(entries, now)).forEach((entry) => {
        updates[`ledgerEntries/${entry.id}`] = entry
      })
    }

    await update(ref(db, 'erp'), updates)
    await writeActivity('production_order_cancelled', 'manufacturing', `Cancelled production order ${productionOrder.productionNumber}.`)
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

    const updates: Record<string, unknown> = {
      [`orders/${orderId}`]: {
        id: orderId,
        billNumber,
        customerId: customer.id,
        customerName: customer.name,
        salesPersonId: currentUser.id,
        salesPersonName: currentUser.name,
        status: 'pending',
        approvalStatus: 'pending',
        paymentStatus: due === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        priceMode,
        total,
        subtotal,
        discount,
        promotionalDiscount,
        vat,
        paid,
        due,
        warehouseId: input.warehouseId?.trim() ?? '',
        deliveryDate: input.deliveryDate,
        paymentDueDate: input.paymentDueDate?.trim() || defaultDueDate.toISOString(),
        dueReference: due > 0 ? input.dueReference || 'owner' : '',
        overdueNotified: false,
        remarks: input.remarks?.trim() ?? '',
        createdAt: orderDate,
        items: orderItems,
      },
      [`customers/${customer.id}/due`]: (data.customers[customer.id]?.due ?? 0) + due,
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

    const newRequisitions: PurchaseRequisitionRecord[] = []
    requestedByProduct.forEach((quantity, productId) => {
      const product = data.products[productId]
      const nextStock = product.stockQty - quantity
      updates[`products/${product.id}/stockQty`] = nextStock
      updates[`products/${product.id}/status`] = getProductStatus(nextStock, product.minStock)
      updates[`products/${product.id}/updatedAt`] = now
      const requisition = syncPurchaseRequisitionForStock(data, product, nextStock, updates)
      if (requisition) {
        newRequisitions.push(requisition)
      }
      adjustWarehouseStock(data, updates, product, input.warehouseId?.trim() || product.warehouseId, -quantity)
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

    for (const requisition of newRequisitions) {
      await writeNotification(
        'Purchase requisition raised',
        `${requisition.productName} stock (${requisition.currentStock}) is below its reorder level (${requisition.reorderLevel}) — a purchase requisition was auto-created.`,
        'warning',
        ['super_admin', 'manager', 'accounts']
      )
    }
  }

  async function updateOrder(orderId: string, input: OrderInput) {
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

    const updates: Record<string, unknown> = {
      [`orders/${orderId}/billNumber`]: billNumber,
      [`orders/${orderId}/customerId`]: customer.id,
      [`orders/${orderId}/customerName`]: customer.name,
      [`orders/${orderId}/paymentStatus`]: due === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      [`orders/${orderId}/priceMode`]: priceMode,
      [`orders/${orderId}/total`]: total,
      [`orders/${orderId}/subtotal`]: subtotal,
      [`orders/${orderId}/discount`]: discount,
      [`orders/${orderId}/promotionalDiscount`]: promotionalDiscount,
      [`orders/${orderId}/vat`]: vat,
      [`orders/${orderId}/paid`]: paid,
      [`orders/${orderId}/due`]: due,
      [`orders/${orderId}/warehouseId`]: input.warehouseId?.trim() ?? '',
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

    const previousWarehouseId = order.warehouseId || ''
    const nextWarehouseId = input.warehouseId?.trim() || ''
    affectedProductIds.forEach((productId) => {
      const product = data.products[productId]
      const previousQty = previousByProduct.get(productId) ?? 0
      const requestedQty = requestedByProduct.get(productId) ?? 0
      const nextStock = product.stockQty + previousQty - requestedQty
      updates[`products/${product.id}/stockQty`] = nextStock
      updates[`products/${product.id}/status`] = getProductStatus(nextStock, product.minStock)
      updates[`products/${product.id}/updatedAt`] = now
      syncPurchaseRequisitionForStock(data, product, nextStock, updates)
      adjustWarehouseStock(data, updates, product, previousWarehouseId || product.warehouseId, previousQty)
      adjustWarehouseStock(data, updates, product, nextWarehouseId || product.warehouseId, -requestedQty)
    })

    await update(ref(db, 'erp'), updates)

    await writeActivity('order_updated', 'sales', `Edited order ${order.billNumber} for ${customer.name}.`)
    await writeNotification(
      'Sales order edited',
      `Order ${order.billNumber} was edited by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['super_admin', 'sales_officer', 'accounts']
    )
  }

  async function cancelOrder(orderId: string) {
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
      syncPurchaseRequisitionForStock(data, product, nextStock, updates)
      adjustWarehouseStock(data, updates, product, order.warehouseId || product.warehouseId, quantity)
    })

    await update(ref(db, 'erp'), updates)

    await writeActivity('order_cancelled', 'sales', `Cancelled order ${order.billNumber} for ${order.customerName}.`)
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

    if (status === 'shipped') {
      const hasCourier = Object.values(data.couriers).some(
        (courier) => courier.orderId === order.id || courier.billNumber === order.billNumber
      )

      if (!hasCourier) {
        const courierId = createId('courier')
        const now = new Date().toISOString()
        const courier: CourierRecord = {
          id: courierId,
          orderId: order.id,
          customerId: order.customerId,
          customerName: order.customerName,
          billNumber: order.billNumber,
          courierName: '',
          productDescription: order.items.map((item) => `${item.productName} x${item.quantity}`).join(', '),
          quantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
          codAmount: order.dueReference === 'courier' ? order.due : 0,
          sentDate: now,
          status: 'in-transit',
          createdAt: now,
          updatedAt: now,
        }

        await update(ref(db, 'erp/couriers'), { [courierId]: courier })
        await writeActivity('courier_created', 'courier', `Auto-created courier shipment for order ${order.billNumber}.`)
        await writeNotification(
          'Shipment created',
          `Order ${order.billNumber} was marked shipped — add the courier service to complete the shipment record.`,
          'info',
          ['super_admin', 'sales_officer']
        )
      }
    }
  }

  // Sales Approval step: a sales officer's order sits at approvalStatus
  // "pending" until someone with orders:approve signs off. Rejecting an
  // order cancels it outright — stock and ledger entries are reversed by
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

  async function createTask(input: TaskInput) {
    if (!data || !currentUser) {
      return
    }

    const db = getDatabaseOrThrow()
    const assignee = data.users[input.assigneeId]
    if (!assignee) {
      throw new Error('Assignee not found.')
    }

    const taskId = createId('task')
    const now = new Date().toISOString()

    await update(ref(db, 'erp/tasks'), {
      [taskId]: {
        id: taskId,
        title: input.title,
        description: input.description,
        module: input.module,
        status: 'pending',
        priority: input.priority,
        assigneeId: assignee.id,
        assigneeName: assignee.name,
        dueDate: input.dueDate,
        createdBy: currentUser.id,
        createdAt: now,
      },
    })

    await writeActivity('task_created', 'operations', `Assigned "${input.title}" to ${assignee.name}.`)
    await writeNotification(
      'New task assigned',
      `Task "${input.title}" was assigned to ${assignee.name} by ${currentUser?.name ?? 'Admin'}.`,
      'info',
      ['super_admin', assignee.roleId]
    )
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

  async function updateTaskStatus(taskId: string, status: TaskRecord['status']) {
    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/tasks/${taskId}`), { status })
    await writeActivity('task_updated', 'operations', `Updated task ${taskId} to ${status}.`)
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
    const expense = {
      id,
      category,
      amount: input.amount,
      note: input.note?.trim() ?? '',
      date: expenseDate,
      paymentMethod,
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
  async function reverseJournalEntry(journalEntryId: string) {
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
    await writeActivity('journal_entry_reversed', 'finance', `Reversed journal entry ${journalEntry.journalNumber}.`)
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

  async function saveSeller(input: SellerInput, sellerId?: string) {
    if (!data) {
      return
    }

    const name = input.name.trim()
    if (!name) {
      throw new Error('Seller name is required.')
    }

    const phone = input.phone.trim()
    if (!phone) {
      throw new Error('Seller phone number is required.')
    }

    const db = getDatabaseOrThrow()
    const existingSeller = sellerId ? data.sellers[sellerId] : null
    const id = existingSeller?.id ?? createId('seller')
    const now = new Date().toISOString()
    const seller = {
      id,
      name,
      phone,
      location: input.location?.trim() ?? '',
      notes: input.notes?.trim() ?? '',
      createdAt: existingSeller?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/sellers'), { [id]: seller })
    await writeActivity(
      existingSeller ? 'seller_updated' : 'seller_created',
      'sellers',
      existingSeller ? `Updated ${seller.name} seller details.` : `Added seller ${seller.name}.`
    )
  }

  async function deleteSeller(sellerId: string) {
    if (!data) {
      return
    }

    const seller = data.sellers[sellerId]
    if (!seller) {
      throw new Error('Seller not found.')
    }

    const hasTransactions = Object.values(data.sellerTransactions).some(
      (transaction) => transaction.sellerId === sellerId
    )
    if (hasTransactions) {
      throw new Error('Sellers with ledger history cannot be deleted.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`sellers/${sellerId}`]: null })
    await writeActivity('seller_deleted', 'sellers', `Deleted seller ${seller.name}.`)
  }

  async function recordSellerTransaction(input: SellerTransactionInput) {
    if (!data) {
      return
    }

    const seller = data.sellers[input.sellerId]
    if (!seller) {
      throw new Error('Seller not found.')
    }

    const db = getDatabaseOrThrow()
    const transactionId = createId('seller_txn')
    const now = new Date().toISOString()

    await update(ref(db, 'erp/sellerTransactions'), {
      [transactionId]: {
        id: transactionId,
        sellerId: seller.id,
        sellerName: seller.name,
        date: input.date?.trim() || now,
        productName: input.productName?.trim() ?? '',
        quantity: Math.max(input.quantity ?? 0, 0),
        takenValue: Math.max(input.takenValue ?? 0, 0),
        cashGiven: Math.max(input.cashGiven ?? 0, 0),
        givenValue: Math.max(input.givenValue ?? 0, 0),
        cashReceived: Math.max(input.cashReceived ?? 0, 0),
        goodsBroughtDescription: input.goodsBroughtDescription?.trim() ?? '',
        iReceiveAmount: Math.max(input.iReceiveAmount ?? 0, 0),
        theyReceiveAmount: Math.max(input.theyReceiveAmount ?? 0, 0),
        createdAt: now,
      },
    })

    await writeActivity('seller_transaction_recorded', 'sellers', `Recorded a ledger entry for ${seller.name}.`)
  }

  async function deleteSellerTransaction(transactionId: string) {
    if (!data) {
      return
    }

    const transaction = data.sellerTransactions[transactionId]
    if (!transaction) {
      throw new Error('Transaction not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`sellerTransactions/${transactionId}`]: null })
    await writeActivity(
      'seller_transaction_deleted',
      'sellers',
      `Removed a ledger entry for ${transaction.sellerName}.`
    )
  }

  async function saveCourier(input: CourierInput, courierId?: string) {
    if (!data) {
      return
    }

    const customerName = input.customerName.trim()
    if (!customerName) {
      throw new Error('Customer name is required.')
    }

    const courierName = input.courierName.trim()
    if (!courierName) {
      throw new Error('Courier name is required.')
    }

    const db = getDatabaseOrThrow()
    const existingCourier = courierId ? data.couriers[courierId] : null
    const id = existingCourier?.id ?? createId('courier')
    const now = new Date().toISOString()
    const courier = {
      id,
      orderId: input.orderId ?? existingCourier?.orderId ?? '',
      customerId: input.customerId ?? existingCourier?.customerId ?? '',
      customerName,
      billNumber: input.billNumber?.trim() || existingCourier?.billNumber || `SHP-${Date.now().toString().slice(-8)}`,
      courierName,
      productDescription: input.productDescription.trim(),
      quantity: Math.max(input.quantity ?? 0, 0),
      codAmount: Math.max(input.codAmount ?? 0, 0),
      sentDate: input.sentDate?.trim() || existingCourier?.sentDate || now,
      status: existingCourier?.status ?? 'in-transit',
      createdAt: existingCourier?.createdAt ?? now,
      updatedAt: now,
    }

    await update(ref(db, 'erp/couriers'), { [id]: courier })
    await writeActivity(
      existingCourier ? 'courier_updated' : 'courier_created',
      'courier',
      existingCourier
        ? `Updated courier shipment for ${courier.customerName}.`
        : `Sent ${courier.productDescription} to ${courier.customerName} via ${courier.courierName}.`
    )
  }

  async function updateCourierStatus(courierId: string, status: CourierRecord['status']) {
    if (!data) {
      return
    }

    const courier = data.couriers[courierId]
    if (!courier) {
      return
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, `erp/couriers/${courierId}`), { status, updatedAt: new Date().toISOString() })
    await writeActivity('courier_status_changed', 'courier', `Marked ${courier.customerName}'s shipment as ${status}.`)

    if (status === 'delivered' || status === 'cod-collected') {
      await writeNotification(
        'Courier update',
        `${courier.customerName}'s shipment (${courier.billNumber}) is now ${status.replace('-', ' ')}.`,
        'info',
        ['super_admin', 'sales_officer', 'accounts']
      )
    }
  }

  async function deleteCourier(courierId: string) {
    if (!data) {
      return
    }

    const courier = data.couriers[courierId]
    if (!courier) {
      throw new Error('Courier record not found.')
    }

    const db = getDatabaseOrThrow()
    await update(ref(db, 'erp'), { [`couriers/${courierId}`]: null })
    await writeActivity('courier_deleted', 'courier', `Deleted courier shipment for ${courier.customerName}.`)
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
      saveProduct,
      deleteProduct,
      createStockAdjustmentRequest,
      approveStockAdjustment,
      rejectStockAdjustment,
      createStockCount,
      saveCustomer,
      deleteCustomer,
      saveSupplier,
      deleteSupplier,
      saveWarehouse,
      deleteWarehouse,
      recordPurchase,
      dismissPurchaseRequisition,
      createPurchaseOrder,
      receivePurchaseOrder,
      cancelPurchaseOrder,
      recordSupplierPayment,
      createPurchaseReturn,
      createSalesReturn,
      recordCollection,
      createStockTransferRequest,
      approveStockTransfer,
      rejectStockTransfer,
      dispatchStockTransfer,
      receiveStockTransfer,
      cancelStockTransfer,
      releaseQcHold,
      scrapQcHold,
      saveBillOfMaterial,
      approveBillOfMaterial,
      rejectBillOfMaterial,
      deleteBillOfMaterial,
      createProductionOrder,
      issueMaterialsForProduction,
      completeProduction,
      cancelProductionOrder,
      createOrder,
      updateOrder,
      cancelOrder,
      updateOrderStatus,
      updateOrderApproval,
      createTask,
      updateTaskStatus,
      markNotificationRead,
      markAllNotificationsRead,
      saveExpense,
      saveInvestor,
      deleteExpense,
      saveChartOfAccount,
      deleteChartOfAccount,
      seedStandardChartOfAccounts,
      createJournalEntry,
      reverseJournalEntry,
      saveBankAccount,
      deleteBankAccount,
      recordBankTransaction,
      saveSeller,
      deleteSeller,
      recordSellerTransaction,
      deleteSellerTransaction,
      saveCourier,
      updateCourierStatus,
      deleteCourier,
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

// Sections 55-58: Managing Director / Finance / Inventory / Sales Dashboards.
//
// These read-only snapshots sit on top of the modules that already own the
// underlying data (Accounting, Finance, Manufacturing, Stock, Sales) rather
// than introducing a parallel source of truth. The Chart-of-Accounts balance
// math (accountBalance/periodTotal) intentionally mirrors the Trial Balance /
// Balance Sheet / Cash Flow tabs in the Accounting page (src/app/admin/
// accounting/page.tsx) so a dashboard figure always agrees with the books —
// it's re-declared here (rather than imported) because that file is a page
// module, not a shared library. The same primitives are exported for reuse
// by the Section 59 Management Reports sources (src/lib/erp/reportSources.ts)
// so the Reports module's Trial Balance / Ledger / Cash Book / etc. always
// agree with these dashboards and the Accounting page too.
import type {
  AccountType,
  BatchRecord,
  ChartOfAccountRecord,
  ERPData,
  LedgerEntryRecord,
  OrderRecord,
  ProductRecord,
  SalesTargetRecord,
} from '@/lib/erp/types'
import { computeCustomerTotals, isSameCalendarDay, toArray } from '@/lib/erp/utils'

export const DEBIT_NORMAL: Record<AccountType, boolean> = {
  asset: true,
  expense: true,
  liability: false,
  equity: false,
  revenue: false,
}

export function resolveAccountForEntry(entry: LedgerEntryRecord, accounts: ChartOfAccountRecord[]) {
  if (entry.account === 'manual') return accounts.find((account) => account.id === entry.accountRef)
  return accounts.find((account) => account.ledgerAccount === entry.account)
}

export function accountMovement(
  accountId: string,
  entries: LedgerEntryRecord[],
  accounts: ChartOfAccountRecord[],
  matchesDate: (date: string) => boolean
) {
  let debit = 0
  let credit = 0
  entries.forEach((entry) => {
    if (!matchesDate(entry.date)) return
    if (resolveAccountForEntry(entry, accounts)?.id !== accountId) return
    debit += entry.debit
    credit += entry.credit
  })
  return { debit, credit }
}
const movement = accountMovement

// Signed balance using the account's normal-balance side (Section 28) — see
// the identical helper in the Accounting page.
export function signedMovement(account: ChartOfAccountRecord, debit: number, credit: number) {
  return DEBIT_NORMAL[account.type] ? debit - credit : credit - debit
}

// Point-in-time balance (opening balance + every movement up to `asOf`).
export function balanceAsOf(
  account: ChartOfAccountRecord | undefined,
  entries: LedgerEntryRecord[],
  accounts: ChartOfAccountRecord[],
  asOf: (date: string) => boolean = () => true
) {
  if (!account) return 0
  const { debit, credit } = movement(account.id, entries, accounts, asOf)
  return account.openingBalance + signedMovement(account, debit, credit)
}

// Net movement within a period only (no opening balance) — used for
// Revenue/Expense (P&L) accounts and for a period's cash in/out.
export function periodTotal(
  account: ChartOfAccountRecord | undefined,
  entries: LedgerEntryRecord[],
  accounts: ChartOfAccountRecord[],
  inPeriod: (date: string) => boolean
) {
  if (!account) return 0
  const { debit, credit } = movement(account.id, entries, accounts, inPeriod)
  return signedMovement(account, debit, credit)
}

export function monthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function yearStart(date = new Date()) {
  return new Date(date.getFullYear(), 0, 1)
}

function atOrAfter(boundary: Date) {
  const boundaryTime = boundary.getTime()
  return (date: string) => new Date(date).getTime() >= boundaryTime
}

// ---- Accounting position (Cash / Bank / Receivable / Payable) -----------
// Bank Balance combines the single system "Bank" account (1002, used by
// e.g. bank-method expense payments) with every named Bank Account's own
// manual Chart of Accounts row (Section 35) — see bankAccountBalance in the
// Accounting page for the per-account version of this.
export function buildAccountingPosition(data: ERPData | null, asOf: (date: string) => boolean = () => true) {
  const accounts = toArray(data?.chartOfAccounts)
  const entries = toArray(data?.ledgerEntries)
  const activeBankAccounts = toArray(data?.bankAccounts).filter((account) => account.status === 'active')

  const cashBalance = balanceAsOf(
    accounts.find((account) => account.ledgerAccount === 'cash'),
    entries,
    accounts,
    asOf
  )
  const systemBankBalance = balanceAsOf(
    accounts.find((account) => account.ledgerAccount === 'bank'),
    entries,
    accounts,
    asOf
  )
  const namedBankBalance = activeBankAccounts.reduce(
    (sum, bankAccount) =>
      sum + balanceAsOf(accounts.find((account) => account.id === bankAccount.chartAccountId), entries, accounts, asOf),
    0
  )
  const totalReceivable = balanceAsOf(
    accounts.find((account) => account.ledgerAccount === 'customer'),
    entries,
    accounts,
    asOf
  )
  const totalPayable = balanceAsOf(
    accounts.find((account) => account.ledgerAccount === 'accounts_payable'),
    entries,
    accounts,
    asOf
  )

  return {
    cashBalance,
    bankBalance: systemBankBalance + namedBankBalance,
    totalReceivable,
    totalPayable,
  }
}

// ---- Profit & Loss for an arbitrary period -------------------------------
export function buildProfitAndLoss(data: ERPData | null, inPeriod: (date: string) => boolean) {
  const accounts = toArray(data?.chartOfAccounts)
  const entries = toArray(data?.ledgerEntries)

  const totalRevenue = accounts
    .filter((account) => account.type === 'revenue')
    .reduce((sum, account) => sum + periodTotal(account, entries, accounts, inPeriod), 0)
  const cogs = periodTotal(accounts.find((account) => account.ledgerAccount === 'cogs'), entries, accounts, inPeriod)
  const grossProfit = totalRevenue - cogs
  const totalOpex = accounts
    .filter((account) => account.type === 'expense' && account.ledgerAccount !== 'cogs')
    .reduce((sum, account) => sum + periodTotal(account, entries, accounts, inPeriod), 0)
  const netProfit = grossProfit - totalOpex

  return { totalRevenue, cogs, grossProfit, totalOpex, netProfit }
}

// Net cash movement (in - out) across every Cash/Bank account for a period.
function cashFlowForPeriod(data: ERPData | null, inPeriod: (date: string) => boolean) {
  const accounts = toArray(data?.chartOfAccounts)
  const entries = toArray(data?.ledgerEntries)
  const activeBankAccounts = toArray(data?.bankAccounts).filter((account) => account.status === 'active')

  const cashAndBankAccounts = [
    accounts.find((account) => account.ledgerAccount === 'cash'),
    accounts.find((account) => account.ledgerAccount === 'bank'),
    ...activeBankAccounts.map((bankAccount) => accounts.find((account) => account.id === bankAccount.chartAccountId)),
  ].filter((account): account is ChartOfAccountRecord => Boolean(account))

  return cashAndBankAccounts.reduce((sum, account) => sum + periodTotal(account, entries, accounts, inPeriod), 0)
}

// ---- Section 56: Finance Dashboard ---------------------------------------
export function buildFinanceDashboard(data: ERPData | null) {
  const inMonth = atOrAfter(monthStart())
  const { cashBalance, bankBalance, totalReceivable, totalPayable } = buildAccountingPosition(data)

  const collections = toArray(data?.collections)
  const todayCollection = collections
    .filter((collection) => isSameCalendarDay(collection.collectionDate))
    .reduce((sum, collection) => sum + collection.amount, 0)

  const postedExpenses = toArray(data?.expenses).filter((expense) => expense.approvalStatus !== 'rejected')
  const todayExpense = postedExpenses
    .filter((expense) => isSameCalendarDay(expense.date))
    .reduce((sum, expense) => sum + expense.amount, 0)
  const monthlyExpense = postedExpenses
    .filter((expense) => inMonth(expense.date))
    .reduce((sum, expense) => sum + expense.amount, 0)

  const { netProfit } = buildProfitAndLoss(data, inMonth)
  const cashFlow = cashFlowForPeriod(data, inMonth)

  const duePayment = toArray(data?.purchaseOrders)
    .filter((purchaseOrder) => purchaseOrder.status !== 'cancelled')
    .reduce((sum, purchaseOrder) => sum + purchaseOrder.due, 0)

  return {
    cashBalance,
    bankBalance,
    totalReceivable,
    totalPayable,
    todayCollection,
    todayExpense,
    monthlyExpense,
    profit: netProfit,
    cashFlow,
    duePayment,
  }
}

// ---- Section 57: Inventory Dashboard -------------------------------------
function stockValue(product: ProductRecord) {
  return product.stockQty * product.purchasePrice
}

function isProductType(product: ProductRecord, needle: string) {
  return (product.productType ?? '').toLowerCase().includes(needle)
}

const NEAR_EXPIRY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

function batchExpiryStatus(batch: BatchRecord, now: number) {
  if (!batch.expiryDate) return 'none' as const
  const expiryTime = new Date(batch.expiryDate).getTime()
  if (expiryTime < now) return 'expired' as const
  if (expiryTime - now <= NEAR_EXPIRY_WINDOW_MS) return 'near-expiry' as const
  return 'ok' as const
}

export function buildInventoryDashboard(data: ERPData | null) {
  const products = toArray(data?.products)
  const warehouses = toArray(data?.warehouses)
  const warehouseStocks = toArray(data?.warehouseStocks)
  const batches = toArray(data?.batches).filter((batch) => batch.quantity > 0)
  const now = Date.now()

  const totalStockValue = products.reduce((sum, product) => sum + stockValue(product), 0)
  const rawMaterialValue = products.filter((product) => isProductType(product, 'raw material')).reduce((sum, product) => sum + stockValue(product), 0)
  const finishedGoodsValue = products.filter((product) => isProductType(product, 'finished goods')).reduce((sum, product) => sum + stockValue(product), 0)
  const damagedValue = products.filter((product) => isProductType(product, 'damaged')).reduce((sum, product) => sum + stockValue(product), 0)

  const lowStockProducts = products.filter((product) => product.stockQty > 0 && product.stockQty <= product.minStock)
  const outOfStockProducts = products.filter((product) => product.stockQty <= 0)

  const nearExpiryBatches = batches
    .filter((batch) => batchExpiryStatus(batch, now) === 'near-expiry')
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
  const expiredBatches = batches
    .filter((batch) => batchExpiryStatus(batch, now) === 'expired')
    .sort((a, b) => new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime())

  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]))
  const productById = new Map(products.map((product) => [product.id, product]))

  type WarehouseRow = { warehouseId: string; warehouseName: string; quantity: number; value: number }
  const warehouseRows = new Map<string, WarehouseRow>()
  const addWarehouseRow = (warehouseId: string, quantity: number, value: number) => {
    const key = warehouseId || 'unassigned'
    const row = warehouseRows.get(key) ?? {
      warehouseId: key,
      warehouseName: warehouseById.get(warehouseId)?.name ?? 'Unassigned',
      quantity: 0,
      value: 0,
    }
    row.quantity += quantity
    row.value += value
    warehouseRows.set(key, row)
  }
  if (warehouseStocks.length) {
    warehouseStocks.forEach((stock) => {
      const value = (productById.get(stock.productId)?.purchasePrice ?? 0) * stock.quantity
      addWarehouseRow(stock.warehouseId, stock.quantity, value)
    })
  } else {
    products.forEach((product) => addWarehouseRow(product.warehouseId, product.stockQty, stockValue(product)))
  }
  const warehouseWiseStock = Array.from(warehouseRows.values()).sort((a, b) => b.value - a.value)

  const productWiseStock = [...products].sort((a, b) => stockValue(b) - stockValue(a))

  const batchWiseStock = [...batches].sort((a, b) => {
    const left = a.expiryDate ? new Date(a.expiryDate).getTime() : Number.POSITIVE_INFINITY
    const right = b.expiryDate ? new Date(b.expiryDate).getTime() : Number.POSITIVE_INFINITY
    return left - right
  })

  return {
    totalStockValue,
    rawMaterialValue,
    finishedGoodsValue,
    damagedValue,
    lowStockCount: lowStockProducts.length,
    outOfStockCount: outOfStockProducts.length,
    lowStockProducts,
    outOfStockProducts,
    nearExpiryBatches,
    expiredBatches,
    warehouseWiseStock,
    productWiseStock,
    batchWiseStock,
  }
}

// ---- Section 55: Managing Director Dashboard (extras) --------------------
// Supplements buildDashboardSnapshot (Today's Sales, Top Products, Low
// Stock, order/notification feeds already built there) with the rest of
// Section 55's bullet list — everything that needs the accounting,
// manufacturing, or target data those existing helpers don't touch.
export function buildManagingDirectorExtras(data: ERPData | null) {
  const now = new Date()
  const inMonth = atOrAfter(monthStart(now))
  const inYear = atOrAfter(yearStart(now))

  const orders = toArray(data?.orders)
  const monthlySales = orders.filter((order) => inMonth(order.createdAt)).reduce((sum, order) => sum + order.total, 0)
  const yearlySales = orders.filter((order) => inYear(order.createdAt)).reduce((sum, order) => sum + order.total, 0)
  const outstanding = orders
    .filter((order) => order.due > 0 && new Date(order.paymentDueDate).getTime() < now.getTime())
    .reduce((sum, order) => sum + order.due, 0)

  const collection = toArray(data?.collections)
    .filter((entry) => inMonth(entry.collectionDate))
    .reduce((sum, entry) => sum + entry.amount, 0)

  const purchase = toArray(data?.purchases)
    .filter((entry) => inMonth(entry.createdAt))
    .reduce((sum, entry) => sum + entry.total, 0)

  const products = toArray(data?.products)
  const inventoryValue = products.reduce((sum, product) => sum + stockValue(product), 0)

  const productionOrdersThisMonth = toArray(data?.productionOrders).filter(
    (order) => order.status === 'completed' && inMonth(order.updatedAt)
  )
  const production = {
    orders: productionOrdersThisMonth.length,
    finishedGoodsQty: productionOrdersThisMonth.reduce((sum, order) => sum + order.finishedGoodsQty, 0),
  }
  const productionVariance = {
    lossQty: productionOrdersThisMonth.reduce((sum, order) => sum + order.productionLossQty, 0),
    alertCount: productionOrdersThisMonth.filter((order) => order.varianceAlert).length,
  }

  const { cashBalance, bankBalance, totalReceivable, totalPayable } = buildAccountingPosition(data)
  const { grossProfit, netProfit } = buildProfitAndLoss(data, inMonth)

  const expense = toArray(data?.expenses)
    .filter((entry) => entry.approvalStatus !== 'rejected' && inMonth(entry.date))
    .reduce((sum, entry) => sum + entry.amount, 0)

  const customerTotals = computeCustomerTotals(data)
  const topCustomers = toArray(data?.customers)
    .map((customer) => ({ id: customer.id, name: customer.name, totalSpend: customerTotals[customer.id] ?? 0, due: customer.due }))
    .filter((customer) => customer.totalSpend > 0)
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 5)

  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const salesTarget = toArray(data?.salesTargets)
    .filter((target) => target.period === periodKey)
    .reduce((sum, target) => sum + target.targetAmount, 0)
  const achievementPercent = salesTarget > 0 ? (monthlySales / salesTarget) * 100 : 0

  const nearExpiryBatches = toArray(data?.batches)
    .filter((batch) => batch.quantity > 0 && batchExpiryStatus(batch, now.getTime()) === 'near-expiry')
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())

  return {
    monthlySales,
    yearlySales,
    collection,
    outstanding,
    purchase,
    inventoryValue,
    production,
    grossProfit,
    netProfit,
    expense,
    cash: cashBalance,
    bank: bankBalance,
    receivable: totalReceivable,
    payable: totalPayable,
    topCustomers,
    salesTarget,
    achievementPercent,
    nearExpiryBatches,
    productionVariance,
  }
}

// ---- Section 58: Sales Dashboard -----------------------------------------
// Exported so the Section 59 "Target vs Achievement" report source
// (src/lib/erp/reportSources.ts) computes achievement the same way this
// dashboard does, for any period — not just the current month.
export function achievedAmountFor(target: SalesTargetRecord, orders: OrderRecordLite[], customerById: Map<string, CustomerLite>) {
  if (target.entityType === 'sales-officer') {
    return orders.filter((order) => order.salesPersonId === target.entityId).reduce((sum, order) => sum + order.total, 0)
  }
  if (target.entityType === 'distributor') {
    return orders.filter((order) => order.customerId === target.entityId).reduce((sum, order) => sum + order.total, 0)
  }
  // 'territory' / 'sales-area' targets key off the matching free-text field
  // on CustomerRecord — see the SalesTargetEntityType comment in types.ts.
  return orders
    .filter((order) => {
      const customer = customerById.get(order.customerId)
      if (!customer) return false
      return target.entityType === 'territory' ? customer.territory === target.entityId : customer.salesArea === target.entityId
    })
    .reduce((sum, order) => sum + order.total, 0)
}

// Narrow shapes so this file doesn't need to import the full OrderRecord/
// CustomerRecord types just for the two fields each helper above touches.
type OrderRecordLite = { customerId: string; salesPersonId: string; total: number }
type CustomerLite = { territory?: string; salesArea?: string }

export function buildSalesDashboard(data: ERPData | null) {
  const now = new Date()
  const orders = toArray(data?.orders).filter((order) => order.status !== 'cancelled')
  const customers = toArray(data?.customers)
  const products = toArray(data?.products)
  const customerById = new Map(customers.map((customer) => [customer.id, customer]))
  const productById = new Map(products.map((product) => [product.id, product]))

  const dailySales = orders.filter((order) => isSameCalendarDay(order.createdAt)).reduce((sum, order) => sum + order.total, 0)

  const thisMonthStart = monthStart(now)
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const inThisMonth = atOrAfter(thisMonthStart)
  const inPreviousMonth = (date: string) => {
    const time = new Date(date).getTime()
    return time >= previousMonthStart.getTime() && time < thisMonthStart.getTime()
  }

  const monthOrders = orders.filter((order) => inThisMonth(order.createdAt))
  const previousMonthOrders = orders.filter((order) => inPreviousMonth(order.createdAt))
  const monthlySales = monthOrders.reduce((sum, order) => sum + order.total, 0)
  const previousMonthSales = previousMonthOrders.reduce((sum, order) => sum + order.total, 0)
  const salesGrowthPercent =
    previousMonthSales > 0 ? ((monthlySales - previousMonthSales) / previousMonthSales) * 100 : monthlySales > 0 ? 100 : 0

  type NamedTotal = { key: string; label: string; total: number; orders: number }
  function aggregateOrders(keyOf: (order: OrderRecord) => string | undefined): NamedTotal[] {
    const rows = new Map<string, NamedTotal>()
    monthOrders.forEach((order) => {
      const label = keyOf(order) || 'Unassigned'
      const row = rows.get(label) ?? { key: label, label, total: 0, orders: 0 }
      row.total += order.total
      row.orders += 1
      rows.set(label, row)
    })
    return Array.from(rows.values()).sort((a, b) => b.total - a.total)
  }

  const territoryWiseSales = aggregateOrders((order) => customerById.get(order.customerId)?.territory)
  const salesOfficerWiseSales = aggregateOrders((order) => order.salesPersonName)
  const dealerWiseSales = aggregateOrders((order) => {
    const customer = customerById.get(order.customerId)
    return customer?.customerType === 'dealer' ? customer.name : undefined
  }).filter((row) => row.key !== 'Unassigned')

  type ProductTotal = { productId: string; productName: string; quantity: number; revenue: number }
  type CategoryTotal = { category: string; quantity: number; revenue: number }
  const productTotals = new Map<string, ProductTotal>()
  const categoryTotals = new Map<string, CategoryTotal>()
  monthOrders.forEach((order) => {
    order.items.forEach((item) => {
      const productRow = productTotals.get(item.productId) ?? {
        productId: item.productId,
        productName: item.productName,
        quantity: 0,
        revenue: 0,
      }
      productRow.quantity += item.quantity
      productRow.revenue += item.quantity * item.unitPrice
      productTotals.set(item.productId, productRow)

      const category = productById.get(item.productId)?.category || 'Uncategorized'
      const categoryRow = categoryTotals.get(category) ?? { category, quantity: 0, revenue: 0 }
      categoryRow.quantity += item.quantity
      categoryRow.revenue += item.quantity * item.unitPrice
      categoryTotals.set(category, categoryRow)
    })
  })
  const productWiseSales = Array.from(productTotals.values()).sort((a, b) => b.revenue - a.revenue)
  const categoryWiseSales = Array.from(categoryTotals.values()).sort((a, b) => b.revenue - a.revenue)

  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const targetVsAchievement = toArray(data?.salesTargets)
    .filter((target) => target.period === periodKey)
    .map((target) => {
      const achievedAmount = achievedAmountFor(target, monthOrders, customerById)
      return {
        id: target.id,
        entityType: target.entityType,
        entityName: target.entityName,
        targetAmount: target.targetAmount,
        achievedAmount,
        achievementPercent: target.targetAmount > 0 ? (achievedAmount / target.targetAmount) * 100 : 0,
      }
    })
    .sort((a, b) => b.targetAmount - a.targetAmount)

  return {
    dailySales,
    monthlySales,
    previousMonthSales,
    salesGrowthPercent,
    territoryWiseSales,
    salesOfficerWiseSales,
    dealerWiseSales,
    productWiseSales,
    categoryWiseSales,
    targetVsAchievement,
  }
}

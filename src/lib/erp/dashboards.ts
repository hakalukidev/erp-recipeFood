// Sections 55-58: Managing Director / Finance / Inventory / Sales Dashboards.
//
// These read-only snapshots sit on top of the modules that already own the
// underlying data (Finance, Stock, Sales) rather than
// introducing a parallel source of truth. The Chart-of-Accounts balance math
// (accountBalance/periodTotal) mirrors how the Automatic Accounting Engine
// posts ledger entries so a dashboard figure always agrees with the books.
import type {
  AccountType,
  BatchRecord,
  BudgetRecord,
  ChartOfAccountRecord,
  ERPData,
  ExpenseRecord,
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
    productWiseStock,
    batchWiseStock,
  }
}

// ---- Section 55: Managing Director Dashboard (extras) --------------------
// Supplements buildDashboardSnapshot (Today's Sales, Top Products, Low
// Stock, order/notification feeds already built there) with the rest of
// Section 55's bullet list — everything that needs the accounting or
// target data those existing helpers don't touch.
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
  }
}

// ---- Section 58: Sales Dashboard -----------------------------------------
// Exported so "Target vs Achievement" figures can be computed the same way
// this dashboard does, for any period — not just the current month.
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

// ---- Section 61: Real-time Business Intelligence (Management Dashboard) --
// Alerts grouped Critical/Warning/Normal, same buckets and examples the
// spec lists. Re-checked live off the current snapshot every render, same
// "no stored alert state, just re-derive it" approach as the rest of this
// file.
export type BusinessAlertItem = {
  id: string
  title: string
  message: string
}

export type BusinessAlerts = {
  critical: BusinessAlertItem[]
  warning: BusinessAlertItem[]
  normal: BusinessAlertItem[]
}

// Local mirror of getBudgetActual (provider.tsx) — same reason the
// accounting-position math above is re-declared rather than imported: this
// is a pure data file and provider.tsx is a client module wired to
// Firebase/Auth.
function budgetActual(expenses: ExpenseRecord[], budget: Pick<BudgetRecord, 'category' | 'periodType' | 'year' | 'month'>) {
  const category = budget.category.trim().toLowerCase()
  return expenses
    .filter((expense) => expense.category.trim().toLowerCase() === category)
    .filter((expense) => {
      const expenseDate = new Date(expense.date)
      if (Number.isNaN(expenseDate.getTime()) || expenseDate.getFullYear() !== budget.year) return false
      return budget.periodType === 'yearly' || expenseDate.getMonth() + 1 === budget.month
    })
    .reduce((sum, expense) => sum + expense.amount, 0)
}

// A budget more than 20% over its planned amount counts as a "Major"
// overrun for the Critical bucket; anything else stays informational on
// the Accounting page's own Budget tab.
const MAJOR_BUDGET_OVERRUN_RATIO = 1.2

export function buildBusinessAlerts(data: ERPData | null): BusinessAlerts {
  const critical: BusinessAlertItem[] = []
  const warning: BusinessAlertItem[] = []
  const normal: BusinessAlertItem[] = []

  const products = toArray(data?.products)
  const customers = toArray(data?.customers)
  const orders = toArray(data?.orders)
  const expenses = toArray(data?.expenses).filter((expense) => expense.approvalStatus !== 'rejected')
  const budgets = toArray(data?.budgets)
  const inventory = buildInventoryDashboard(data)
  const { cashBalance } = buildAccountingPosition(data)

  // ---- Critical -------------------------------------------------------
  if (inventory.expiredBatches.length) {
    const qty = inventory.expiredBatches.reduce((sum, batch) => sum + batch.quantity, 0)
    critical.push({
      id: 'expired-stock',
      title: 'Expired Stock',
      message: `${inventory.expiredBatches.length} batch(es), ${qty} unit(s) expired and still on hand.`,
    })
  }

  const overLimitCustomers = customers.filter((customer) => (customer.creditLimit ?? 0) > 0 && customer.due > (customer.creditLimit ?? 0))
  if (overLimitCustomers.length) {
    critical.push({
      id: 'credit-limit-exceeded',
      title: 'Credit Limit Exceeded',
      message: `${overLimitCustomers.length} customer(s) owe more than their approved credit limit.`,
    })
  }

  const negativeStockProducts = products.filter((product) => product.stockQty < 0)
  if (negativeStockProducts.length) {
    critical.push({
      id: 'negative-stock',
      title: 'Negative Stock',
      message: `${negativeStockProducts.length} product(s) show negative stock — reconcile immediately.`,
    })
  }

  if (cashBalance < 0) {
    critical.push({ id: 'cash-shortage', title: 'Cash Shortage', message: 'Cash balance has gone negative.' })
  }

  const majorOverrunBudgets = budgets.filter((budget) => budget.budgetAmount > 0 && budgetActual(expenses, budget) >= budget.budgetAmount * MAJOR_BUDGET_OVERRUN_RATIO)
  if (majorOverrunBudgets.length) {
    critical.push({
      id: 'major-budget-overrun',
      title: 'Major Budget Overrun',
      message: `${majorOverrunBudgets.length} budget category(ies) are 20%+ over their planned amount.`,
    })
  }

  // ---- Warning ----------------------------------------------------------
  if (inventory.lowStockCount) {
    warning.push({ id: 'low-stock', title: 'Low Stock', message: `${inventory.lowStockCount} product(s) at or below their reorder level.` })
  }
  if (inventory.nearExpiryBatches.length) {
    warning.push({ id: 'near-expiry', title: 'Near Expiry', message: `${inventory.nearExpiryBatches.length} batch(es) expiring within 30 days.` })
  }
  const overdueOrders = orders.filter((order) => order.due > 0 && new Date(order.paymentDueDate).getTime() < Date.now())
  if (overdueOrders.length) {
    warning.push({ id: 'overdue-customer', title: 'Overdue Customer', message: `${overdueOrders.length} invoice(s) past their due date with an outstanding balance.` })
  }
  // ---- Normal -------------------------------------------------------------
  const now = new Date()
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const activeOrders = orders.filter((order) => order.status !== 'cancelled')
  const monthOrders = activeOrders.filter((order) => atOrAfter(monthStart(now))(order.createdAt))
  const customerById = new Map(customers.map((customer) => [customer.id, customer]))
  const achievedTargets = toArray(data?.salesTargets).filter(
    (target) => target.period === periodKey && target.targetAmount > 0 && achievedAmountFor(target, monthOrders, customerById) >= target.targetAmount
  )
  if (achievedTargets.length) {
    normal.push({ id: 'target-achieved', title: 'Target Achieved', message: `${achievedTargets.length} sales target(s) achieved this month.` })
  }

  const availableProducts = products.filter((product) => product.stockQty > product.minStock)
  if (availableProducts.length) {
    normal.push({ id: 'stock-available', title: 'Stock Available', message: `${availableProducts.length} product(s) are comfortably stocked.` })
  }

  const todayCollections = toArray(data?.collections).filter((collection) => isSameCalendarDay(collection.collectionDate))
  if (todayCollections.length) {
    const amount = todayCollections.reduce((sum, collection) => sum + collection.amount, 0)
    normal.push({
      id: 'collection-received',
      title: 'Collection Received',
      message: `${todayCollections.length} collection(s) received today totaling ${amount.toLocaleString('en-BD')}.`,
    })
  }

  return { critical, warning, normal }
}

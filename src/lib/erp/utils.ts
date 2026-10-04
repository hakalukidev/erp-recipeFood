import type {
  AccountType,
  ActivityRecord,
  CashMaintenanceRecord,
  LoanTransactionRecord,
  ChartOfAccountRecord,
  DealerCategoryRecord,
  ERPData,
  LedgerAccount,
  OrderRecord,
  ProductRecord,
  PurchaseMaterialRecord,
  SaleType,
  UserRecord,
} from '@/lib/erp/types'
import { COMPANY_ADDRESS, COMPANY_EMAIL, COMPANY_HELPLINE, COMPANY_NAME } from '@/lib/erp/companyInfo'
import { CASH_CATEGORY_ADVANCE_SALARY } from '@/lib/erp/standardChartOfAccounts'
import { BOOKS_START_DATE } from '@/lib/erp/companyInfo'

// Legacy fixed Sale type labels — still the fallback for an invoice whose
// saleType is one of these two literals (pre-dealer-category invoices, or one
// classified from the Sales Reports "Unclassified" list) rather than a
// DealerCategoryRecord id. See isCommissionSaleType/saleTypeLabel below.
const LEGACY_SALE_TYPE_LABELS: Record<string, string> = {
  commission: 'Commission-based',
  others: 'Others / Direct',
}

// A dealer category counts as the "commission" pricing chain (Discount
// Product List, SR Commission %, SR Rate columns — see rate-card/page.tsx)
// when its name mentions "commission"; every other category behaves like the
// old "Others / Direct" option.
export function isCommissionSaleType(saleType: SaleType | undefined, dealerCategories: DealerCategoryRecord[]) {
  if (!saleType) return false
  if (saleType === 'commission') return true
  if (saleType === 'others') return false
  const category = dealerCategories.find((item) => item.id === saleType)
  return category ? category.name.toLowerCase().includes('commission') : false
}

// A dealer category counts as "Trade Sales" (the only distributor type that
// gets the extra Retail Sales voucher on the Invoice print menu — see
// rate-card/page.tsx) when its name mentions "trade sales"; every other
// category (SR/Commission distributors included) only gets the three common
// vouchers (Company/Depot/Dealer).
export function isTradeSalesType(saleType: SaleType | undefined, dealerCategories: DealerCategoryRecord[]) {
  if (!saleType || saleType === 'commission' || saleType === 'others') return false
  const category = dealerCategories.find((item) => item.id === saleType)
  return category ? category.name.toLowerCase().includes('trade sales') : false
}

// A dealer category counts as "SR" distribution — the third fixed bucket the
// Product Return screen's Returned From selector filters dealers into,
// alongside Commission/Trade Sales (see isCommissionSaleType/isTradeSalesType
// above) — when its name mentions "sr" as a whole word. Takes a dealer's
// categoryId directly (DealerRecord.categoryId) rather than an invoice
// saleType, since Product Return groups dealers by their own category, not
// by a chosen invoice sale type.
export function isSrDistributorType(categoryId: string | undefined, dealerCategories: DealerCategoryRecord[]) {
  if (!categoryId) return false
  const category = dealerCategories.find((item) => item.id === categoryId)
  return category ? /\bsr\b/i.test(category.name) : false
}

// Display label for a saved saleType value — the linked dealer category's
// name, the legacy literal's fixed label, or undefined for an invoice with no
// saleType at all (reported as "Unclassified").
export function saleTypeLabel(saleType: SaleType | undefined, dealerCategories: DealerCategoryRecord[]) {
  if (!saleType) return undefined
  const category = dealerCategories.find((item) => item.id === saleType)
  return category?.name ?? LEGACY_SALE_TYPE_LABELS[saleType]
}

// Input & Authorization: a rejected entry never happened as far as any
// money total goes — Earnings, Sales, Cash Flow, Vendor due and Loan balance
// all skip it, the same way rejected expenses/cash entries always were.
// (Stock it moved stays moved until the entry is edited or deleted.)
export function isCountedEntry(entry: { approvalStatus?: string } | null | undefined) {
  return entry?.approvalStatus !== 'rejected'
}

export function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function toArray<T extends { id: string }>(record?: Record<string, T> | null) {
  return record ? Object.values(record) : []
}

// Rate Card line items enter qty as the number of cartons/bags ordered and
// each rate column as a per-piece price — "Per Ctn/Bgs" (free text like
// "500 ps = 1 bg" or "24 pcs = 1 Ct") records how many pieces sit inside one
// of those cartons/bags, so a line's amount is qty × rate × this multiplier,
// not just qty × rate. Reads the leading number off that text; defaults to 1
// (qty already counts pieces, matching the old un-multiplied total) when
// there's no leading number to parse — e.g. a blank field or plain "1 bg".
export function parsePerCtnMultiplier(perCtnBgs?: string) {
  const match = toLatinDigits(perCtnBgs)?.match(/[\d.,]+/)
  if (!match) return 1
  const value = Number(match[0].replace(/,/g, ''))
  return value > 0 ? value : 1
}

// Bangla digits (০–৯) → 0–9, so "২৪ পিস" reads the same as "24 pcs".
export function toLatinDigits(value?: string) {
  return value?.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6))
}

// Discount Product List — see DiscountProductRecord in types.ts. Depot S R
// (dealerRate) is typed in by hand; SR Rate and TP Rate are each a percentage
// step off the rate before them, so a single entry point recomputes that part
// of the chain whenever dealerRate/either percentage changes — used both for
// the live on-screen preview and for what actually gets saved (see
// saveDiscountProduct in provider.tsx):
//   srRate = dealerRate * (1 + srCommissionPercent / 100)
//   tpRate = srRate * (1 + tpPercent / 100)
export function computeDiscountProductRates(
  dealerRate: number,
  srCommissionPercent: number,
  tpPercent: number
) {
  const srRate = dealerRate * (1 + srCommissionPercent / 100)
  const tpRate = srRate * (1 + tpPercent / 100)
  return { srRate, tpRate }
}

export function formatCurrency(value: number, currency = 'BDT') {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

// A missing/malformed `value` (undefined, '', a bad record written before a
// field was required) turns `new Date(value)` into an Invalid Date — feeding
// that to Intl.DateTimeFormat throws an uncaught RangeError that crashes the
// whole page (usually from inside a table/export useMemo), so guard it here
// once rather than at every call site.
export function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
  }).format(date)
}

export function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function isSameCalendarDay(value: string, target = new Date()) {
  const date = new Date(value)

  return (
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  )
}

export function getProductStatus(stockQty: number, minStock: number): ProductRecord['status'] {
  if (stockQty <= 0) {
    return 'out-of-stock'
  }

  if (stockQty <= minStock) {
    return 'low-stock'
  }

  return 'active'
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function getPermissions(data: ERPData | null, user: UserRecord | null) {
  if (!data || !user) {
    return []
  }

  return Object.keys(data.roles[user.roleId]?.permissions ?? {})
}

export function hasPermission(data: ERPData | null, user: UserRecord | null, permission: string) {
  if (!data || !user) {
    return false
  }

  return data.roles[user.roleId]?.permissions?.[permission] === true
}

// Dashboard overview built from the modules that actually have a page in
// the sidebar today (Product List, Dealer List, Rate Card/Costing,
// Expenses) — there's no Sales/Orders screen anymore to ever populate
// `data.orders`, so a dashboard built on orders would just show zeros
// forever. "Sold" and "top dealers" figures come from Rate Card line items
// instead, since that's the only place a sale actually gets recorded now.
export function buildOperationsOverview(data: ERPData | null) {
  const products = toArray(data?.products)
  const dealers = toArray(data?.dealers)
  // Rejected invoices never count toward sales figures (see isCountedEntry).
  const rateCards = sortByCreatedAtDesc(toArray(data?.rateCards).filter(isCountedEntry))
  const expenses = sortByCreatedAtDesc(toArray(data?.expenses))

  const lowStock = products.filter((product) => product.stockQty <= product.minStock)

  const soldByProduct = new Map<string, { name: string; qty: number; revenue: number }>()
  rateCards.forEach((card) => {
    card.items.forEach((item) => {
      const key = item.productId || item.productName
      const pieces = item.qty * parsePerCtnMultiplier(item.perCtnBgs)
      const existing = soldByProduct.get(key) ?? { name: item.productName, qty: 0, revenue: 0 }
      existing.qty += pieces
      existing.revenue += pieces * item.dealerRate
      soldByProduct.set(key, existing)
    })
  })
  const topProducts = Array.from(soldByProduct.values())
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 5)

  const dealerTotals = new Map<string, { name: string; total: number }>()
  rateCards.forEach((card) => {
    const key = card.dealerId || card.recipientName
    const existing = dealerTotals.get(key) ?? { name: card.recipientName, total: 0 }
    existing.total += card.dealerRateTotal
    dealerTotals.set(key, existing)
  })
  const topDealers = Array.from(dealerTotals.values())
    .sort((left, right) => right.total - left.total)
    .slice(0, 5)

  return {
    counts: {
      products: products.length,
      dealers: dealers.length,
      rateCards: rateCards.length,
      lowStock: lowStock.length,
    },
    lowStock,
    recentRateCards: rateCards.slice(0, 5),
    recentExpenses: expenses.slice(0, 5),
    topProducts,
    topDealers,
  }
}

// Company Earnings (Section: Rate Card profit vs Expenses). "Earning" here
// is specifically the company's own margin from selling through the Depot
// channel — usableMoney (= depotRateTotal − manufRateTotal) on every saved
// rate card, the same figure the Company voucher prints — not general order
// revenue, net of every ProductReturnRecord's companyProfit (a Product
// Return pulls the company's gross profit back down the same way the
// original invoice pushed it up — see the type's comment in types.ts).
// "Expense" is every non-rejected ExpenseRecord.
export function buildCompanyEarningsSummary(data: ERPData | null, months = 6) {
  const rateCards = toArray(data?.rateCards).filter(isCountedEntry)
  const productReturns = toArray(data?.productReturns).filter(isCountedEntry)
  // Every non-rejected ExpenseRecord plus direct-expense Cash Maintenance
  // entries (see directExpenseCashEntries).
  const expenses: Array<{ date: string; amount: number }> = [
    ...toArray(data?.expenses).filter((expense) => expense.approvalStatus !== 'rejected'),
    ...directExpenseCashEntries(data),
  ]

  const totalEarning =
    rateCards.reduce((sum, card) => sum + card.usableMoney, 0) -
    productReturns.reduce((sum, item) => sum + item.companyProfit, 0)
  const totalExpense = expenses.reduce((sum, expense) => sum + expense.amount, 0)

  const monthly = Array.from({ length: months }).map((_, index) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - (months - 1 - index))
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const label = date.toLocaleDateString('en-BD', { month: 'short', year: '2-digit' })

    const earning =
      rateCards
        .filter((card) => {
          const cardDate = new Date(card.date)
          return `${cardDate.getFullYear()}-${cardDate.getMonth()}` === key
        })
        .reduce((sum, card) => sum + card.usableMoney, 0) -
      productReturns
        .filter((item) => {
          const returnDate = new Date(item.date)
          return `${returnDate.getFullYear()}-${returnDate.getMonth()}` === key
        })
        .reduce((sum, item) => sum + item.companyProfit, 0)

    const expense = expenses
      .filter((item) => {
        const expenseDate = new Date(item.date)
        return `${expenseDate.getFullYear()}-${expenseDate.getMonth()}` === key
      })
      .reduce((sum, item) => sum + item.amount, 0)

    return { month: label, earning, expense, net: earning - expense }
  })

  // Every calendar year that has at least one rate card, product return or
  // expense, oldest first — unlike `monthly` this isn't a fixed trailing
  // window, since a year-over-year view should show the company's whole
  // history, not just the current year.
  const years = Array.from(
    new Set([
      ...rateCards.map((card) => new Date(card.date).getFullYear()),
      ...productReturns.map((item) => new Date(item.date).getFullYear()),
      ...expenses.map((expense) => new Date(expense.date).getFullYear()),
    ])
  ).sort((left, right) => left - right)
  if (years.length === 0) {
    years.push(new Date().getFullYear())
  }

  const yearly = years.map((year) => {
    const earning =
      rateCards
        .filter((card) => new Date(card.date).getFullYear() === year)
        .reduce((sum, card) => sum + card.usableMoney, 0) -
      productReturns
        .filter((item) => new Date(item.date).getFullYear() === year)
        .reduce((sum, item) => sum + item.companyProfit, 0)

    const expense = expenses
      .filter((item) => new Date(item.date).getFullYear() === year)
      .reduce((sum, item) => sum + item.amount, 0)

    return { year: String(year), earning, expense, net: earning - expense }
  })

  // 2026-09-12 client request — "গড় প্রফিট রেসিও": (Total Profit) ÷ (Total
  // Dealer Value Sales), where Dealer Value Sales is the total at the rate
  // Depot actually sold to Dealer (RateCardRecord.dealerRateTotal), net of
  // returned goods at that same rate (ProductReturnRecord.dealerRateTotal)
  // — kept net-of-returns the same way totalEarning above already is, so
  // the ratio's numerator and denominator are on the same basis.
  const totalDealerValueSales =
    rateCards.reduce((sum, card) => sum + card.dealerRateTotal, 0) -
    productReturns.reduce((sum, item) => sum + item.dealerRateTotal, 0)
  const avgProfitRatioPercent = totalDealerValueSales > 0 ? (totalEarning / totalDealerValueSales) * 100 : 0

  return {
    totalEarning,
    totalExpense,
    totalReturns: productReturns.reduce((sum, item) => sum + item.companyProfit, 0),
    netProfit: totalEarning - totalExpense,
    totalDealerValueSales,
    avgProfitRatioPercent,
    monthly,
    yearly,
  }
}

// Company Earnings for one period (2026-10-04 client request — Monthly /
// Daily / All time selector on the Company Earnings page). Same figures and
// same inclusion rules as buildCompanyEarningsSummary's totals, just scoped
// to an inclusive from/to ('' = open-ended), plus a day-by-day breakdown.
export function buildCompanyEarningsForPeriod(data: ERPData | null, from: string, to: string) {
  const rateCards = toArray(data?.rateCards).filter((card) => isCountedEntry(card) && dateInRange(card.date, from, to))
  const productReturns = toArray(data?.productReturns).filter((item) => isCountedEntry(item) && dateInRange(item.date, from, to))
  const expenses: Array<{ date: string; amount: number }> = [
    ...toArray(data?.expenses).filter((expense) => expense.approvalStatus !== 'rejected'),
    ...directExpenseCashEntries(data),
  ].filter((expense) => dateInRange(expense.date, from, to))

  const grossEarning = rateCards.reduce((sum, card) => sum + card.usableMoney, 0)
  const totalReturns = productReturns.reduce((sum, item) => sum + item.companyProfit, 0)
  const totalEarning = grossEarning - totalReturns
  const totalExpense = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const totalDealerValueSales =
    rateCards.reduce((sum, card) => sum + card.dealerRateTotal, 0) -
    productReturns.reduce((sum, item) => sum + item.dealerRateTotal, 0)

  const byDay = new Map<string, { date: string; earning: number; returns: number; expense: number }>()
  const dayRow = (date: string) => {
    const key = date.slice(0, 10)
    const row = byDay.get(key) ?? { date: key, earning: 0, returns: 0, expense: 0 }
    byDay.set(key, row)
    return row
  }
  rateCards.forEach((card) => (dayRow(card.date).earning += card.usableMoney))
  productReturns.forEach((item) => (dayRow(item.date).returns += item.companyProfit))
  expenses.forEach((expense) => (dayRow(expense.date).expense += expense.amount))
  const daily = Array.from(byDay.values())
    .map((row) => ({ ...row, net: row.earning - row.returns - row.expense }))
    .sort((left, right) => right.date.localeCompare(left.date))

  return {
    invoiceCount: rateCards.length,
    returnCount: productReturns.length,
    expenseCount: expenses.length,
    grossEarning,
    totalReturns,
    totalEarning,
    totalExpense,
    netProfit: totalEarning - totalExpense,
    totalDealerValueSales,
    avgProfitRatioPercent: totalDealerValueSales > 0 ? (totalEarning / totalDealerValueSales) * 100 : 0,
    daily,
  }
}

function dateInRange(date: string, from: string, to: string) {
  const value = date.slice(0, 10)
  if (from && value < from) return false
  if (to && value > to) return false
  return true
}

export type FundCashFlowCategoryRow = { category: string; expenseAmount: number; cashAmount: number; total: number }
export type FundCashFlowVendorRow = { vendorId: string; vendorName: string; purchaseCount: number; totalAmount: number; paid: number; due: number }
export type FundCashFlowItemRow = { materialId: string; materialName: string; category: string; unit: string; qty: number; totalAmount: number }
export type FundCashFlowProductRow = { productId: string; productName: string; qty: number; totalAmount: number }

// ---- Fund / Cash Flow Report (client request, 2026-09-14) ----------------
// "আয়ের দিক... ব্যয়ের দিক... ডান-বাম... এক জায়গায় দেখতে পাওয়া" — a single
// consolidated fund/balance picture that ties every inflow source (sales
// money actually collected, loan withdrawals) against every outflow head
// (Expense chart + Cash Maintenance chart, which includes goods/packaging
// purchases, depot product transport, loan repayment, depot commission, etc. — see
// CASH_MAINTENANCE_CATEGORIES) for one date range, plus the P&L impact of
// product returns and vendor-wise/item-wise breakdowns underneath — instead
// of the same numbers living scattered across the Loan & Cash Maintenance,
// Company Earnings, and Reports Hub pages with no single printable view.
// `from`/`to` are 'YYYY-MM-DD'; empty means unbounded on that side. Opening
// balance sums every inflow/outflow strictly before `from` (0 when `from` is
// empty), same "derive, don't store" shape as the Daily Cash Book on the
// Loan & Cash Maintenance page.
// Cash Maintenance rows split by direction (absent = 'out', see
// CashMaintenanceRecord.direction). A direct-expense row (isDirectExpense)
// counts as cash out like any other since 2026-09-29 (client spec §20–21:
// it showed in the history but never in the summary/reports) — it used to
// be excluded as a book-balancing-only entry.
// Rejected entries count as neither in nor out (same as rejected expenses) —
// they still show in the entry list with their Rejected tag, but never reach
// a total, the Cash Book, the reconciliation or any report.
export function isCashMaintenanceOut(entry: CashMaintenanceRecord) {
  return entry.direction !== 'in' && entry.approvalStatus !== 'rejected'
}

// Direct-expense Cash Maintenance rows (DIRECT_EXPENSE_CATEGORY) are also a
// P&L expense (spec §21: Cash Entry → Expense → Summary → Reporting), so
// Company Earnings and the Fund/Cash Flow P&L count them next to
// ExpenseRecords. Rejected entries are left out, same as rejected expenses.
export function directExpenseCashEntries(data: ERPData | null) {
  return toArray(data?.cashMaintenance).filter(
    (entry) => entry.isDirectExpense && entry.direction !== 'in' && entry.approvalStatus !== 'rejected'
  )
}

export function isCashMaintenanceIn(entry: CashMaintenanceRecord) {
  return entry.direction === 'in' && entry.approvalStatus !== 'rejected'
}

export function buildFundCashFlowReport(data: ERPData | null, from: string, to: string) {
  const rateCards = toArray(data?.rateCards).filter(isCountedEntry)
  const productReturns = toArray(data?.productReturns).filter(isCountedEntry)
  const collections = toArray(data?.collections).filter(isCountedEntry)
  const loanTransactions = toArray(data?.loanTransactions).filter(isCountedEntry)
  const expenses = toArray(data?.expenses).filter((expense) => expense.approvalStatus !== 'rejected')
  const cashEntries = toArray(data?.cashMaintenance).filter(isCashMaintenanceOut)
  const cashInEntries = toArray(data?.cashMaintenance).filter(isCashMaintenanceIn)
  const purchases = toArray(data?.purchases).filter(isCountedEntry)
  const vendors = toArray(data?.vendors)

  // Same "paid at invoice time + every later collection" cash-received shape
  // as collectedCashRows in the Loan & Cash Maintenance page.
  const collectionsByRateCardId = new Map<string, number>()
  for (const collection of collections) {
    collectionsByRateCardId.set(collection.rateCardId, (collectionsByRateCardId.get(collection.rateCardId) ?? 0) + collection.amount)
  }
  const salesCashRows: Array<{ date: string; amount: number }> = []
  for (const card of rateCards) {
    const initialPaid = (card.paid ?? 0) - (collectionsByRateCardId.get(card.id) ?? 0)
    if (initialPaid > 0) salesCashRows.push({ date: card.date, amount: initialPaid })
  }
  // A collection not tied to any invoice (legacy Sales Order payments, e.g.
  // RCPT-06460670) is still real cash in, but shown on its own line so it
  // isn't mistaken for invoice sales.
  const legacyCashRows: Array<{ date: string; amount: number }> = []
  for (const collection of collections) {
    const row = { date: collection.collectionDate, amount: collection.amount }
    if (isLegacyCollection(data, collection)) legacyCashRows.push(row)
    else salesCashRows.push(row)
  }

  const loanWithdrawalRows = loanTransactions.filter((entry) => entry.type === 'withdrawal' && !entry.isOpeningBalance && !entry.isAdjustment)

  function cashInBetween(fromDate: string, toDate: string) {
    const sales = salesCashRows.filter((row) => dateInRange(row.date, fromDate, toDate)).reduce((sum, row) => sum + row.amount, 0)
    const loans = loanWithdrawalRows
      .filter((entry) => dateInRange(entry.date, fromDate, toDate))
      .reduce((sum, entry) => sum + entry.amount, 0)
    const other = cashInEntries.filter((entry) => dateInRange(entry.date, fromDate, toDate)).reduce((sum, entry) => sum + entry.amount, 0)
    const legacy = legacyCashRows.filter((row) => dateInRange(row.date, fromDate, toDate)).reduce((sum, row) => sum + row.amount, 0)
    return { sales, legacy, loans, other, total: sales + legacy + loans + other }
  }
  function cashOutBetween(fromDate: string, toDate: string) {
    const expenseTotal = expenses
      .filter((expense) => dateInRange(expense.date, fromDate, toDate))
      .reduce((sum, expense) => sum + expense.amount, 0)
    const cashTotal = cashEntries
      .filter((entry) => dateInRange(entry.date, fromDate, toDate))
      .reduce((sum, entry) => sum + entry.amount, 0)
    return expenseTotal + cashTotal
  }

  // Only cash on or after BOOKS_START_DATE carries into the opening balance —
  // the books start at zero on that date (see companyInfo.ts).
  const openingBalance = from
    ? cashInBetween(BOOKS_START_DATE, dayBefore(from)).total - cashOutBetween(BOOKS_START_DATE, dayBefore(from))
    : 0
  const inflow = cashInBetween(from, to)
  const outflowTotal = cashOutBetween(from, to)

  // Outflow by category — Expense chart + Cash Maintenance chart merged,
  // same shape as ReportsHubScreen's expenseCategorySummary.
  const categoryMap = new Map<string, FundCashFlowCategoryRow>()
  function addCategory(category: string, amount: number, fromExpense: boolean) {
    const row = categoryMap.get(category) ?? { category, expenseAmount: 0, cashAmount: 0, total: 0 }
    if (fromExpense) row.expenseAmount += amount
    else row.cashAmount += amount
    row.total += amount
    categoryMap.set(category, row)
  }
  expenses.filter((expense) => dateInRange(expense.date, from, to)).forEach((expense) => addCategory(expense.category, expense.amount, true))
  cashEntries.filter((entry) => dateInRange(entry.date, from, to)).forEach((entry) => addCategory(entry.category, entry.amount, false))
  const outflowByCategory = Array.from(categoryMap.values()).sort((left, right) => right.total - left.total)

  const closingBalance = openingBalance + inflow.total - outflowTotal

  // ---- Product returns (deducted from earning, Section 4 of the spec) ----
  const returnsInRange = productReturns.filter((item) => dateInRange(item.date, from, to))
  const totalReturnsDeducted = returnsInRange.reduce((sum, item) => sum + item.companyProfit, 0)
  const totalReturnedValue = returnsInRange.reduce((sum, item) => sum + item.depotRateTotal, 0)

  // ---- P&L for the same range (Section 5) ---------------------------------
  const cardsInRange = rateCards.filter((card) => dateInRange(card.date, from, to))
  const totalEarning = cardsInRange.reduce((sum, card) => sum + card.usableMoney, 0) - totalReturnsDeducted
  const expenseInRange =
    expenses.filter((expense) => dateInRange(expense.date, from, to)).reduce((sum, expense) => sum + expense.amount, 0) +
    directExpenseCashEntries(data)
      .filter((entry) => dateInRange(entry.date, from, to))
      .reduce((sum, entry) => sum + entry.amount, 0)
  const netProfit = totalEarning - expenseInRange

  // ---- Vendor-wise breakdown (Section 6) ----------------------------------
  const purchasesInRange = purchases.filter((purchase) => dateInRange(purchase.date, from, to))
  const vendorMap = new Map<string, FundCashFlowVendorRow>()
  for (const purchase of purchasesInRange) {
    const key = purchase.vendorId || purchase.vendorName || 'unassigned'
    const row = vendorMap.get(key) ?? {
      vendorId: key,
      vendorName: purchase.vendorName || 'Unassigned',
      purchaseCount: 0,
      totalAmount: 0,
      paid: 0,
      due: 0,
    }
    row.purchaseCount += 1
    row.totalAmount += purchase.totalAmount
    row.paid += purchase.paid
    row.due += purchase.due
    vendorMap.set(key, row)
  }
  const vendorWise = Array.from(vendorMap.values()).sort((left, right) => right.totalAmount - left.totalAmount)

  // ---- Item-wise breakdown — purchased materials (Section 6) -------------
  const itemMap = new Map<string, FundCashFlowItemRow>()
  for (const purchase of purchasesInRange) {
    for (const item of purchase.items) {
      const key = `${item.materialId || item.materialName}:${item.unit}`
      const row = itemMap.get(key) ?? {
        materialId: item.materialId || item.materialName,
        materialName: item.materialName,
        category: item.category === 'raw_material' ? 'Raw Material' : 'Packaging Material',
        unit: item.unit,
        qty: 0,
        totalAmount: 0,
      }
      row.qty += item.qty
      row.totalAmount += item.amount
      itemMap.set(key, row)
    }
  }
  const itemWise = Array.from(itemMap.values()).sort((left, right) => right.totalAmount - left.totalAmount)

  // ---- Item-wise breakdown — products sold (Section 6) --------------------
  const productMap = new Map<string, FundCashFlowProductRow>()
  for (const card of cardsInRange) {
    for (const item of card.items) {
      const pieces = item.qty * parsePerCtnMultiplier(item.perCtnBgs)
      const key = item.productId || item.finishedGoodsId || item.productName
      const row = productMap.get(key) ?? { productId: key, productName: item.productName, qty: 0, totalAmount: 0 }
      row.qty += pieces
      row.totalAmount += pieces * item.dealerRate
      productMap.set(key, row)
    }
  }
  const productWise = Array.from(productMap.values()).sort((left, right) => right.totalAmount - left.totalAmount)

  return {
    from,
    to,
    openingBalance,
    inflow,
    outflow: { byCategory: outflowByCategory, total: outflowTotal },
    closingBalance,
    productReturns: { count: returnsInRange.length, totalReturnedValue, totalDeducted: totalReturnsDeducted },
    profitLoss: { totalEarning, totalExpense: expenseInRange, netProfit },
    vendorWise,
    itemWise,
    productWise,
    vendorCount: vendors.length,
  }
}

// Calendar math in UTC on both sides — a local-midnight Date read back with
// toISOString() lands two days back in Bangladesh (UTC+6), which used to
// drop the day just before `from` out of the opening balance.
function dayBefore(dateStr: string) {
  const date = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

// A collection whose invoice isn't on file — pre-Invoice Sales Order
// payments carry no rateCardId at all.
export function isLegacyCollection(data: ERPData | null, collection: { rateCardId?: string }) {
  return !collection.rateCardId || !data?.rateCards?.[collection.rateCardId]
}

export type DealerSalesReportRow = {
  dealerId: string
  dealerName: string
  invoiceCount: number
  totalAmount: number
  commissionAmount: number
  othersAmount: number
  unclassifiedAmount: number
  // Client request (2026-09-13) — Return Product column: every
  // ProductReturnRecord with returnParty 'dealer' against this dealer,
  // at the same dealerRate basis as totalAmount so the two net cleanly.
  // A 'depot' return isn't tied to one dealer's invoice history, so it
  // isn't attributed here (it's still netted off the company-wide totals
  // in buildCompanyEarningsSummary).
  returnAmount: number
  // = totalAmount - returnAmount — the "প্রকৃত সেলস অ্যামাউন্ট" (actual
  // sales amount) the client asked the Total column itself to become.
  netAmount: number
}

export type ProductSalesReportRow = {
  productId: string
  productName: string
  lineCount: number
  qty: number
  totalAmount: number
  // Dealer-party returns of this product, at the dealer rate — so product
  // rows net the same way dealer/date rows do.
  returnAmount: number
  netAmount: number
}

// Sales Reports (Section — Reports/admin/reports) — built entirely off saved
// Invoices (RateCardRecord), the only sales document actually reachable from
// the UI today (the OrderRecord Sales Order module isn't wired up yet — see
// the comment on ProductRecord.rawRate in types.ts). "Sale amount" throughout
// is dealerRateTotal, i.e. the Goods Amount a dealer is actually billed —
// same figure the Invoice list's "Total dealer sales value" card already
// uses. commission/others/unclassified split by card.saleType (see
// isCommissionSaleType above), set on the Invoice form's Sale type selector
// (rate-card/page.tsx) — invoices saved before that field existed have no
// saleType and land in "unclassified" rather than being guessed into either
// bucket.
// Today as YYYY-MM-DD in Bangladesh time — toISOString() is UTC, which is
// still the previous day between 00:00 and 06:00 in Dhaka.
const dhakaDateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' })
export function dhakaTodayIso(date = new Date()) {
  return dhakaDateFormat.format(date)
}

// Date-wise sales reporting — an inclusive YYYY-MM-DD range (either end
// optional) that scopes every Sales report figure by invoice/return date.
export type SalesReportDateRange = { from?: string; to?: string }

export function isInDateRange(date: string, range?: SalesReportDateRange) {
  const day = date.slice(0, 10)
  if (range?.from && day < range.from) return false
  if (range?.to && day > range.to) return false
  return true
}

export type DateSalesReportRow = {
  date: string
  invoiceCount: number
  totalAmount: number
  returnAmount: number
  netAmount: number
}

export function buildSalesReportSummary(data: ERPData | null, range?: SalesReportDateRange) {
  const rateCards = toArray(data?.rateCards).filter((card) => isCountedEntry(card) && isInDateRange(card.date, range))
  const dealerCategories = toArray(data?.dealerCategories)
  const productReturns = toArray(data?.productReturns).filter((entry) => isCountedEntry(entry) && isInDateRange(entry.date, range))
  const dateMap = new Map<string, DateSalesReportRow>()

  function dateRowFor(date: string) {
    const key = date.slice(0, 10)
    let row = dateMap.get(key)
    if (!row) {
      row = { date: key, invoiceCount: 0, totalAmount: 0, returnAmount: 0, netAmount: 0 }
      dateMap.set(key, row)
    }
    return row
  }

  const bySaleType = { commission: 0, others: 0, unclassified: 0 }
  const dealerMap = new Map<string, DealerSalesReportRow>()
  const productMap = new Map<string, ProductSalesReportRow>()

  function dealerRowFor(dealerKey: string, dealerName: string) {
    let row = dealerMap.get(dealerKey)
    if (!row) {
      row = {
        dealerId: dealerKey,
        dealerName,
        invoiceCount: 0,
        totalAmount: 0,
        commissionAmount: 0,
        othersAmount: 0,
        unclassifiedAmount: 0,
        returnAmount: 0,
        netAmount: 0,
      }
      dealerMap.set(dealerKey, row)
    }
    return row
  }

  for (const card of rateCards) {
    const amount = card.dealerRateTotal
    const bucket = !card.saleType ? 'unclassified' : isCommissionSaleType(card.saleType, dealerCategories) ? 'commission' : 'others'
    bySaleType[bucket] += amount

    const dateRow = dateRowFor(card.date)
    dateRow.invoiceCount += 1
    dateRow.totalAmount += amount

    const dealerRow = dealerRowFor(card.dealerId || card.recipientName, card.recipientName)
    dealerRow.invoiceCount += 1
    dealerRow.totalAmount += amount
    if (bucket === 'commission') dealerRow.commissionAmount += amount
    else if (bucket === 'others') dealerRow.othersAmount += amount
    else dealerRow.unclassifiedAmount += amount

    for (const item of card.items) {
      const pieces = item.qty * parsePerCtnMultiplier(item.perCtnBgs)
      const lineAmount = pieces * item.dealerRate
      const productKey = item.productId || item.productName
      const productRow: ProductSalesReportRow = productMap.get(productKey) ?? {
        productId: productKey,
        productName: item.productName,
        lineCount: 0,
        qty: 0,
        totalAmount: 0,
        returnAmount: 0,
        netAmount: 0,
      }
      productRow.lineCount += 1
      productRow.qty += pieces
      productRow.totalAmount += lineAmount
      productMap.set(productKey, productRow)
    }
  }

  // Return Product column + net sales adjustment (client request,
  // 2026-09-13) — a dealer return's dealerRateTotal is on the exact same
  // basis as the invoice totals above, so it nets cleanly off the dealer it
  // was against. Only 'dealer'-party returns land here — a 'depot' return
  // isn't attributable to one dealer's own lifting.
  let totalReturnAmount = 0
  for (const entry of productReturns) {
    if (entry.returnParty !== 'dealer') continue
    const dealerRow = dealerRowFor(entry.dealerId || entry.recipientName, entry.recipientName)
    dealerRow.returnAmount += entry.dealerRateTotal
    dateRowFor(entry.date).returnAmount += entry.dealerRateTotal
    totalReturnAmount += entry.dealerRateTotal
    // Same return, netted off each product it brought back (qty is already
    // in Pcs/Kg — no per-carton multiplier, see computeProductReturnTotals).
    for (const item of entry.items ?? []) {
      const productKey = item.productId || item.productName
      const productRow: ProductSalesReportRow = productMap.get(productKey) ?? {
        productId: productKey,
        productName: item.productName,
        lineCount: 0,
        qty: 0,
        totalAmount: 0,
        returnAmount: 0,
        netAmount: 0,
      }
      productRow.returnAmount += item.qty * item.dealerRate
      productMap.set(productKey, productRow)
    }
  }
  for (const row of productMap.values()) {
    row.netAmount = row.totalAmount - row.returnAmount
  }
  for (const row of dealerMap.values()) {
    row.netAmount = row.totalAmount - row.returnAmount
  }
  for (const row of dateMap.values()) {
    row.netAmount = row.totalAmount - row.returnAmount
  }

  const totalAmount = rateCards.reduce((sum, card) => sum + card.dealerRateTotal, 0)

  return {
    totalInvoices: rateCards.length,
    totalAmount,
    totalReturnAmount,
    netAmount: totalAmount - totalReturnAmount,
    bySaleType,
    dealers: Array.from(dealerMap.values()).sort((a, b) => b.netAmount - a.netAmount),
    products: Array.from(productMap.values()).sort((a, b) => b.netAmount - a.netAmount),
    dates: Array.from(dateMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
  }
}

export type CategorySalesReportRow = {
  category: string
  invoiceLines: number
  qty: number
  rawRateTotal: number
  manufRateTotal: number
  depotRateTotal: number
  dealerRateTotal: number
  tpRateTotal: number
  mrpRateTotal: number
  // Same derived formulas as the Company/Depot vouchers on the Invoice page
  // (see RateCardRecord's comment in types.ts): companyProfit is the
  // company's own margin up to the Depot, depotProfit is the Depot's margin
  // reselling to the Dealer. Both are net of every ProductReturnRecord line
  // that falls in this category, the same way buildCompanyEarningsSummary
  // nets returns off the company's total earning.
  companyProfit: number
  depotProfit: number
}

// Category-wise Sales Invoice (Reports section) — the same Invoices
// (RateCardRecord) behind buildSalesReportSummary above, rolled up by each
// line's Product category instead of by dealer/product, so a "Total Sales
// Invoice by Category" can show — like the Company Voucher on the Invoice
// page — the Depot's and the Company's profit for every category at a
// glance. A line whose product was deleted, or that was never linked to a
// Product record at all (productId absent), falls into "Uncategorized"
// rather than being dropped.
export function buildCategorySalesReportSummary(data: ERPData | null, range?: SalesReportDateRange) {
  const rateCards = toArray(data?.rateCards).filter((card) => isCountedEntry(card) && isInDateRange(card.date, range))
  const productReturns = toArray(data?.productReturns).filter((entry) => isCountedEntry(entry) && isInDateRange(entry.date, range))
  const categoryByProductId = new Map(toArray(data?.products).map((product) => [product.id, product.category]))

  function categoryFor(item: { productId?: string }) {
    if (!item.productId) return 'Uncategorized'
    return categoryByProductId.get(item.productId) || 'Uncategorized'
  }

  const rows = new Map<string, CategorySalesReportRow>()
  function rowFor(category: string) {
    let row = rows.get(category)
    if (!row) {
      row = {
        category,
        invoiceLines: 0,
        qty: 0,
        rawRateTotal: 0,
        manufRateTotal: 0,
        depotRateTotal: 0,
        dealerRateTotal: 0,
        tpRateTotal: 0,
        mrpRateTotal: 0,
        companyProfit: 0,
        depotProfit: 0,
      }
      rows.set(category, row)
    }
    return row
  }

  for (const card of rateCards) {
    for (const item of card.items) {
      const pieces = item.qty * parsePerCtnMultiplier(item.perCtnBgs)
      const row = rowFor(categoryFor(item))
      row.invoiceLines += 1
      row.qty += pieces
      row.rawRateTotal += pieces * item.rawRate
      row.manufRateTotal += pieces * item.manufRate
      row.depotRateTotal += pieces * item.depotRate
      row.dealerRateTotal += pieces * item.dealerRate
      row.tpRateTotal += pieces * (item.tpRate ?? 0)
      row.mrpRateTotal += pieces * (item.mrpRate ?? 0)
    }
  }

  for (const entry of productReturns) {
    for (const item of entry.items) {
      // A return's qty is used as-is against the rate (Pcs/Kg, no
      // per-carton/bag conversion) — see computeProductReturnTotals in
      // provider.tsx.
      const pieces = item.qty
      const row = rowFor(categoryFor(item))
      row.qty -= pieces
      row.rawRateTotal -= pieces * item.rawRate
      row.manufRateTotal -= pieces * item.manufRate
      row.depotRateTotal -= pieces * item.depotRate
      row.dealerRateTotal -= pieces * item.dealerRate
      row.tpRateTotal -= pieces * (item.tpRate ?? 0)
      row.mrpRateTotal -= pieces * (item.mrpRate ?? 0)
    }
  }

  for (const row of rows.values()) {
    row.companyProfit = row.depotRateTotal - row.manufRateTotal
    row.depotProfit = row.dealerRateTotal - row.depotRateTotal
  }

  const list = Array.from(rows.values()).sort((a, b) => b.dealerRateTotal - a.dealerRateTotal)

  return {
    categories: list,
    totalAmount: list.reduce((sum, row) => sum + row.dealerRateTotal, 0),
    totalCompanyProfit: list.reduce((sum, row) => sum + row.companyProfit, 0),
    totalDepotProfit: list.reduce((sum, row) => sum + row.depotProfit, 0),
  }
}

export function buildUserReport(data: ERPData | null) {
  const users = toArray(data?.users)
  const orders = toArray(data?.orders)

  return users.map((user) => {
    const userOrders = orders.filter((order) => order.salesPersonId === user.id)

    return {
      id: user.id,
      name: user.name,
      role: data?.roles[user.roleId]?.name ?? user.roleId,
      totalOrders: userOrders.length,
      pendingOrders: userOrders.filter((order) => order.status === 'pending').length,
      completedOrders: userOrders.filter((order) => order.status === 'completed').length,
      revenue: userOrders.reduce((sum, order) => sum + order.total, 0),
      due: userOrders.reduce((sum, order) => sum + order.due, 0),
    }
  })
}

export function exportCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function escapeCsv(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`
  }

  return value
}

export function computeDealerTotals(data: ERPData | null) {
  const orders = toArray(data?.orders)

  return orders.reduce<Record<string, number>>((totals, order) => {
    totals[order.dealerId] = (totals[order.dealerId] ?? 0) + order.total
    return totals
  }, {})
}

// Outstanding balance is no longer stored on the dealer — it's always the
// live sum of order.due for that dealer's non-cancelled orders (order.due
// itself is already kept correct through collections/returns/cancellations).
export function computeDealerDue(data: ERPData | null, dealerId: string) {
  return toArray(data?.orders)
    .filter((order) => order.dealerId === dealerId && order.status !== 'cancelled')
    .reduce((sum, order) => sum + order.due, 0)
}

// The name to show for an expense category — its renamed label (spec §18,
// SettingsRecord.expenseCategoryLabels) or the stored key itself.
export function expenseCategoryLabel(data: ERPData | null | undefined, category: string) {
  const match = data?.settings?.expenseCategoryLabels?.find((entry) => entry?.category === category)
  return match?.label?.trim() || category
}

// ---- Purchase Section (procurement from vendors) --------------------------
// Same "always derive it live" shape as computeDealerDue above — a vendor's
// outstanding due is never stored as its own running total, just the
// vendor's openingDue (due from before they were entered into the software)
// plus the running sum of PurchaseRecord.due across every purchase billed to
// them (each purchase's own due is already kept correct by
// createPurchase/recordVendorPayment, and can go negative when a purchase's
// `paid` was entered larger than that purchase's own total to pay down the
// opening/prior balance in the same transaction).
//
// Vendor-level payments (VendorPaymentRecord with no purchaseId) aren't
// reflected in any purchase's due, so they're subtracted here directly:
// Previous Due + New Purchase − Payment = Current Due.
export function computeVendorDue(data: ERPData | null, vendorId: string) {
  const openingDue = data?.vendors[vendorId]?.openingDue ?? 0
  return (
    openingDue +
    toArray(data?.purchases)
      .filter((purchase) => purchase.vendorId === vendorId && isCountedEntry(purchase))
      .reduce((sum, purchase) => sum + purchase.due, 0) -
    computeVendorAccountPayments(data, vendorId)
  )
}

// Vendor Statement totals (2026-09-28): Previous (opening) Due + Purchase −
// Payment = Current Due. totalPaid counts paid-at-purchase, per-purchase
// payments (both already in purchase.paid) and vendor-level payments, so
// currentDue always equals computeVendorDue.
export function computeVendorSummary(data: ERPData | null, vendorId: string) {
  const openingDue = data?.vendors[vendorId]?.openingDue ?? 0
  const vendorPurchases = toArray(data?.purchases).filter((purchase) => purchase.vendorId === vendorId && isCountedEntry(purchase))
  const totalPurchase = vendorPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0)
  const totalPaid =
    vendorPurchases.reduce((sum, purchase) => sum + purchase.paid, 0) + computeVendorAccountPayments(data, vendorId)
  return { openingDue, totalPurchase, totalPaid, currentDue: openingDue + totalPurchase - totalPaid }
}

// Sum of payments made against a vendor's whole account rather than one
// purchase — see VendorPaymentRecord in types.ts.
export function computeVendorAccountPayments(data: ERPData | null, vendorId?: string) {
  return toArray(data?.vendorPayments)
    .filter((payment) => !payment.purchaseId && isCountedEntry(payment) && (vendorId === undefined || payment.vendorId === vendorId))
    .reduce((sum, payment) => sum + payment.amount, 0)
}

// Stock units one Rate Card line moves: qty × per-carton multiplier pieces,
// converted back to Finished Goods cartons when the line carries a
// packaging conversion (see RateCardLineItem.piecesPerStockUnit).
export function rateCardLineStockUnits(item: { qty: number; perCtnBgs?: string; finishedGoodsId?: string; piecesPerStockUnit?: number }) {
  const pieces = item.qty * parsePerCtnMultiplier(item.perCtnBgs)
  return item.finishedGoodsId && item.piecesPerStockUnit && item.piecesPerStockUnit > 0 ? pieces / item.piecesPerStockUnit : pieces
}

// ---- Packaging conversion (2026-09-28 client spec §10) --------------------
// piece → gram → kg: a 45 g packet × 72 pcs/carton = 3,240 g = 3.24 kg per
// carton. Returns undefined unless both numbers are positive.
export function computePackWeightKg(pieceWeightGrams?: number, piecesPerUnit?: number) {
  const grams = Number(pieceWeightGrams) || 0
  const pieces = Number(piecesPerUnit) || 0
  if (grams <= 0 || pieces <= 0) return undefined
  return (grams * pieces) / 1000
}

// "45 g × 72 pcs = 3,240 g = 3.24 kg", or undefined without both numbers.
export function describePackConversion(item: { pieceWeightGrams?: number; piecesPerUnit?: number }) {
  const kg = computePackWeightKg(item.pieceWeightGrams, item.piecesPerUnit)
  if (kg === undefined) return undefined
  const fmt = (value: number) => value.toLocaleString('en-BD', { maximumFractionDigits: 3 })
  return `${fmt(item.pieceWeightGrams!)} g × ${fmt(item.piecesPerUnit!)} pcs = ${fmt(kg * 1000)} g = ${fmt(kg)} kg`
}

// ---- Factory Stock (2026-09-28 client spec §7–9) -------------------------
// Vendor → Purchase → Factory Stock → Dealer sale, product-wise (মরিচ,
// হলুদ, জিরা …), always derived live — never stored:
//   Purchased  = Σ purchase lines for the material
//   Sold       = Σ Rate Card lines of every Finished Goods pack size made
//                from it, × that pack size's unitWeightKg
//                (e.g. 10 bags × 15 kg + 3 bags × 15 kg = 195 kg)
//   Remaining  = loose stock (PurchaseMaterialRecord.stockQty) + packed
//                stock (Σ FinishedGoods.stockQty × unitWeightKg)
// Counting loose + packed together means Production (raw → packed) just
// moves kg from one bucket to the other without changing the total, and a
// sale that was never preceded by a Production entry (packed stock goes
// negative) still nets correctly: 500 − 195 = 305.
export type FactoryStockPackRow = {
  finishedGoodsId: string
  name: string
  packSize?: string
  unitWeightKg: number
  pieceWeightGrams?: number
  piecesPerUnit?: number
  packedUnits: number
  soldUnits: number
}

export type FactoryStockRow = {
  material: PurchaseMaterialRecord
  // Stock at the start of the period — for an all-time view, whatever was
  // on hand before the first purchase/sale on file (e.g. stock typed in by
  // hand when the material was added). Opening + Purchased − Sold − Other
  // usage = Closing, always.
  openingQty: number
  purchasedQty: number
  purchaseCount: number
  soldQty: number
  otherUsageQty: number
  // Stock at the end of the period (= currentQty when there's no `to`).
  closingQty: number
  // Right now — loose + packed.
  currentQty: number
  looseQty: number
  packedQty: number
  packs: FactoryStockPackRow[]
}

export type FactoryStockRange = { from?: string; to?: string }

// `range` (spec §12 — "any time"): Purchased/Sold/Other usage count only
// entries dated inside [from, to]; Closing is rolled back from today's
// live stock by undoing everything dated after `to`; Opening is Closing
// minus the period's movement. Dates are 'YYYY-MM-DD' strings.
export function computeFactoryStock(data: ERPData | null, range: FactoryStockRange = {}): FactoryStockRow[] {
  const materials = toArray(data?.purchaseMaterials)
  const finishedGoods = toArray(data?.finishedGoods)
  const day = (value?: string) => (value ?? '').slice(0, 10)
  const inPeriod = (date?: string) => (!range.from || day(date) >= range.from) && (!range.to || day(date) <= range.to)
  const afterPeriod = (date?: string) => Boolean(range.to) && day(date) > range.to!

  type Bucket = { period: number; after: number }
  const add = (map: Map<string, Bucket>, key: string, date: string | undefined, qty: number) => {
    const current = map.get(key) ?? { period: 0, after: 0 }
    if (inPeriod(date)) current.period += qty
    else if (afterPeriod(date)) current.after += qty
    map.set(key, current)
  }

  const purchased = new Map<string, Bucket>()
  const purchaseCount = new Map<string, number>()
  toArray(data?.purchases).forEach((purchase) => {
    const seen = new Set<string>()
    purchase.items.forEach((item) => {
      if (!item.materialId) return
      add(purchased, item.materialId, purchase.date, item.qty)
      if (inPeriod(purchase.date) && !seen.has(item.materialId)) {
        purchaseCount.set(item.materialId, (purchaseCount.get(item.materialId) ?? 0) + 1)
      }
      seen.add(item.materialId)
    })
  })

  // Units of each Finished Goods pack size billed on Rate Cards — same
  // conversion saveRateCard decrements stock by.
  const soldUnits = new Map<string, Bucket>()
  toArray(data?.rateCards).forEach((card) => {
    card.items.forEach((item) => {
      if (!item.finishedGoodsId) return
      add(soldUnits, item.finishedGoodsId, card.date, rateCardLineStockUnits(item))
    })
  })

  // Manual usage only — Production batches post their own MaterialUsageRecord,
  // but that's raw → packed (still in the factory), not stock leaving.
  const productionUsageIds = new Set(
    toArray(data?.productionBatches)
      .map((batch) => batch.materialUsageId)
      .filter((id): id is string => Boolean(id))
  )
  const otherUsage = new Map<string, Bucket>()
  toArray(data?.materialUsages).forEach((usage) => {
    if (productionUsageIds.has(usage.id)) return
    add(otherUsage, usage.materialId, usage.date, usage.qty)
  })

  return materials
    .map((material) => {
      const linked = finishedGoods.filter((item) => item.rawMaterialId === material.id)
      const packs: FactoryStockPackRow[] = linked.map((item) => ({
        finishedGoodsId: item.id,
        name: item.name,
        packSize: item.packSize,
        unitWeightKg: item.unitWeightKg || 0,
        pieceWeightGrams: item.pieceWeightGrams,
        piecesPerUnit: item.piecesPerUnit,
        packedUnits: item.stockQty,
        soldUnits: soldUnits.get(item.id)?.period ?? 0,
      }))
      const soldAfterQty = linked.reduce((sum, item) => sum + (soldUnits.get(item.id)?.after ?? 0) * (item.unitWeightKg || 0), 0)
      const soldQty = packs.reduce((sum, pack) => sum + pack.soldUnits * pack.unitWeightKg, 0)
      const packedQty = packs.reduce((sum, pack) => sum + pack.packedUnits * pack.unitWeightKg, 0)
      const currentQty = material.stockQty + packedQty
      const purchasedQty = purchased.get(material.id)?.period ?? 0
      const otherUsageQty = otherUsage.get(material.id)?.period ?? 0
      const closingQty =
        currentQty - (purchased.get(material.id)?.after ?? 0) + soldAfterQty + (otherUsage.get(material.id)?.after ?? 0)
      return {
        material,
        openingQty: closingQty - purchasedQty + soldQty + otherUsageQty,
        purchasedQty,
        purchaseCount: purchaseCount.get(material.id) ?? 0,
        soldQty,
        otherUsageQty,
        closingQty,
        currentQty,
        looseQty: material.stockQty,
        packedQty,
        packs,
      }
    })
    .sort((left, right) => left.material.name.localeCompare(right.material.name))
}

// Product Statement / inventory ledger (2026-09-29 client spec §13) — every
// movement of one product in date order with a running stock, plus which
// vendor supplied how much. The inventory-side twin of the Vendor
// Statement: a purchase line appears in both (qty here, money there).
// Production is left out (raw → packed stays in the factory). Starts from
// computeFactoryStock's all-time opening, so the last balance always
// equals the product's current stock.
export type ProductLedgerEntry = {
  key: string
  date: string
  createdAt: string
  type: 'purchase' | 'sale' | 'usage'
  reference: string
  party: string
  detail?: string
  qtyIn: number
  qtyOut: number
  amount: number
}

export type ProductVendorSummary = { vendorId?: string; vendorName: string; qty: number; amount: number; purchases: number }

export function computeProductLedger(data: ERPData | null, materialId: string) {
  const stockRow = computeFactoryStock(data).find((row) => row.material.id === materialId)
  const entries: ProductLedgerEntry[] = []
  const vendorMap = new Map<string, ProductVendorSummary>()

  toArray(data?.purchases).forEach((purchase) => {
    const lines = purchase.items.filter((item) => item.materialId === materialId)
    if (!lines.length) return
    const qty = lines.reduce((sum, item) => sum + item.qty, 0)
    const amount = lines.reduce((sum, item) => sum + item.amount, 0)
    entries.push({
      key: purchase.id,
      date: purchase.date,
      createdAt: purchase.createdAt,
      type: 'purchase',
      reference: purchase.purchaseNumber,
      party: purchase.vendorName,
      detail: lines.map((item) => `${item.qty} ${item.unit} @ ${item.rate.toFixed(2)}`).join(', '),
      qtyIn: qty,
      qtyOut: 0,
      amount,
    })
    const vendorKey = purchase.vendorId ?? purchase.vendorName
    const summary = vendorMap.get(vendorKey) ?? { vendorId: purchase.vendorId, vendorName: purchase.vendorName, qty: 0, amount: 0, purchases: 0 }
    summary.qty += qty
    summary.amount += amount
    summary.purchases += 1
    vendorMap.set(vendorKey, summary)
  })

  const packsById = new Map((stockRow?.packs ?? []).map((pack) => [pack.finishedGoodsId, pack]))
  toArray(data?.rateCards).forEach((card) => {
    const lines = card.items.filter((item) => item.finishedGoodsId && packsById.has(item.finishedGoodsId))
    if (!lines.length) return
    const qty = lines.reduce(
      (sum, item) => sum + rateCardLineStockUnits(item) * (packsById.get(item.finishedGoodsId!)?.unitWeightKg ?? 0),
      0
    )
    entries.push({
      key: card.id,
      date: card.date,
      createdAt: card.createdAt,
      type: 'sale',
      reference: card.invoiceNo,
      party: card.recipientName,
      detail: lines
        .map((item) => {
          const pieces = item.qty * parsePerCtnMultiplier(item.perCtnBgs)
          return `${item.productName} × ${pieces.toLocaleString('en-BD', { maximumFractionDigits: 2 })}`
        })
        .join(', '),
      qtyIn: 0,
      qtyOut: qty,
      amount: 0,
    })
  })

  const productionUsageIds = new Set(
    toArray(data?.productionBatches)
      .map((batch) => batch.materialUsageId)
      .filter((id): id is string => Boolean(id))
  )
  toArray(data?.materialUsages).forEach((usage) => {
    if (usage.materialId !== materialId || productionUsageIds.has(usage.id)) return
    entries.push({
      key: usage.id,
      date: usage.date,
      createdAt: usage.createdAt,
      type: 'usage',
      reference: 'Usage',
      party: '—',
      detail: usage.note,
      qtyIn: 0,
      qtyOut: usage.qty,
      amount: 0,
    })
  })

  entries.sort((left, right) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt))
  let running = stockRow?.openingQty ?? 0
  const rows = entries.map((entry) => {
    running += entry.qtyIn - entry.qtyOut
    return { ...entry, balance: running }
  })

  return {
    stock: stockRow,
    rows,
    vendors: Array.from(vendorMap.values()).sort((left, right) => right.qty - left.qty),
    totalPurchaseAmount: Array.from(vendorMap.values()).reduce((sum, vendor) => sum + vendor.amount, 0),
  }
}

// The pieces a packaging material's current stock is actually good for —
// see the PurchaseMaterialRecord comment in types.ts for the two conversion
// shapes this covers (weight-based film vs. count-based sack/carton).
// Returns undefined when the material carries neither conversion field (a
// plain Kg/Pcs material with nothing to derive, or a raw material).
// Rounds off float noise first so 2.01 kg × 1000 (= 2009.9999…) floors to
// 2010, not 2009.
function floorPieces(value: number) {
  return Math.floor(Math.round(value * 1e6) / 1e6)
}

export function computeMaterialAvailablePieces(material: PurchaseMaterialRecord): number | undefined {
  if (material.unit === 'kg' && material.unitWeightGrams && material.unitWeightGrams > 0) {
    return floorPieces((material.stockQty * 1000) / material.unitWeightGrams)
  }
  if (material.unit === 'pcs' && material.capacityPerUnit && material.capacityPerUnit > 0) {
    return floorPieces(material.stockQty * material.capacityPerUnit)
  }
  return undefined
}

// ---- Loan Management --------------------------------------------------
// A loan member's running balance owed — every 'withdrawal' raises it, every
// 'repayment' lowers it, never clamped (so an overpayment stays visible as a
// negative balance). Reaches zero once fully repaid, per the Loan Chart spec.
// One label for a loan transaction's kind, shared by the Loan Chart,
// Reports Hub and Approvals so a Balance Correction reads the same everywhere.
export function loanTransactionTypeLabel(entry: Pick<LoanTransactionRecord, 'type' | 'isOpeningBalance' | 'isAdjustment'>) {
  if (entry.isAdjustment) return `Balance Correction (${entry.type === 'withdrawal' ? '+' : '−'})`
  if (entry.isOpeningBalance) return 'Existing Loan'
  return entry.type === 'withdrawal' ? 'Withdrawal' : 'Repayment'
}

export function computeLoanBalance(data: ERPData | null, loanAccountId: string) {
  const transactions = toArray(data?.loanTransactions).filter((entry) => entry.loanAccountId === loanAccountId && isCountedEntry(entry))
  const totalWithdrawn = transactions
    .filter((entry) => entry.type === 'withdrawal')
    .reduce((sum, entry) => sum + entry.amount, 0)
  const totalRepaid = transactions
    .filter((entry) => entry.type === 'repayment')
    .reduce((sum, entry) => sum + entry.amount, 0)
  return { totalWithdrawn, totalRepaid, balance: totalWithdrawn - totalRepaid }
}

export type LoanMonthlyScheduleRow = {
  period: string // 'YYYY-MM'
  monthLabel: string // e.g. "September 2026"
  opening: number
  withdrawals: number
  repayments: number
  closing: number
}

// 2026-09-12 client request — a month-by-month schedule (Sept, Oct, Nov...)
// per loan member, where a month's closing balance carries straight into
// the next month's opening, including across a year boundary (December's
// closing becomes next January's opening — no special-cased "new year"
// branch needed, it falls out of the running-balance loop below). Like
// Budget's Actual, this is never stored — always derived fresh from
// LoanTransactionRecord (see computeLoanBalance above for the same
// all-time total, just without the month-by-month breakdown). Spans every
// month from the account's first transaction through the current month
// (so an account with no activity this month still shows its running
// balance instead of stopping at its last transaction).
export function computeLoanMonthlySchedule(data: ERPData | null, loanAccountId: string): LoanMonthlyScheduleRow[] {
  const transactions = toArray(data?.loanTransactions)
    .filter((entry) => entry.loanAccountId === loanAccountId && isCountedEntry(entry))
    .sort((left, right) => left.date.localeCompare(right.date))
  if (!transactions.length) {
    return []
  }

  const firstPeriod = transactions[0].date.slice(0, 7)
  const lastTransactionPeriod = transactions[transactions.length - 1].date.slice(0, 7)
  const currentPeriod = dhakaTodayIso().slice(0, 7)
  const endPeriod = lastTransactionPeriod > currentPeriod ? lastTransactionPeriod : currentPeriod

  const periods: string[] = []
  let [year, month] = firstPeriod.split('-').map(Number)
  const [endYear, endMonth] = endPeriod.split('-').map(Number)
  while (year < endYear || (year === endYear && month <= endMonth)) {
    periods.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  let runningBalance = 0
  return periods.map((period) => {
    const opening = runningBalance
    const monthTransactions = transactions.filter((entry) => entry.date.slice(0, 7) === period)
    const withdrawals = monthTransactions
      .filter((entry) => entry.type === 'withdrawal')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const repayments = monthTransactions
      .filter((entry) => entry.type === 'repayment')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const closing = opening + withdrawals - repayments
    runningBalance = closing

    const [periodYear, periodMonth] = period.split('-').map(Number)
    const monthLabel = new Date(periodYear, periodMonth - 1, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    })

    return { period, monthLabel, opening, withdrawals, repayments, closing }
  })
}

// ---- Expense Management --------------------------------------------------
// Per-employee running total of every সেলারি-category expense tagged with
// that employee (ExpenseRecord.employeeName — free text, no employee master)
// — Section 5 of the Loan/Cash Maintenance spec: a quick spot-check of how
// much salary money an employee has actually received, against a
// payslip/cheque history. A rejected expense was never actually paid out,
// so it's excluded here the same way buildCompanyEarningsSummary excludes it
// from total expense. Grouped by a case-insensitive, trimmed name so "রহিম"
// and "রহিম " land in the same row. `month` (YYYY-MM) limits it to salary
// paid in that month — the Finance page's month-wise Salary History.
export function computeEmployeeSalaryTotals(data: ERPData | null, month?: string) {
  const rows = new Map<string, { employeeName: string; total: number; advanceAdjusted: number; count: number }>()
  toArray(data?.expenses)
    .filter(
      (entry) =>
        entry.employeeName?.trim() && entry.approvalStatus !== 'rejected' && (!month || entry.date.slice(0, 7) === month)
    )
    .forEach((entry) => {
      const employeeName = entry.employeeName!.trim()
      const key = employeeName.toLowerCase()
      const existing = rows.get(key)
      if (existing) {
        existing.total += entry.amount
        existing.advanceAdjusted += entry.advanceAdjusted ?? 0
        existing.count += 1
      } else {
        rows.set(key, { employeeName, total: entry.amount, advanceAdjusted: entry.advanceAdjusted ?? 0, count: 1 })
      }
    })
  return Array.from(rows.values()).sort((left, right) => right.total - left.total)
}

// Advance Salary tracker (2026-10-02 client request): per employee, every
// Advance Salary cash-out entry (CashMaintenanceRecord.employeeName) against
// every salary expense's advanceAdjusted — what's still to be deducted from
// a future salary. Grouped by the same trimmed, case-insensitive name as
// computeEmployeeSalaryTotals. Rejected entries never happened, so they're
// left out; pending ones count so an advance can't be adjusted twice while
// it waits for approval. `excludeExpenseId` drops one salary expense so the
// expense form can show the outstanding amount while that expense is edited.
export type EmployeeAdvanceRow = {
  employeeName: string
  given: number
  adjusted: number
  outstanding: number
  advanceCount: number
  lastAdvanceDate: string
}

export function computeEmployeeAdvances(data: ERPData | null, excludeExpenseId?: string) {
  const rows = new Map<string, EmployeeAdvanceRow>()
  function rowFor(name: string) {
    const employeeName = name.trim()
    const key = employeeName.toLowerCase()
    let row = rows.get(key)
    if (!row) {
      row = { employeeName, given: 0, adjusted: 0, outstanding: 0, advanceCount: 0, lastAdvanceDate: '' }
      rows.set(key, row)
    }
    return row
  }
  toArray(data?.cashMaintenance)
    .filter(
      (entry) =>
        entry.category === CASH_CATEGORY_ADVANCE_SALARY &&
        entry.direction !== 'in' &&
        entry.employeeName?.trim() &&
        entry.approvalStatus !== 'rejected'
    )
    .forEach((entry) => {
      const row = rowFor(entry.employeeName!)
      row.given += entry.amount
      row.advanceCount += 1
      if (entry.date > row.lastAdvanceDate) row.lastAdvanceDate = entry.date
    })
  toArray(data?.expenses)
    .filter(
      (expense) =>
        expense.id !== excludeExpenseId &&
        (expense.advanceAdjusted ?? 0) > 0 &&
        expense.employeeName?.trim() &&
        expense.approvalStatus !== 'rejected'
    )
    .forEach((expense) => {
      rowFor(expense.employeeName!).adjusted += expense.advanceAdjusted ?? 0
    })
  return Array.from(rows.values())
    .map((row) => ({ ...row, outstanding: row.given - row.adjusted }))
    .sort((left, right) => right.outstanding - left.outstanding || left.employeeName.localeCompare(right.employeeName))
}

export function employeeAdvanceOutstanding(data: ERPData | null, employeeName: string, excludeExpenseId?: string) {
  const key = employeeName.trim().toLowerCase()
  if (!key) return 0
  return computeEmployeeAdvances(data, excludeExpenseId).find((row) => row.employeeName.toLowerCase() === key)?.outstanding ?? 0
}

export async function exportXlsx(filename: string, sheetName: string, headers: string[], rows: (string | number)[][]) {
  const XLSX = await import('xlsx')
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...roundExportRows(rows)])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, filename)
}

// ---- Section 81/82 (Data Migration / Import-Export) ----------------------
// Reads an uploaded .xlsx/.xls/.csv file into plain row objects keyed by
// its header row — the shared entry point every Data Migration import tab
// and any future "Upload Excel/CSV" flow parses through. `defval: ''` keeps
// every declared column present (as an empty string) even on a short row,
// so downstream mapping code never has to guess between "blank" and
// "missing".
export async function parseSpreadsheetFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    return { headers: [], rows: [] }
  }

  const sheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
  const headers = (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] ?? []).map((header) =>
    String(header ?? '').trim()
  )

  return {
    headers,
    rows: rows.map((row) => {
      const normalized: Record<string, string> = {}
      Object.entries(row).forEach(([key, value]) => {
        normalized[key.trim()] = String(value ?? '').trim()
      })
      return normalized
    }),
  }
}

// jsPDF's built-in fonts (Helvetica etc.) only cover WinAnsi/Latin glyphs, so
// any Bangla text (dealer names, product names, addresses) exported to PDF
// renders as garbled boxes/mojibake. We lazy-load a Unicode font (Noto Sans
// Bengali, covers both Bangla and Latin) from /public and register it with
// jsPDF only when a PDF export actually runs, so the ~450KB font file never
// touches the main JS bundle.
// ---- PDF export ------------------------------------------------------------
// jsPDF draws text glyph-by-glyph with no complex-script shaping, so Bangla
// came out broken (e.g. "বিক্রয়" printed as "বক্রিয়" — the ি vowel sign was
// never moved in front of its consonant) and raw floats like
// -101863.8999999999 went straight into the table. The report is now laid out
// as an HTML page inside a hidden iframe (the browser shapes Bangla
// correctly, and the iframe keeps the app's Tailwind/oklch styles away from
// html2canvas), captured with html2canvas, and cut into A4 pages at row
// boundaries so no row is ever split across two pages.
const PDF_FONT_URL = '/fonts/NotoSansBengali.ttf'

// Float noise from summing amounts (0.1 + 0.2 …) → 2 decimals.
export function roundExportNumber(value: number) {
  return Math.round(value * 100) / 100
}

function roundExportRows(rows: (string | number)[][]) {
  return rows.map((row) => row.map((value) => (typeof value === 'number' ? roundExportNumber(value) : value)))
}

const pdfMoneyFormat = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pdfCountFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const PDF_MONEY_HEADER_PATTERN = /amount|total|balance|due|paid|price|rate|cash|debit|credit|opening|closing|salary|value|cost|profit/i

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

// Opening / Total / Closing lines are shown bold and shaded.
const PDF_EMPHASIS_PATTERN = /^(opening|closing|total|grand total|net)\b/i

function buildPdfHtml(title: string, headers: string[], rows: (string | number)[][], pageWidthPx: number) {
  // A column is numeric when every non-empty value in it is a number.
  const numericColumns = headers.map((_, index) =>
    rows.some((row) => typeof row[index] === 'number') &&
    rows.every((row) => row[index] === undefined || row[index] === '' || typeof row[index] === 'number')
  )
  // Money columns always show 2 decimals; counts (Entries, Qty …) stay whole.
  const moneyColumns = headers.map(
    (header, index) =>
      numericColumns[index] &&
      (PDF_MONEY_HEADER_PATTERN.test(header) || rows.some((row) => typeof row[index] === 'number' && !Number.isInteger(row[index])))
  )
  const head = headers
    .map((header, index) => `<th class="${numericColumns[index] ? 'num' : ''}">${escapeHtml(header)}</th>`)
    .join('')
  const body = rows
    .map((row) => {
      const emphasis = row.some((value) => typeof value === 'string' && PDF_EMPHASIS_PATTERN.test(value.trim()))
      const isSection = row.filter((value) => value !== '' && value !== undefined).length === 1 && typeof row[0] === 'string' && row[0] !== ''
      const cells = headers
        .map((_, index) => {
          const value = row[index] ?? ''
          const text =
            typeof value === 'number'
              ? (moneyColumns[index] ? pdfMoneyFormat : pdfCountFormat).format(value)
              : escapeHtml(String(value))
          const negative = typeof value === 'number' && value < 0 ? ' neg' : ''
          return `<td class="${numericColumns[index] ? 'num' : ''}${negative}">${text}</td>`
        })
        .join('')
      return `<tr class="${emphasis ? 'em' : ''}${isSection ? ' section' : ''}">${cells}</tr>`
    })
    .join('')
  const generated = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date())

  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
  @font-face { font-family: 'NotoSansBengali'; src: url('${PDF_FONT_URL}') format('truetype'); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #ffffff; color: #0f172a; }
  body { width: ${pageWidthPx}px; padding: 36px 40px; font-family: 'NotoSansBengali', 'Noto Sans Bengali', Arial, sans-serif; font-size: 12px; line-height: 1.45; }
  .letterhead { text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 10px; margin-bottom: 14px; }
  .company { font-size: 20px; font-weight: 700; letter-spacing: 0.2px; }
  .address, .contact { font-size: 11px; color: #475569; }
  .title-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
  .title { font-size: 15px; font-weight: 700; }
  .generated { font-size: 10px; color: #64748b; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e293b; color: #ffffff; font-weight: 600; text-align: left; padding: 7px 8px; border: 1px solid #1e293b; }
  td { padding: 6px 8px; border: 1px solid #e2e8f0; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .neg { color: #b91c1c; }
  tr.em td { background: #eef2f7 !important; font-weight: 700; }
  tr.section td { background: #e2e8f0 !important; font-weight: 700; color: #1e293b; }
  .empty { text-align: center; color: #64748b; padding: 18px; }
</style></head><body>
  <div class="letterhead">
    <div class="company">${escapeHtml(COMPANY_NAME)}</div>
    <div class="address">${escapeHtml(COMPANY_ADDRESS)}</div>
    <div class="contact">Helpline: ${escapeHtml(COMPANY_HELPLINE)} · ${escapeHtml(COMPANY_EMAIL)}</div>
  </div>
  <div class="title-row"><div class="title">${escapeHtml(title)}</div><div class="generated">Generated ${escapeHtml(generated)}</div></div>
  <table><thead><tr>${head}</tr></thead><tbody>${
    body || `<tr><td class="empty" colspan="${headers.length}">No data</td></tr>`
  }</tbody></table>
</body></html>`
}

export async function exportPdf(filename: string, title: string, headers: string[], rows: (string | number)[][]) {
  const [{ default: JsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')])
  const landscape = headers.length > 6
  // A4 at 96 dpi.
  const pageWidthPx = landscape ? 1123 : 794
  const pageHeightPx = landscape ? 794 : 1123

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `position:fixed;left:-20000px;top:0;width:${pageWidthPx}px;height:${pageHeightPx}px;border:0;visibility:hidden;`
  document.body.appendChild(iframe)

  try {
    const frameDocument = iframe.contentDocument
    if (!frameDocument) throw new Error('Unable to prepare the PDF.')
    frameDocument.open()
    frameDocument.write(buildPdfHtml(title, headers, roundExportRows(rows), pageWidthPx))
    frameDocument.close()
    await frameDocument.fonts.load(`12px 'NotoSansBengali'`, 'বাংলা')
    await frameDocument.fonts.ready

    const body = frameDocument.body
    iframe.style.height = `${body.scrollHeight}px`
    const scale = 2
    const canvas = await html2canvas(body, {
      scale,
      backgroundColor: '#ffffff',
      width: pageWidthPx,
      height: body.scrollHeight,
      windowWidth: pageWidthPx,
      windowHeight: body.scrollHeight,
    })

    // Page breaks only between table rows. Page 1 keeps the body's own top
    // padding; every later page gets the same margin top and bottom.
    const margin = 36
    const rowRects = Array.from(body.querySelectorAll('tr')).map((row) => row.getBoundingClientRect())
    const slices: Array<{ start: number; end: number }> = []
    let start = 0
    let limit = pageHeightPx - margin
    for (const row of rowRects) {
      if (row.bottom - start > limit && row.top > start) {
        slices.push({ start, end: row.top })
        start = row.top
        limit = pageHeightPx - margin * 2
      }
    }
    slices.push({ start, end: body.scrollHeight })

    const doc = new JsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'px', format: [pageWidthPx, pageHeightPx], hotfixes: ['px_scaling'] })
    slices.forEach((slice, index) => {
      const sliceHeight = Math.max(1, slice.end - slice.start)
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = pageWidthPx * scale
      pageCanvas.height = sliceHeight * scale
      const context = pageCanvas.getContext('2d')
      if (!context) return
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      context.drawImage(canvas, 0, slice.start * scale, pageCanvas.width, pageCanvas.height, 0, 0, pageCanvas.width, pageCanvas.height)
      if (index > 0) doc.addPage([pageWidthPx, pageHeightPx], landscape ? 'landscape' : 'portrait')
      const top = index > 0 ? margin : 0
      doc.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, top, pageWidthPx, sliceHeight)
      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)
      doc.text(`Page ${index + 1} of ${slices.length}`, pageWidthPx - 40, pageHeightPx - 16, { align: 'right' })
    })

    doc.save(filename)
  } finally {
    iframe.remove()
  }
}

// ---- Accounting Module — General Ledger / Trial Balance / Balance Sheet --
// (2026-09-12 client request, "একাউন্টিং বিভাগ") The Automatic Accounting
// Engine writes every LedgerEntryRecord under one of two schemes (see the
// LedgerAccount comment in types.ts): a fixed `account` key for the system
// postings it already knows how to make (Sales, Purchase, Dealer, Cash,
// etc.), or `account:'manual'` + `accountRef:<ChartOfAccountRecord id>` for
// anything posted through a Journal Entry / Bank transaction. This resolves
// either scheme back to the one ChartOfAccountRecord a given entry actually
// belongs to, so the General Ledger below never has to special-case which
// scheme produced a row.
// Ledger keys from retired modules, posted to the account that replaced
// them — the old Customer/Sales Order flow posted receivables to
// 'customer', which is the Dealer account now (Customers were replaced by
// Dealers). Without this those entries were skipped and the Trial Balance
// stopped balancing.
const LEGACY_LEDGER_ACCOUNT_ALIASES: Partial<Record<string, LedgerAccount>> = {
  customer: 'dealer',
}

export function resolveLedgerAccountRecord(
  chartOfAccounts: Record<string, ChartOfAccountRecord>,
  entry: { account: LedgerAccount; accountRef?: string }
): ChartOfAccountRecord | undefined {
  if (entry.account === 'manual') {
    return entry.accountRef ? chartOfAccounts[entry.accountRef] : undefined
  }
  const key = LEGACY_LEDGER_ACCOUNT_ALIASES[entry.account] ?? entry.account
  return Object.values(chartOfAccounts).find((account) => account.ledgerAccount === key)
}

export type GeneralLedgerEntryRow = {
  id: string
  date: string
  billNumber: string
  description: string
  debit: number
  credit: number
  runningBalance: number
}

export type GeneralLedgerAccountSummary = {
  accountId: string
  accountCode: string
  accountName: string
  accountType: AccountType
  openingBalance: number
  entries: GeneralLedgerEntryRow[]
  totalDebit: number
  totalCredit: number
  closingBalance: number
}

// One row per Chart of Accounts entry, in code order, each carrying its own
// running balance (openingBalance, then +debit/-credit per posting in date
// order) — the same "derive, don't store" shape as computeLoanBalance/
// computeLoanMonthlySchedule above: never persisted, always recomputed live
// off ledgerEntries + journalEntries' manual lines.
//
// Optional `range` (inclusive YYYY-MM-DD, '' / undefined = open-ended) scopes
// it to a period, the standard way: postings before `from` fold into
// openingBalance, postings after `to` are ignored, so entries/totalDebit/
// totalCredit are the period's movement and closingBalance is as of `to`.
export type LedgerDateRange = { from?: string; to?: string }

export function buildGeneralLedger(data: ERPData | null, range: LedgerDateRange = {}): GeneralLedgerAccountSummary[] {
  if (!data) {
    return []
  }

  const accounts = Object.values(data.chartOfAccounts).sort((left, right) => left.code.localeCompare(right.code))
  const summaries = new Map<string, GeneralLedgerAccountSummary>()
  accounts.forEach((account) => {
    summaries.set(account.id, {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.type,
      openingBalance: account.openingBalance,
      entries: [],
      totalDebit: 0,
      totalCredit: 0,
      closingBalance: account.openingBalance,
    })
  })

  const ledgerEntries = Object.values(data.ledgerEntries).sort(
    (left, right) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt)
  )
  ledgerEntries.forEach((entry) => {
    const account = resolveLedgerAccountRecord(data.chartOfAccounts, entry)
    if (!account) {
      // No Chart of Accounts row backs this entry yet (e.g. the standard
      // chart hasn't been loaded) — skip rather than crash; the Chart of
      // Accounts tab's "Load standard chart" action is what fixes this.
      return
    }
    const summary = summaries.get(account.id)
    if (!summary) return
    const day = entry.date.slice(0, 10)
    if (range.to && day > range.to) return
    if (range.from && day < range.from) {
      summary.openingBalance += entry.debit - entry.credit
      return
    }
    summary.entries.push({
      id: entry.id,
      date: entry.date,
      billNumber: entry.billNumber,
      description: entry.description,
      debit: entry.debit,
      credit: entry.credit,
      runningBalance: 0,
    })
    summary.totalDebit += entry.debit
    summary.totalCredit += entry.credit
  })

  summaries.forEach((summary) => {
    let running = summary.openingBalance
    summary.entries.forEach((row) => {
      running += row.debit - row.credit
      row.runningBalance = running
    })
    summary.closingBalance = running
  })

  return Array.from(summaries.values())
}

export type TrialBalanceRow = {
  accountId: string
  accountCode: string
  accountName: string
  accountType: AccountType
  debit: number
  credit: number
  periodDebit: number
  periodCredit: number
}

// Every account with any activity (or a non-zero opening balance), split
// into a Debit or Credit column by the sign of its closing balance — a
// positive (net-debit) balance goes in Debit, negative (net-credit) in
// Credit. The two column totals always match, since every ledger posting is
// itself a balanced debit/credit pair.
// Ledger entries whose account has no Chart of Accounts row — the General
// Ledger can't place them, so the Trial Balance shows them as a warning
// instead of silently going out of balance.
export function findUnmappedLedgerEntries(data: ERPData | null) {
  if (!data) return []
  return Object.values(data.ledgerEntries ?? {}).filter((entry) => !resolveLedgerAccountRecord(data.chartOfAccounts, entry))
}

// With a range, debit/credit are the closing balance as of range.to and
// periodDebit/periodCredit are the movement inside the range.
export function buildTrialBalance(
  data: ERPData | null,
  range: LedgerDateRange = {}
): { rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number; totalPeriodDebit: number; totalPeriodCredit: number } {
  const ledger = buildGeneralLedger(data, range)
  const rows: TrialBalanceRow[] = ledger
    .filter((account) => account.closingBalance !== 0 || account.entries.length > 0)
    .map((account) => ({
      accountId: account.accountId,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      debit: account.closingBalance > 0 ? account.closingBalance : 0,
      credit: account.closingBalance < 0 ? -account.closingBalance : 0,
      periodDebit: account.totalDebit,
      periodCredit: account.totalCredit,
    }))
  const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0)
  const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0)
  const totalPeriodDebit = rows.reduce((sum, row) => sum + row.periodDebit, 0)
  const totalPeriodCredit = rows.reduce((sum, row) => sum + row.periodCredit, 0)
  return { rows, totalDebit, totalCredit, totalPeriodDebit, totalPeriodCredit }
}

export type BalanceSheetLine = { accountId: string; code: string; name: string; amount: number }

export type BalanceSheetSummary = {
  assets: BalanceSheetLine[]
  liabilities: BalanceSheetLine[]
  equity: BalanceSheetLine[]
  totalAssets: number
  totalLiabilities: number
  // Equity accounts on file (Share Capital, etc.), before folding in the
  // current period's result.
  totalEquityAccounts: number
  // Revenue minus Expense across the whole ledger, folded into Equity as
  // "Retained Earnings (current period)" the same way a real balance sheet
  // rolls P&L into equity at period close — except here it's always live,
  // never actually closed out, so the sheet balances at any moment without
  // a separate year-end closing step.
  currentPeriodNetProfit: number
  totalEquity: number
  totalLiabilitiesAndEquity: number
  isBalanced: boolean
  // Revenue − Expense posted inside the range only (equals
  // currentPeriodNetProfit when no `from` is given).
  periodNetProfit: number
  periodRevenue: number
  periodExpense: number
}

// A balance sheet is point-in-time: balances are as of range.to; range.from
// only feeds the period P&L figures (periodNetProfit etc.).
export function buildBalanceSheet(data: ERPData | null, range: LedgerDateRange = {}): BalanceSheetSummary {
  const ledger = buildGeneralLedger(data, { to: range.to })
  const periodLedger = range.from ? buildGeneralLedger(data, range) : ledger
  const periodRevenue = periodLedger
    .filter((account) => account.accountType === 'revenue')
    .reduce((sum, account) => sum + (range.from ? account.totalCredit - account.totalDebit : -account.closingBalance), 0)
  const periodExpense = periodLedger
    .filter((account) => account.accountType === 'expense')
    .reduce((sum, account) => sum + (range.from ? account.totalDebit - account.totalCredit : account.closingBalance), 0)
  const toLine = (account: GeneralLedgerAccountSummary, amount: number): BalanceSheetLine => ({
    accountId: account.accountId,
    code: account.accountCode,
    name: account.accountName,
    amount,
  })

  const assets = ledger
    .filter((account) => account.accountType === 'asset' && account.closingBalance !== 0)
    .map((account) => toLine(account, account.closingBalance))
  // Liabilities/Equity/Revenue are credit-normal accounts — their
  // closingBalance (computed as +debit/-credit) is negative when they carry
  // their normal balance, so it's flipped to a positive magnitude here.
  const liabilities = ledger
    .filter((account) => account.accountType === 'liability' && account.closingBalance !== 0)
    .map((account) => toLine(account, -account.closingBalance))
  const equity = ledger
    .filter((account) => account.accountType === 'equity' && account.closingBalance !== 0)
    .map((account) => toLine(account, -account.closingBalance))
  const revenue = ledger
    .filter((account) => account.accountType === 'revenue')
    .reduce((sum, account) => sum - account.closingBalance, 0)
  const expense = ledger
    .filter((account) => account.accountType === 'expense')
    .reduce((sum, account) => sum + account.closingBalance, 0)
  const currentPeriodNetProfit = revenue - expense

  const totalAssets = assets.reduce((sum, line) => sum + line.amount, 0)
  const totalLiabilities = liabilities.reduce((sum, line) => sum + line.amount, 0)
  const totalEquityAccounts = equity.reduce((sum, line) => sum + line.amount, 0)
  const totalEquity = totalEquityAccounts + currentPeriodNetProfit
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquityAccounts,
    currentPeriodNetProfit,
    totalEquity,
    totalLiabilitiesAndEquity,
    isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
    periodNetProfit: periodRevenue - periodExpense,
    periodRevenue,
    periodExpense,
  }
}

export function activitySummary(activity: ActivityRecord) {
  return `${activity.userName} · ${activity.message}`
}

export function getReadableOrderState(order: OrderRecord) {
  return order.status.replace('-', ' ')
}

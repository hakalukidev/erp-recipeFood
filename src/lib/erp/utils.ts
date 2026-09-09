import type {
  ActivityRecord,
  DealerCategoryRecord,
  ERPData,
  OrderRecord,
  ProductRecord,
  PurchaseMaterialRecord,
  SaleType,
  UserRecord,
} from '@/lib/erp/types'

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
  const match = perCtnBgs?.match(/[\d.,]+/)
  if (!match) return 1
  const value = Number(match[0].replace(/,/g, ''))
  return value > 0 ? value : 1
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
    maximumFractionDigits: 3,
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
  const rateCards = sortByCreatedAtDesc(toArray(data?.rateCards))
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
  const rateCards = toArray(data?.rateCards)
  const productReturns = toArray(data?.productReturns)
  const expenses = toArray(data?.expenses).filter((expense) => expense.approvalStatus !== 'rejected')

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

  return {
    totalEarning,
    totalExpense,
    totalReturns: productReturns.reduce((sum, item) => sum + item.companyProfit, 0),
    netProfit: totalEarning - totalExpense,
    monthly,
    yearly,
  }
}

export type DealerSalesReportRow = {
  dealerId: string
  dealerName: string
  invoiceCount: number
  totalAmount: number
  commissionAmount: number
  othersAmount: number
  unclassifiedAmount: number
}

export type ProductSalesReportRow = {
  productId: string
  productName: string
  lineCount: number
  qty: number
  totalAmount: number
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
export function buildSalesReportSummary(data: ERPData | null) {
  const rateCards = toArray(data?.rateCards)
  const dealerCategories = toArray(data?.dealerCategories)

  const bySaleType = { commission: 0, others: 0, unclassified: 0 }
  const dealerMap = new Map<string, DealerSalesReportRow>()
  const productMap = new Map<string, ProductSalesReportRow>()

  for (const card of rateCards) {
    const amount = card.dealerRateTotal
    const bucket = !card.saleType ? 'unclassified' : isCommissionSaleType(card.saleType, dealerCategories) ? 'commission' : 'others'
    bySaleType[bucket] += amount

    const dealerKey = card.dealerId || card.recipientName
    const dealerRow: DealerSalesReportRow = dealerMap.get(dealerKey) ?? {
      dealerId: dealerKey,
      dealerName: card.recipientName,
      invoiceCount: 0,
      totalAmount: 0,
      commissionAmount: 0,
      othersAmount: 0,
      unclassifiedAmount: 0,
    }
    dealerRow.invoiceCount += 1
    dealerRow.totalAmount += amount
    if (bucket === 'commission') dealerRow.commissionAmount += amount
    else if (bucket === 'others') dealerRow.othersAmount += amount
    else dealerRow.unclassifiedAmount += amount
    dealerMap.set(dealerKey, dealerRow)

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
      }
      productRow.lineCount += 1
      productRow.qty += pieces
      productRow.totalAmount += lineAmount
      productMap.set(productKey, productRow)
    }
  }

  return {
    totalInvoices: rateCards.length,
    totalAmount: rateCards.reduce((sum, card) => sum + card.dealerRateTotal, 0),
    bySaleType,
    dealers: Array.from(dealerMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
    products: Array.from(productMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
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
export function buildCategorySalesReportSummary(data: ERPData | null) {
  const rateCards = toArray(data?.rateCards)
  const productReturns = toArray(data?.productReturns)
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

// ---- Purchase Section (procurement from vendors) --------------------------
// Same "always derive it live" shape as computeDealerDue above — a vendor's
// outstanding due is never stored on the vendor, just the running sum of
// PurchaseRecord.due across every purchase billed to them (each purchase's
// own due is already kept correct by createPurchase/recordVendorPayment).
export function computeVendorDue(data: ERPData | null, vendorId: string) {
  return toArray(data?.purchases)
    .filter((purchase) => purchase.vendorId === vendorId)
    .reduce((sum, purchase) => sum + purchase.due, 0)
}

// The pieces a packaging material's current stock is actually good for —
// see the PurchaseMaterialRecord comment in types.ts for the two conversion
// shapes this covers (weight-based film vs. count-based sack/carton).
// Returns undefined when the material carries neither conversion field (a
// plain Kg/Pcs material with nothing to derive, or a raw material).
export function computeMaterialAvailablePieces(material: PurchaseMaterialRecord): number | undefined {
  if (material.unit === 'kg' && material.unitWeightGrams && material.unitWeightGrams > 0) {
    return Math.floor((material.stockQty * 1000) / material.unitWeightGrams)
  }
  if (material.unit === 'pcs' && material.capacityPerUnit && material.capacityPerUnit > 0) {
    return Math.floor(material.stockQty * material.capacityPerUnit)
  }
  return undefined
}

// ---- Loan Management --------------------------------------------------
// A loan member's running balance owed — every 'withdrawal' raises it, every
// 'repayment' lowers it, never clamped (so an overpayment stays visible as a
// negative balance). Reaches zero once fully repaid, per the Loan Chart spec.
export function computeLoanBalance(data: ERPData | null, loanAccountId: string) {
  const transactions = toArray(data?.loanTransactions).filter((entry) => entry.loanAccountId === loanAccountId)
  const totalWithdrawn = transactions
    .filter((entry) => entry.type === 'withdrawal')
    .reduce((sum, entry) => sum + entry.amount, 0)
  const totalRepaid = transactions
    .filter((entry) => entry.type === 'repayment')
    .reduce((sum, entry) => sum + entry.amount, 0)
  return { totalWithdrawn, totalRepaid, balance: totalWithdrawn - totalRepaid }
}

// ---- Expense Management --------------------------------------------------
// Per-employee running total of every সেলারি-category expense tagged with
// that employee (ExpenseRecord.employeeId) — Section 5 of the Loan/Cash
// Maintenance spec: a quick spot-check of how much salary money an employee
// has actually received, against a payslip/cheque history. A rejected
// expense was never actually paid out, so it's excluded here the same way
// buildCompanyEarningsSummary excludes it from total expense.
export function computeEmployeeSalaryTotals(data: ERPData | null) {
  const rows = new Map<string, { employeeId: string; employeeName: string; total: number; count: number }>()
  toArray(data?.expenses)
    .filter((entry) => entry.employeeId && entry.approvalStatus !== 'rejected')
    .forEach((entry) => {
      const employeeId = entry.employeeId as string
      const existing = rows.get(employeeId)
      if (existing) {
        existing.total += entry.amount
        existing.count += 1
      } else {
        rows.set(employeeId, { employeeId, employeeName: entry.employeeName ?? '', total: entry.amount, count: 1 })
      }
    })
  return Array.from(rows.values()).sort((left, right) => right.total - left.total)
}

export async function exportXlsx(filename: string, sheetName: string, headers: string[], rows: (string | number)[][]) {
  const XLSX = await import('xlsx')
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
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
const PDF_FONT_NAME = 'NotoSansBengali'
const PDF_FONT_URL = '/fonts/NotoSansBengali.ttf'
let pdfFontBase64Promise: Promise<string> | null = null

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function loadPdfFontBase64() {
  if (!pdfFontBase64Promise) {
    pdfFontBase64Promise = fetch(PDF_FONT_URL)
      .then((response) => response.arrayBuffer())
      .then(arrayBufferToBase64)
  }
  return pdfFontBase64Promise
}

export async function exportPdf(filename: string, title: string, headers: string[], rows: (string | number)[][]) {
  const { default: JsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new JsPDF({ orientation: rows.length && headers.length > 6 ? 'landscape' : 'portrait' })

  const fontBase64 = await loadPdfFontBase64()
  doc.addFileToVFS(`${PDF_FONT_NAME}.ttf`, fontBase64)
  doc.addFont(`${PDF_FONT_NAME}.ttf`, PDF_FONT_NAME, 'normal')
  doc.addFont(`${PDF_FONT_NAME}.ttf`, PDF_FONT_NAME, 'bold')
  doc.setFont(PDF_FONT_NAME)

  doc.setFontSize(14)
  doc.text(title, 14, 16)
  autoTable(doc, {
    head: [headers],
    body: rows.map((row) => row.map((value) => String(value))),
    startY: 22,
    styles: { font: PDF_FONT_NAME, fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59], font: PDF_FONT_NAME },
  })

  doc.save(filename)
}

export function activitySummary(activity: ActivityRecord) {
  return `${activity.userName} · ${activity.message}`
}

export function getReadableOrderState(order: OrderRecord) {
  return order.status.replace('-', ' ')
}

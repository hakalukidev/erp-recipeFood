import type {
  ActivityRecord,
  ERPData,
  OrderRecord,
  ProductRecord,
  UserRecord,
} from '@/lib/erp/types'

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

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
  }).format(new Date(value))
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
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
// revenue. "Expense" is every non-rejected ExpenseRecord.
export function buildCompanyEarningsSummary(data: ERPData | null, months = 6) {
  const rateCards = toArray(data?.rateCards)
  const expenses = toArray(data?.expenses).filter((expense) => expense.approvalStatus !== 'rejected')

  const totalEarning = rateCards.reduce((sum, card) => sum + card.usableMoney, 0)
  const totalExpense = expenses.reduce((sum, expense) => sum + expense.amount, 0)

  const monthly = Array.from({ length: months }).map((_, index) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - (months - 1 - index))
    const key = `${date.getFullYear()}-${date.getMonth()}`
    const label = date.toLocaleDateString('en-BD', { month: 'short', year: '2-digit' })

    const earning = rateCards
      .filter((card) => {
        const cardDate = new Date(card.date)
        return `${cardDate.getFullYear()}-${cardDate.getMonth()}` === key
      })
      .reduce((sum, card) => sum + card.usableMoney, 0)

    const expense = expenses
      .filter((item) => {
        const expenseDate = new Date(item.date)
        return `${expenseDate.getFullYear()}-${expenseDate.getMonth()}` === key
      })
      .reduce((sum, item) => sum + item.amount, 0)

    return { month: label, earning, expense, net: earning - expense }
  })

  // Every calendar year that has at least one rate card or expense, oldest
  // first — unlike `monthly` this isn't a fixed trailing window, since a
  // year-over-year view should show the company's whole history, not just
  // the current year.
  const years = Array.from(
    new Set([
      ...rateCards.map((card) => new Date(card.date).getFullYear()),
      ...expenses.map((expense) => new Date(expense.date).getFullYear()),
    ])
  ).sort((left, right) => left - right)
  if (years.length === 0) {
    years.push(new Date().getFullYear())
  }

  const yearly = years.map((year) => {
    const earning = rateCards
      .filter((card) => new Date(card.date).getFullYear() === year)
      .reduce((sum, card) => sum + card.usableMoney, 0)

    const expense = expenses
      .filter((item) => new Date(item.date).getFullYear() === year)
      .reduce((sum, item) => sum + item.amount, 0)

    return { year: String(year), earning, expense, net: earning - expense }
  })

  return {
    totalEarning,
    totalExpense,
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
// uses. commission/others/unclassified split by card.saleType, set on the
// Invoice form (see SALE_TYPE_LABELS in the rate-card page) — invoices saved
// before that field existed have no saleType and land in "unclassified"
// rather than being guessed into either bucket.
export function buildSalesReportSummary(data: ERPData | null) {
  const rateCards = toArray(data?.rateCards)

  const bySaleType = { commission: 0, others: 0, unclassified: 0 }
  const dealerMap = new Map<string, DealerSalesReportRow>()
  const productMap = new Map<string, ProductSalesReportRow>()

  for (const card of rateCards) {
    const amount = card.dealerRateTotal
    const bucket = card.saleType === 'commission' ? 'commission' : card.saleType === 'others' ? 'others' : 'unclassified'
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

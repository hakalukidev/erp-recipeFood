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

export function formatCurrency(value: number, currency = 'BDT') {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
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

  // Profit, not sales value — pieces × (Dealer rate − Manufacture rate), the
  // same margin the Company voucher calls "Usable u Depot" per unit.
  const soldByProduct = new Map<string, { name: string; qty: number; profit: number }>()
  rateCards.forEach((card) => {
    card.items.forEach((item) => {
      const key = item.productId || item.productName
      const pieces = item.qty * parsePerCtnMultiplier(item.perCtnBgs)
      const existing = soldByProduct.get(key) ?? { name: item.productName, qty: 0, profit: 0 }
      existing.qty += pieces
      existing.profit += pieces * (item.dealerRate - item.manufRate)
      soldByProduct.set(key, existing)
    })
  })
  const topProducts = Array.from(soldByProduct.values())
    .sort((left, right) => right.profit - left.profit)
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

export async function exportPdf(filename: string, title: string, headers: string[], rows: (string | number)[][]) {
  const { default: JsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new JsPDF({ orientation: rows.length && headers.length > 6 ? 'landscape' : 'portrait' })

  doc.setFontSize(14)
  doc.text(title, 14, 16)
  autoTable(doc, {
    head: [headers],
    body: rows.map((row) => row.map((value) => String(value))),
    startY: 22,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  })

  doc.save(filename)
}

export function activitySummary(activity: ActivityRecord) {
  return `${activity.userName} · ${activity.message}`
}

export function getReadableOrderState(order: OrderRecord) {
  return order.status.replace('-', ' ')
}

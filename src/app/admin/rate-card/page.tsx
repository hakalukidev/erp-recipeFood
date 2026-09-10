"use client"

import { useMemo, useState } from 'react'
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  FileText,
  Package,
  Plus,
  Printer,
  Search,
  Trash2,
  TrendingUp,
} from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_HELPLINE,
  COMPANY_INVOICE_FOOTER_NOTE,
  COMPANY_NAME,
} from '@/lib/erp/companyInfo'
import { useERP } from '@/lib/erp/provider'
import type { DealerCategoryRecord, DealerRecord, DepotRecord, RateCardLineItem, RateCardRecord, SaleType } from '@/lib/erp/types'
import {
  computeDiscountProductRates,
  createId,
  formatDate,
  isCommissionSaleType,
  isTradeSalesType,
  parsePerCtnMultiplier,
  saleTypeLabel,
  sortByCreatedAtDesc,
  toArray,
} from '@/lib/erp/utils'

// Fallback saleType when there's no dealer category to default to yet (e.g.
// the very first invoice, before any Dealer Category has been created) — see
// isCommissionSaleType in utils.ts for how this legacy literal is treated
// the same as a non-commission dealer category.
const DEFAULT_SALE_TYPE = 'others'

const RATE_COLUMN_LABELS: Record<'raw' | 'manuf' | 'depot' | 'dealer', { unit: string; total: string }> = {
  raw: { unit: 'Raw M', total: 'Raw Rate' },
  manuf: { unit: 'Mnu Ra', total: 'Manuf Rate' },
  depot: { unit: 'Dep Rate', total: 'Depot Rate' },
  dealer: { unit: 'Del Rate', total: 'Delar Rate' },
}

type LineItemForm = {
  key: string
  productId: string
  // Set instead of productId when this line was picked from the Finished
  // Goods list (a Production batch's output) rather than the main Product
  // List — see the RateCardLineItem comment in types.ts. A line only ever
  // sets one of the two.
  finishedGoodsId: string
  productName: string
  qty: string
  rawRate: string
  manufRate: string
  depotRate: string
  dealerRate: string
  tpRate: string
  mrpRate: string
  perCtnBgs: string
  // Only set (non-'0') on a line picked from the Discount Product List under
  // a commission-based sale type — see the Sale type selector in the invoice
  // form. Display-only: the totals below already run entirely off the six
  // rate fields above, which have the commission baked in at selection time.
  srCommissionPercent: string
  tpPercent: string
}

function emptyLineItem(): LineItemForm {
  return {
    key: createId('line'),
    productId: '',
    finishedGoodsId: '',
    productName: '',
    qty: '1',
    rawRate: '0',
    manufRate: '0',
    depotRate: '0',
    dealerRate: '0',
    tpRate: '0',
    mrpRate: '0',
    perCtnBgs: '',
    srCommissionPercent: '0',
    tpPercent: '0',
  }
}

type RateCardForm = {
  invoiceNo: string
  recipientName: string
  date: string
  deliveryDate: string
  dealerId: string
  saleType: SaleType
  remarks: string
  items: LineItemForm[]
}

function emptyRateCardForm(): RateCardForm {
  return {
    invoiceNo: '',
    recipientName: '',
    date: new Date().toISOString().slice(0, 10),
    deliveryDate: new Date().toISOString().slice(0, 10),
    dealerId: '',
    saleType: DEFAULT_SALE_TYPE,
    remarks: '',
    items: [emptyLineItem()],
  }
}

function toLineItemForm(item: RateCardLineItem): LineItemForm {
  return {
    key: createId('line'),
    productId: item.productId ?? '',
    finishedGoodsId: item.finishedGoodsId ?? '',
    productName: item.productName,
    qty: String(item.qty),
    rawRate: String(item.rawRate),
    manufRate: String(item.manufRate),
    depotRate: String(item.depotRate),
    dealerRate: String(item.dealerRate),
    tpRate: String(item.tpRate ?? 0),
    mrpRate: String(item.mrpRate ?? 0),
    perCtnBgs: item.perCtnBgs ?? '',
    srCommissionPercent: String(item.srCommissionPercent ?? 0),
    tpPercent: String(item.tpPercent ?? 0),
  }
}

// Company voucher's dealer column reads "SR Rate"/"SR Amount" on a
// commission-based invoice instead of the generic Depot-chain "Del Rate" —
// same column, just labelled for what it actually holds on this sale type.
function dealerColumnLabel(isCommission: boolean) {
  return isCommission ? { unit: 'SR Rate', total: 'SR Amount' } : RATE_COLUMN_LABELS.dealer
}

// Small inline note appended to a row's product name on any of the three
// printed vouchers, so the commission actually billed is visible on the
// document itself — not just in the admin form.
function commissionNote(item: RateCardLineItem) {
  return item.srCommissionPercent
    ? ` <span style="color:#0f766e;font-weight:600;">(SR +${item.srCommissionPercent}%)</span>`
    : ''
}

function formatAmount(value: number) {
  return value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

// Same cascade math as computeRateCardTotals in provider.tsx — kept in sync
// by hand since this is a live preview over uncommitted form state, not a
// saved record.
function computeTotals(items: LineItemForm[]) {
  const parsed = items.map((item) => ({
    // pieces = qty (cartons/bags) × how many pieces one carton/bag holds.
    pieces: (Number(item.qty) || 0) * parsePerCtnMultiplier(item.perCtnBgs),
    rawRate: Number(item.rawRate) || 0,
    manufRate: Number(item.manufRate) || 0,
    depotRate: Number(item.depotRate) || 0,
    dealerRate: Number(item.dealerRate) || 0,
    tpRate: Number(item.tpRate) || 0,
    mrpRate: Number(item.mrpRate) || 0,
  }))
  const rawRateTotal = parsed.reduce((sum, item) => sum + item.pieces * item.rawRate, 0)
  const manufRateTotal = parsed.reduce((sum, item) => sum + item.pieces * item.manufRate, 0)
  const depotRateTotal = parsed.reduce((sum, item) => sum + item.pieces * item.depotRate, 0)
  const dealerRateTotal = parsed.reduce((sum, item) => sum + item.pieces * item.dealerRate, 0)
  const tpRateTotal = parsed.reduce((sum, item) => sum + item.pieces * item.tpRate, 0)
  const mrpRateTotal = parsed.reduce((sum, item) => sum + item.pieces * item.mrpRate, 0)
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

// Company (internal) voucher — every rate column plus the margin box.
function buildRateCardHtml(rateCard: RateCardRecord, isCommission: boolean, dealer?: DealerRecord) {
  const columns: Array<'raw' | 'manuf' | 'depot' | 'dealer'> = ['raw', 'manuf', 'depot', 'dealer']

  const summaryRows = `
      <tr><td>Manu F Rate:</td><td class="numeric">${formatAmount(rateCard.manufRateTotal)}</td><td></td></tr>
      <tr><td>Raw Rate:</td><td class="numeric">${formatAmount(rateCard.rawRateTotal)}</td><td></td></tr>
      <tr><td>Depot Sales Rate:</td><td class="numeric">${formatAmount(rateCard.depotRateTotal)}</td><td></td></tr>
      <tr><td>Dealer Sales Rate:</td><td class="numeric">${formatAmount(rateCard.dealerRateTotal)}</td><td></td></tr>
      <tr><td>Usable money:</td><td class="numeric hl">${formatAmount(rateCard.usableMoney)}</td><td class="numeric hl">${rateCard.usableMoneyPercent.toFixed(2)}%</td></tr>
      <tr><td>Usable u Depot:</td><td class="numeric hl">${rateCard.usableUDepotPercent.toFixed(2)}%</td><td class="numeric hl">${formatAmount(rateCard.usableUDepot)}</td></tr>
      <tr><td>Pouch Cart Am:</td><td class="numeric hl" colspan="2">${formatAmount(rateCard.pouchCartonAmount)}</td></tr>
    `

  const rateValue = (item: RateCardLineItem, column: 'raw' | 'manuf' | 'depot' | 'dealer') =>
    column === 'raw' ? item.rawRate : column === 'manuf' ? item.manufRate : column === 'depot' ? item.depotRate : item.dealerRate

  const rows = rateCard.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}${commissionNote(item)}</td>
        <td class="numeric">${item.qty}</td>
        ${columns.map((column) => `<td class="numeric">${formatAmount(rateValue(item, column))}</td>`).join('')}
        <td>${escapeHtml(item.perCtnBgs ?? '')}</td>
        ${columns.map((column) => `<td class="numeric">${formatAmount(item.qty * parsePerCtnMultiplier(item.perCtnBgs) * rateValue(item, column))}</td>`).join('')}
      </tr>
    `
    )
    .join('')

  const totalsRow = `
    <tr class="totals">
      <td colspan="3"></td>
      <td colspan="${columns.length}"></td>
      <td></td>
      ${columns
        .map((column) =>
          `<td class="numeric">${formatAmount(
            column === 'raw'
              ? rateCard.rawRateTotal
              : column === 'manuf'
                ? rateCard.manufRateTotal
                : column === 'depot'
                  ? rateCard.depotRateTotal
                  : rateCard.dealerRateTotal
          )}</td>`
        )
        .join('')}
    </tr>
  `

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Company Voucher ${escapeHtml(rateCard.invoiceNo)}</title>
        <style>
          * { box-sizing: border-box; }
          @page { margin: 12mm 16mm; size: A4; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 0; }
          .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; color: #0f766e; }
          .company-meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
          .subtitle { text-align: center; color: #4b5563; font-size: 13px; margin: 10px 0 16px; }
          .meta { border: 1px solid #d1d5db; border-collapse: collapse; margin-bottom: 16px; width: 60%; }
          .meta td { border: 1px solid #d1d5db; padding: 4px 8px; font-size: 13px; }
          .meta td:first-child { font-weight: 600; width: 55%; }
          .hl { background: #fef9c3; font-weight: 700; }
          table.doc { border-collapse: collapse; width: 100%; }
          table.doc th, table.doc td { border: 1px solid #d1d5db; padding: 5px 7px; font-size: 12.5px; }
          table.doc th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
          .numeric { text-align: right; white-space: nowrap; }
          tr.totals td { font-weight: 700; border-top: 2px solid #111827; }
          .remarks { margin-top: 16px; font-size: 12.5px; }
          .footnote { text-align: center; font-style: italic; font-size: 11.5px; color: #4b5563; margin-top: 16px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <p class="title">${escapeHtml(COMPANY_NAME)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_ADDRESS)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_EMAIL)} &middot; Help Line: ${escapeHtml(COMPANY_HELPLINE)}</p>
        <p class="subtitle">Company (internal) Voucher${isCommission ? ' &middot; Commission-based Sale' : ''}</p>
        <table class="meta">
          <tr><td>Dealer Name:</td><td>${escapeHtml(rateCard.recipientName)}</td></tr>
          ${dealer?.address ? `<tr><td>Address:</td><td>${escapeHtml(dealer.address)}</td></tr>` : ''}
          ${dealer?.phone ? `<tr><td>Mobile:</td><td>${escapeHtml(dealer.phone)}</td></tr>` : ''}
          <tr><td>Invoice No:</td><td>${escapeHtml(rateCard.invoiceNo)}</td></tr>
          <tr><td>Date:</td><td>${escapeHtml(rateCard.date)}</td></tr>
          ${summaryRows}
        </table>
        <table class="doc">
          <thead>
            <tr>
              <th>SL</th>
              <th>Description of Products</th>
              <th>QTY</th>
              ${columns.map((column) => `<th>${column === 'dealer' ? dealerColumnLabel(isCommission).unit : RATE_COLUMN_LABELS[column].unit}</th>`).join('')}
              <th>Per Ctn/Bgs</th>
              ${columns.map((column) => `<th>${column === 'dealer' ? dealerColumnLabel(isCommission).total : RATE_COLUMN_LABELS[column].total}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}${totalsRow}</tbody>
        </table>
        ${rateCard.remarks ? `<p class="remarks"><strong>মন্তব্য:</strong> ${escapeHtml(rateCard.remarks)}</p>` : ''}
        <p class="footnote">${escapeHtml(COMPANY_INVOICE_FOOTER_NOTE)}</p>
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

const PARTY_BOX_STYLES = `
          .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; color: #0f766e; }
          .company-meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
          .subtitle { text-align: center; color: #4b5563; font-size: 13px; margin: 10px 0 0; }
          .top { display: flex; justify-content: flex-start; margin-top: 12px; }
          .meta { border: 1px solid #d1d5db; border-collapse: collapse; width: 55%; }
          .meta td { border: 1px solid #d1d5db; padding: 4px 8px; font-size: 12.5px; }
          .meta td:first-child { font-weight: 600; width: 60%; }
          .hl { background: #fef9c3; font-weight: 700; }
          .parties { display: flex; gap: 16px; margin: 16px 0; }
          .party { border: 1px solid #7f1d1d; border-radius: 4px; flex: 1; padding: 10px 14px; }
          .party p { margin: 2px 0; font-size: 12.5px; text-align: center; }
          .party .label { color: #7f1d1d; font-weight: 700; font-size: 11px; text-align: left; text-transform: uppercase; }
          .party .name { color: #0f766e; font-size: 14px; font-weight: 700; }
          table.doc { border-collapse: collapse; width: 100%; }
          table.doc th, table.doc td { border: 1px solid #d1d5db; padding: 5px 7px; font-size: 12.5px; }
          table.doc th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
          .numeric { text-align: right; white-space: nowrap; }
          tr.totals td { font-weight: 700; border-top: 2px solid #111827; }
          .remarks { margin-top: 16px; font-size: 12.5px; }
          .footnote { text-align: center; font-style: italic; font-size: 11.5px; color: #4b5563; margin-top: 16px; }
          @media print { button { display: none; } }
`

// Depot → Dealer invoice: shows DP (= dealerRate, what the dealer pays) and
// TP (= tpRate, what the dealer resells at) — the gap between the two is the
// dealer's own margin (Dealer Margin, mirroring Depot Net Profit above).
function buildDealerInvoiceHtml(rateCard: RateCardRecord, isCommission: boolean, depot?: DepotRecord, dealer?: DealerRecord) {
  const dealerMargin = rateCard.tpRateTotal - rateCard.dealerRateTotal
  const rows = rateCard.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}${commissionNote(item)}</td>
        <td class="numeric">${item.qty}</td>
        <td class="numeric">${formatAmount(item.dealerRate)}</td>
        <td class="numeric">${formatAmount(item.tpRate ?? 0)}</td>
        <td>${escapeHtml(item.perCtnBgs ?? '')}</td>
        <td class="numeric">${formatAmount(item.qty * parsePerCtnMultiplier(item.perCtnBgs) * item.dealerRate)}</td>
      </tr>
    `
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Dealer Invoice ${escapeHtml(rateCard.invoiceNo)}</title>
        <style>
          * { box-sizing: border-box; }
          @page { margin: 12mm 16mm; size: A4; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 0; }
          ${PARTY_BOX_STYLES}
        </style>
      </head>
      <body>
        <p class="title">${escapeHtml(COMPANY_NAME)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_ADDRESS)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_EMAIL)} &middot; Help Line: ${escapeHtml(COMPANY_HELPLINE)}</p>
        ${isCommission ? '<p class="subtitle">Commission-based Sale</p>' : ''}

        <div class="top">
          <table class="meta">
            <tr><td>Order Date:</td><td>${escapeHtml(rateCard.date)}</td></tr>
            <tr><td>Delivery Date:</td><td>${escapeHtml(rateCard.deliveryDate || rateCard.date)}</td></tr>
            <tr><td>Dealer Name:</td><td>${escapeHtml(rateCard.recipientName)}</td></tr>
            <tr><td>Order No:</td><td>${escapeHtml(rateCard.invoiceNo)}</td></tr>
            <tr><td>Goods Amount:</td><td class="numeric hl">${formatAmount(rateCard.dealerRateTotal)}</td></tr>
            <tr><td>Dealer Margin:</td><td class="numeric hl">${formatAmount(dealerMargin)}</td></tr>
          </table>
        </div>

        <div class="parties">
          <div class="party">
            <p class="label">From</p>
            <p class="name">${depot ? escapeHtml(depot.name) : 'Depot'}</p>
            ${depot?.address ? `<p>${escapeHtml(depot.address)}</p>` : ''}
            ${depot?.phone ? `<p>Mob: ${escapeHtml(depot.phone)}</p>` : ''}
          </div>
          <div class="party">
            <p class="label">To &middot; Dealer</p>
            <p class="name">${escapeHtml(rateCard.recipientName)}</p>
            ${dealer?.address ? `<p>${escapeHtml(dealer.address)}</p>` : ''}
            ${dealer?.phone ? `<p>Mob: ${escapeHtml(dealer.phone)}</p>` : ''}
          </div>
        </div>

        <table class="doc">
          <thead>
            <tr>
              <th>SL NO</th>
              <th>Description of Products</th>
              <th>QTY</th>
              <th>${isCommission ? 'SR Rate' : 'DP'}</th>
              <th>TP</th>
              <th>Per Ctn/Bgs</th>
              <th>Depot Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="totals">
              <td colspan="6" style="text-align:right;">Grand Total</td>
              <td class="numeric">${formatAmount(rateCard.dealerRateTotal)}</td>
            </tr>
          </tbody>
        </table>
        ${rateCard.remarks ? `<p class="remarks"><strong>মন্তব্য:</strong> ${escapeHtml(rateCard.remarks)}</p>` : ''}
        <p class="footnote">${escapeHtml(COMPANY_INVOICE_FOOTER_NOTE)}</p>
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

// Company → Depot invoice: shows Depot P P (= depotRate, what the depot pays
// the company) and Depot S P (= dealerRate, what the depot resells to its
// dealer at — the same figure the Dealer voucher calls "DP"). Depot Net
// Profit (the depot's own per-invoice commission) is Depot S P total −
// Depot P P total — derived here, not stored.
function buildDepotInvoiceHtml(rateCard: RateCardRecord, isCommission: boolean, depot?: DepotRecord, dealer?: DealerRecord) {
  const depotNetProfit = rateCard.dealerRateTotal - rateCard.depotRateTotal

  const rows = rateCard.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}${commissionNote(item)}</td>
        <td class="numeric">${item.qty}</td>
        <td class="numeric">${formatAmount(item.depotRate)}</td>
        <td class="numeric">${formatAmount(item.dealerRate)}</td>
        <td>${escapeHtml(item.perCtnBgs ?? '')}</td>
        <td class="numeric">${formatAmount(item.qty * parsePerCtnMultiplier(item.perCtnBgs) * item.depotRate)}</td>
        <td class="numeric">${formatAmount(item.qty * parsePerCtnMultiplier(item.perCtnBgs) * item.dealerRate)}</td>
      </tr>
    `
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Depot Invoice ${escapeHtml(rateCard.invoiceNo)}</title>
        <style>
          * { box-sizing: border-box; }
          @page { margin: 12mm 16mm; size: A4; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 0; }
          ${PARTY_BOX_STYLES}
        </style>
      </head>
      <body>
        <p class="title">${escapeHtml(COMPANY_NAME)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_ADDRESS)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_EMAIL)} &middot; Help Line: ${escapeHtml(COMPANY_HELPLINE)}</p>
        ${isCommission ? '<p class="subtitle">Commission-based Sale</p>' : ''}

        <div class="top">
          <table class="meta">
            <tr><td>Order Date:</td><td>${escapeHtml(rateCard.date)}</td></tr>
            <tr><td>Delivery Date:</td><td>${escapeHtml(rateCard.deliveryDate || rateCard.date)}</td></tr>
            <tr><td>Depot Name:</td><td>${depot ? escapeHtml(depot.name) : escapeHtml(rateCard.recipientName)}</td></tr>
            <tr><td>Dealer Name:</td><td>${escapeHtml(rateCard.recipientName)}</td></tr>
            ${dealer?.address ? `<tr><td>Dealer Address:</td><td>${escapeHtml(dealer.address)}</td></tr>` : ''}
            ${dealer?.phone ? `<tr><td>Dealer Mobile:</td><td>${escapeHtml(dealer.phone)}</td></tr>` : ''}
            <tr><td>Order No:</td><td>${escapeHtml(rateCard.invoiceNo)}</td></tr>
            <tr><td>Depot Sales Price:</td><td class="numeric hl">${formatAmount(rateCard.dealerRateTotal)}</td></tr>
            <tr><td>Depot Purchase Price:</td><td class="numeric">${formatAmount(rateCard.depotRateTotal)}</td></tr>
            <tr><td>Depot Net Profit:</td><td class="numeric hl">${formatAmount(depotNetProfit)}</td></tr>
          </table>
        </div>

        <div class="parties">
          <div class="party">
            <p class="label">From</p>
            <p class="name">${escapeHtml(COMPANY_NAME)}</p>
            <p>${escapeHtml(COMPANY_ADDRESS)}</p>
            <p>Call: ${escapeHtml(COMPANY_HELPLINE)}</p>
          </div>
          <div class="party">
            <p class="label">To &middot; Depot</p>
            <p class="name">${depot ? escapeHtml(depot.name) : escapeHtml(rateCard.recipientName)}</p>
            ${depot?.address ? `<p>${escapeHtml(depot.address)}</p>` : ''}
            ${depot?.phone ? `<p>Mob: ${escapeHtml(depot.phone)}</p>` : ''}
          </div>
        </div>

        <table class="doc">
          <thead>
            <tr>
              <th>SL NO</th>
              <th>Description of Products</th>
              <th>QTY</th>
              <th>Depot P P</th>
              <th>Depot S P</th>
              <th>Per Ctn/Bgs</th>
              <th>Depot P P</th>
              <th>Depot S P</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="totals">
              <td colspan="6" style="text-align:right;">Grand Total</td>
              <td class="numeric">${formatAmount(rateCard.depotRateTotal)}</td>
              <td class="numeric">${formatAmount(rateCard.dealerRateTotal)}</td>
            </tr>
          </tbody>
        </table>
        ${rateCard.remarks ? `<p class="remarks"><strong>মন্তব্য:</strong> ${escapeHtml(rateCard.remarks)}</p>` : ''}
        <p class="footnote">${escapeHtml(COMPANY_INVOICE_FOOTER_NOTE)}</p>
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

// Retail column set adds TP (Retail Sales Rate) as a fifth rate column next
// to the Company voucher's four, and relabels depot/dealer to match the
// client's paper "Retail Delivery" sheet (Dep PR / DeP SR instead of Depot
// Rate / Delar Rate) — same underlying fields (depotRate/dealerRate/tpRate),
// just the labelling this one voucher prints.
const RETAIL_RATE_COLUMN_LABELS: Record<'raw' | 'manuf' | 'depot' | 'dealer' | 'tp', { unit: string; total: string }> = {
  raw: { unit: 'Raw M', total: 'Raw Rate' },
  manuf: { unit: 'Mnu Ra', total: 'Manuf Rate' },
  depot: { unit: 'Dep PR', total: 'Dep PR' },
  dealer: { unit: 'DeP SR', total: 'DeP SR' },
  tp: { unit: 'TP', total: 'TP' },
}

function retailRateValue(item: RateCardLineItem, column: 'raw' | 'manuf' | 'depot' | 'dealer' | 'tp') {
  switch (column) {
    case 'raw':
      return item.rawRate
    case 'manuf':
      return item.manufRate
    case 'depot':
      return item.depotRate
    case 'dealer':
      return item.dealerRate
    case 'tp':
      return item.tpRate ?? 0
  }
}

// Retail Sales voucher — the client's "Retail Delivery" paper sheet: five
// rate columns (Raw M / Mnu Ra / Dep PR / DeP SR / TP) plus a profit summary
// box. This voucher treats Depot and Dealer as internal price checkpoints
// only, not separate profit-holding entities — the company is modelled as
// manufacturing and selling straight through to TP itself, so the *entire*
// margin from Manuf Rate up to TP is the company's own:
//   Com Gross Profit = Retail Sales Rate (TP) − Manuf Rate
// Depot Margin (Dep PR → Dep SR) and Dealer Margin (Dep SR → TP) are shown
// underneath purely as an informational split of that same Gross Profit —
// used to check whether the old depot/dealer cut would have covered the
// company's own marketing cost (DSR, vehicles, etc.), not subtracted from
// it. Packet Cost = Manuf Rate − Raw Rate (same figure as pouchCartonAmount
// elsewhere on this page).
function buildRetailInvoiceHtml(rateCard: RateCardRecord, dealer?: DealerRecord) {
  const columns: Array<'raw' | 'manuf' | 'depot' | 'dealer' | 'tp'> = ['raw', 'manuf', 'depot', 'dealer', 'tp']
  const packetCost = rateCard.manufRateTotal - rateCard.rawRateTotal
  const grossProfit = rateCard.tpRateTotal - rateCard.manufRateTotal
  const grossProfitPercent = rateCard.tpRateTotal ? (grossProfit / rateCard.tpRateTotal) * 100 : 0
  const depotMargin = rateCard.dealerRateTotal - rateCard.depotRateTotal
  const depotMarginPercent = rateCard.tpRateTotal ? (depotMargin / rateCard.tpRateTotal) * 100 : 0
  const dealerMargin = rateCard.tpRateTotal - rateCard.dealerRateTotal
  const dealerMarginPercent = rateCard.tpRateTotal ? (dealerMargin / rateCard.tpRateTotal) * 100 : 0

  const rows = rateCard.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}${commissionNote(item)}</td>
        <td class="numeric">${item.qty}</td>
        ${columns.map((column) => `<td class="numeric">${formatAmount(retailRateValue(item, column))}</td>`).join('')}
        <td>${escapeHtml(item.perCtnBgs ?? '')}</td>
        ${columns.map((column) => `<td class="numeric">${formatAmount(item.qty * parsePerCtnMultiplier(item.perCtnBgs) * retailRateValue(item, column))}</td>`).join('')}
      </tr>
    `
    )
    .join('')

  const totalsRow = `
    <tr class="totals">
      <td colspan="3"></td>
      <td colspan="${columns.length}"></td>
      <td></td>
      ${columns
        .map((column) => {
          const total =
            column === 'raw'
              ? rateCard.rawRateTotal
              : column === 'manuf'
                ? rateCard.manufRateTotal
                : column === 'depot'
                  ? rateCard.depotRateTotal
                  : column === 'dealer'
                    ? rateCard.dealerRateTotal
                    : rateCard.tpRateTotal
          return `<td class="numeric">${formatAmount(total)}</td>`
        })
        .join('')}
    </tr>
  `

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Retail Sales Invoice ${escapeHtml(rateCard.invoiceNo)}</title>
        <style>
          * { box-sizing: border-box; }
          @page { margin: 12mm 16mm; size: A4; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 0; }
          .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; color: #0f766e; }
          .company-meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
          .top { display: flex; justify-content: flex-start; margin-top: 10px; }
          .meta { border: 1px solid #111827; border-collapse: collapse; width: 48%; }
          .meta td { border: 1px solid #111827; padding: 4px 8px; font-size: 12.5px; }
          .meta td:first-child { font-weight: 600; width: 55%; }
          .hl { background: #fef9c3; font-weight: 700; }
          .boxes { display: flex; gap: 16px; margin: 16px 0; align-items: stretch; }
          .box { border: 1px solid #111827; border-radius: 4px; flex: 1; padding: 8px 12px; }
          .box .heading { font-weight: 700; font-size: 12.5px; margin: 0 0 4px; }
          .box p { margin: 2px 0; font-size: 12.5px; }
          .box .company-name { font-weight: 700; }
          table.doc { border-collapse: collapse; width: 100%; }
          table.doc th, table.doc td { border: 1px solid #d1d5db; padding: 5px 7px; font-size: 12px; }
          table.doc th { background: #f3f4f6; text-transform: uppercase; font-size: 10.5px; }
          .numeric { text-align: right; white-space: nowrap; }
          tr.totals td { font-weight: 700; border-top: 2px solid #111827; }
          .footnote { text-align: center; font-style: italic; font-size: 11.5px; color: #4b5563; margin-top: 16px; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <p class="title">${escapeHtml(COMPANY_NAME)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_ADDRESS)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_EMAIL)} &middot; Help Line: ${escapeHtml(COMPANY_HELPLINE)}</p>

        <div class="top">
          <table class="meta">
            <tr><td>Dealer Name:</td><td>${escapeHtml(rateCard.recipientName)}</td></tr>
            ${dealer?.address ? `<tr><td>Address:</td><td>${escapeHtml(dealer.address)}</td></tr>` : ''}
            ${dealer?.phone ? `<tr><td>Mobile:</td><td>${escapeHtml(dealer.phone)}</td></tr>` : ''}
            <tr><td>Invo No:</td><td>${escapeHtml(rateCard.invoiceNo)}</td></tr>
            <tr><td>Date:</td><td>${escapeHtml(formatDate(rateCard.date))}</td></tr>
            <tr><td>Raw Rate:</td><td class="numeric">${formatAmount(rateCard.rawRateTotal)}</td></tr>
            <tr><td>Manuf Rate:</td><td class="numeric">${formatAmount(rateCard.manufRateTotal)}</td></tr>
            <tr><td>Depot Purchase Rate:</td><td class="numeric">${formatAmount(rateCard.depotRateTotal)}</td></tr>
            <tr><td>Depot Sales Rate:</td><td class="numeric">${formatAmount(rateCard.dealerRateTotal)}</td></tr>
            <tr><td>Retail Sales Rate:</td><td class="numeric">${formatAmount(rateCard.tpRateTotal)}</td></tr>
            <tr><td>Com Gross Profit:</td><td class="numeric hl">${formatAmount(grossProfit)} &middot; ${grossProfitPercent.toFixed(2)}%</td></tr>
            <tr><td>&nbsp;&nbsp;· Depot Margin (Dep PR → Dep SR):</td><td class="numeric">${formatAmount(depotMargin)} &middot; ${depotMarginPercent.toFixed(2)}%</td></tr>
            <tr><td>&nbsp;&nbsp;· Dealer Margin (Dep SR → TP):</td><td class="numeric">${formatAmount(dealerMargin)} &middot; ${dealerMarginPercent.toFixed(2)}%</td></tr>
            <tr><td>Packet Cost:</td><td class="numeric hl">${formatAmount(packetCost)}</td></tr>
          </table>
        </div>

        <div class="boxes">
          <div class="box">
            <p class="heading">From &middot; Company</p>
            <p class="company-name">${escapeHtml(COMPANY_NAME)}</p>
            <p>${escapeHtml(COMPANY_ADDRESS)}</p>
            <p>${escapeHtml(COMPANY_EMAIL)}</p>
            <p>Call: ${escapeHtml(COMPANY_HELPLINE)}</p>
          </div>
          <div class="box">
            <p class="heading" style="text-align:center;">মন্তব্য</p>
            <p>${rateCard.remarks ? escapeHtml(rateCard.remarks) : '&nbsp;'}</p>
          </div>
        </div>

        <table class="doc">
          <thead>
            <tr>
              <th>SL NO</th>
              <th>Description of Products</th>
              <th>QTY</th>
              ${columns.map((column) => `<th>${RETAIL_RATE_COLUMN_LABELS[column].unit}</th>`).join('')}
              <th>Per Ctn/Bgs</th>
              ${columns.map((column) => `<th>${RETAIL_RATE_COLUMN_LABELS[column].total}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}${totalsRow}</tbody>
        </table>
        <p class="footnote">${escapeHtml(COMPANY_INVOICE_FOOTER_NOTE)}</p>
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

export default function RateCardPage() {
  const { data, saveRateCard, deleteRateCard } = useERP()
  const rateCards = useMemo(() => sortByCreatedAtDesc(toArray(data?.rateCards)), [data?.rateCards])
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const finishedGoods = useMemo(() => toArray(data?.finishedGoods), [data?.finishedGoods])
  const finishedGoodsById = useMemo(() => new Map(finishedGoods.map((item) => [item.id, item])), [finishedGoods])
  const discountProducts = useMemo(() => toArray(data?.discountProducts), [data?.discountProducts])
  const dealers = useMemo(() => toArray(data?.dealers), [data?.dealers])
  const depots = useMemo(() => toArray(data?.depots), [data?.depots])
  const dealerById = useMemo(() => new Map(dealers.map((dealer) => [dealer.id, dealer])), [dealers])
  const dealerForId = useMemo(() => (dealerId?: string) => (dealerId ? dealerById.get(dealerId) : undefined), [dealerById])
  const depotForDealerId = useMemo(() => {
    const depotById = new Map(depots.map((depot) => [depot.id, depot]))
    return (dealerId?: string) => {
      const dealer = dealerId ? dealerById.get(dealerId) : undefined
      return dealer?.depotId ? depotById.get(dealer.depotId) : undefined
    }
  }, [dealerById, depots])
  const productOptions: ComboboxOption[] = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        sublabel: product.category,
      })),
    [products]
  )
  // Regular Product List entries plus Finished Goods (a Production batch's
  // output — see FinishedGoodsRecord) in one picker, so a distribution
  // invoice can bill straight out of either stock without a separate mode
  // toggle. Only offered on a non-commission sale type, same as
  // productOptions — a commission invoice always sources from the Discount
  // Product List instead (see discountProductOptions below).
  const productAndFinishedGoodsOptions: ComboboxOption[] = useMemo(
    () => [
      ...productOptions,
      ...finishedGoods.map((item) => ({
        value: item.id,
        label: item.name,
        sublabel: item.packSize ? `Finished Goods · ${item.packSize}` : 'Finished Goods',
      })),
    ],
    [productOptions, finishedGoods]
  )
  // Product picker source for a commission-based invoice — see the Sale
  // type selector below; picking a line here (instead of from productOptions)
  // pulls its rates through the SR Commission %/TP % chain (see
  // computeDiscountProductRates) instead of the Product List's own rates.
  const discountProductOptions: ComboboxOption[] = useMemo(
    () =>
      discountProducts.map((product) => ({
        value: product.id,
        label: product.name,
        sublabel: product.category,
      })),
    [discountProducts]
  )
  const dealerCategories = useMemo(() => toArray(data?.dealerCategories), [data?.dealerCategories])
  const dealerOptions: ComboboxOption[] = useMemo(() => {
    const categoryNameById = new Map(dealerCategories.map((category) => [category.id, category.name]))
    return dealers.map((dealer) => {
      const categoryLabel = dealer.categoryId ? categoryNameById.get(dealer.categoryId) : undefined
      return {
        value: dealer.id,
        label: dealer.name,
        sublabel: categoryLabel ? `${dealer.phone} · ${categoryLabel}` : dealer.phone,
      }
    })
  }, [dealers, dealerCategories])

  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RateCardForm>(emptyRateCardForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const filteredRateCards = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return rateCards
    return rateCards.filter((card) => [card.invoiceNo, card.recipientName].join(' ').toLowerCase().includes(normalized))
  }, [rateCards, query])

  const totals = useMemo(() => computeTotals(form.items), [form.items])
  const depotNetProfit = totals.dealerRateTotal - totals.depotRateTotal

  // Sale type selector's options — the live Dealer Category list, plus (only
  // while editing a rate card still holding the pre-dealer-category
  // 'commission'/'others' literal) a "(legacy)" entry so that value still
  // shows up as selected instead of the Select rendering blank.
  const saleTypeOptions = useMemo(() => {
    const options: DealerCategoryRecord[] = dealerCategories
    const isLegacyValue = form.saleType === 'commission' || form.saleType === 'others'
    if (isLegacyValue && !options.some((category) => category.id === form.saleType)) {
      return [
        {
          id: form.saleType,
          name: form.saleType === 'commission' ? 'Commission-based (legacy)' : 'Others / Direct (legacy)',
        } as DealerCategoryRecord,
        ...options,
      ]
    }
    return options
  }, [dealerCategories, form.saleType])
  const formIsCommission = isCommissionSaleType(form.saleType, dealerCategories)

  function openCreateDialog() {
    setEditingId(null)
    // Default to the first dealer category so the Sale type selector below
    // never opens on a blank value — falls back to the legacy literal only
    // when no dealer category exists yet.
    setForm({ ...emptyRateCardForm(), saleType: dealerCategories[0]?.id ?? DEFAULT_SALE_TYPE })
    setFormError(null)
    setShowBreakdown(false)
    setDialogOpen(true)
  }

  function openEditDialog(card: RateCardRecord) {
    setEditingId(card.id)
    setForm({
      invoiceNo: card.invoiceNo,
      recipientName: card.recipientName,
      date: card.date,
      deliveryDate: card.deliveryDate || card.date,
      dealerId: card.dealerId ?? '',
      saleType: card.saleType ?? DEFAULT_SALE_TYPE,
      remarks: card.remarks ?? '',
      items: card.items.map(toLineItemForm),
    })
    setFormError(null)
    setShowBreakdown(false)
    setDialogOpen(true)
  }

  function updateItem(key: string, patch: Partial<LineItemForm>) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }))
  }

  function addItem() {
    setForm((current) => ({ ...current, items: [...current.items, emptyLineItem()] }))
  }

  function removeItem(key: string) {
    setForm((current) => ({ ...current, items: current.items.filter((item) => item.key !== key) }))
  }

  async function handleSave() {
    setFormError(null)

    if (!form.invoiceNo.trim()) {
      setFormError('Invoice number is required.')
      return
    }
    if (!form.recipientName.trim()) {
      setFormError('Dealer / recipient name is required.')
      return
    }

    const items: RateCardLineItem[] = form.items
      .filter((item) => item.productName.trim())
      .map((item) => ({
        productId: item.finishedGoodsId ? undefined : item.productId || undefined,
        finishedGoodsId: item.finishedGoodsId || undefined,
        productName: item.productName.trim(),
        qty: Number(item.qty) || 0,
        rawRate: Number(item.rawRate) || 0,
        manufRate: Number(item.manufRate) || 0,
        depotRate: Number(item.depotRate) || 0,
        dealerRate: Number(item.dealerRate) || 0,
        tpRate: Number(item.tpRate) || 0,
        mrpRate: Number(item.mrpRate) || 0,
        perCtnBgs: item.perCtnBgs.trim() || undefined,
        srCommissionPercent: Number(item.srCommissionPercent) || 0,
        tpPercent: Number(item.tpPercent) || 0,
      }))

    if (items.length === 0) {
      setFormError('Add at least one product line.')
      return
    }

    setSaving(true)
    try {
      await saveRateCard(
        {
          invoiceNo: form.invoiceNo.trim(),
          recipientName: form.recipientName.trim(),
          date: form.date,
          deliveryDate: form.deliveryDate || undefined,
          dealerId: form.dealerId || undefined,
          saleType: form.saleType,
          remarks: form.remarks.trim() || undefined,
          items,
        },
        editingId ?? undefined
      )
      setDialogOpen(false)
      setFeedback(editingId ? 'Rate card updated.' : 'Rate card created — print any of the three vouchers from the row actions.')
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Unable to save rate card.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(card: RateCardRecord) {
    setFeedback(null)
    try {
      await deleteRateCard(card.id)
      setFeedback(`Deleted rate card ${card.invoiceNo}.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete rate card.')
    }
  }

  function openPrintWindow(html: string) {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <AdminShell active="Invoice">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Rate cards</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{rateCards.length.toLocaleString('en-BD')}</p>
              <p className="mt-1 text-xs text-muted-foreground">Each prints as Company, Depot &amp; Dealer vouchers</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total dealer sales value</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {formatAmount(rateCards.reduce((sum, card) => sum + card.dealerRateTotal, 0))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Across all saved rate cards</p>
            </CardContent>
          </Card>
        </div>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Rate Card / Costing Sheet</CardTitle>
              <CardDescription>
                One invoice input generates all three vouchers — Company, Depot and Dealer each print (or save as
                PDF) separately from the row actions below.
              </CardDescription>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search invoice no or dealer"
                />
              </div>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                New Rate Card
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Dealer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Sale Type</TableHead>
                    <TableHead className="text-right">Goods Amount</TableHead>
                    <TableHead className="text-right">Depot Net Profit</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRateCards.map((card) => {
                    const isCommission = isCommissionSaleType(card.saleType, dealerCategories)
                    const isTradeSales = isTradeSalesType(card.saleType, dealerCategories)
                    return (
                    <TableRow key={card.id}>
                      <TableCell className="font-medium">{card.invoiceNo}</TableCell>
                      <TableCell>{card.recipientName}</TableCell>
                      <TableCell>{formatDate(card.date)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {saleTypeLabel(card.saleType, dealerCategories) ?? 'Unclassified'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatAmount(card.dealerRateTotal)}</TableCell>
                      <TableCell className="text-right">{formatAmount(card.dealerRateTotal - card.depotRateTotal)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(card)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPrintWindow(buildRateCardHtml(card, isCommission, dealerForId(card.dealerId)))}>
                              <Printer className="mr-2 h-4 w-4" /> Print Company voucher
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPrintWindow(buildDepotInvoiceHtml(card, isCommission, depotForDealerId(card.dealerId), dealerForId(card.dealerId)))}>
                              <Printer className="mr-2 h-4 w-4" /> Print Depot voucher
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPrintWindow(buildDealerInvoiceHtml(card, isCommission, depotForDealerId(card.dealerId), dealerForId(card.dealerId)))}>
                              <Printer className="mr-2 h-4 w-4" /> Print Dealer voucher
                            </DropdownMenuItem>
                            {isTradeSales ? (
                              <DropdownMenuItem onClick={() => openPrintWindow(buildRetailInvoiceHtml(card, dealerForId(card.dealerId)))}>
                                <Printer className="mr-2 h-4 w-4" /> Print Retail Sales voucher
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(card)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )})}
                  {filteredRateCards.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        <Calculator className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        No rate cards yet. Create one to build a Company/Depot/Dealer voucher.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-5xl overflow-y-auto p-0 sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-4.5 w-4.5" />
              </span>
              <div>
                <DialogTitle>{editingId ? 'Edit rate card' : 'New rate card'}</DialogTitle>
                <DialogDescription>One entry — print the Company, Depot or Dealer voucher from it anytime.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 px-6 pb-6">
            <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Invoice No</label>
                <Input
                  value={form.invoiceNo}
                  onChange={(event) => setForm((current) => ({ ...current, invoiceNo: event.target.value }))}
                  placeholder="M-001/09"
                  className="bg-background"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Dealer</label>
                <Combobox
                  options={dealerOptions}
                  value={form.dealerId}
                  onChange={(value) => {
                    const selected = dealers.find((dealer) => dealer.id === value)
                    setForm((current) => ({
                      ...current,
                      dealerId: value,
                      recipientName: selected?.name || current.recipientName,
                    }))
                  }}
                  placeholder="Select a dealer"
                  searchPlaceholder="Search dealers..."
                  emptyText="No dealers found — add one in Dealer List first."
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Order date</label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                  className="bg-background"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Delivery date</label>
                <Input
                  type="date"
                  value={form.deliveryDate}
                  onChange={(event) => setForm((current) => ({ ...current, deliveryDate: event.target.value }))}
                  className="bg-background"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Sale type</label>
                <Select
                  value={form.saleType}
                  onValueChange={(value) => setForm((current) => ({ ...current, saleType: value as SaleType }))}
                >
                  <SelectTrigger className="bg-background"><SelectValue placeholder="Select sale type" /></SelectTrigger>
                  <SelectContent>
                    {saleTypeOptions.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Options come from Dealer Category — a category named "Commission ..." switches the product lines
                  below to the Discount Product List and feeds the Commission vs Others split in Sales Reports.
                </p>
              </div>
            </div>

            {/* Cards, not a <Table>, on purpose — the Combobox's dropdown is
                absolutely positioned relative to this row, and a horizontally
                scrolling table (overflow-x-auto) clips that popover to a tiny
                sliver instead of letting it float over the rest of the row. */}
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Product lines</p>
              {form.items.map((item, index) => {
                const cartonSize = parsePerCtnMultiplier(item.perCtnBgs)
                const totalPieces = (Number(item.qty) || 0) * cartonSize
                const lineTotal = totalPieces * (Number(item.dealerRate) || 0)
                return (
                  <div
                    key={item.key}
                    className="space-y-5 rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-colors hover:border-border"
                  >
                    <div className="flex items-center gap-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Combobox
                          options={formIsCommission ? discountProductOptions : productAndFinishedGoodsOptions}
                          value={item.finishedGoodsId || item.productId}
                          onChange={(value) => {
                            // Commission-based sale — pick from the Discount Product List
                            // instead, and run the SR Commission %/TP % chain (see
                            // computeDiscountProductRates) so the Dealer/TP rates below are
                            // fully replaced with the commission-inclusive rates, not merely
                            // prefilled once like the regular-product branch below.
                            if (formIsCommission) {
                              const selected = discountProducts.find((product) => product.id === value)
                              if (!selected) return
                              const { srRate, tpRate } = computeDiscountProductRates(
                                selected.dealerRate,
                                selected.srCommissionPercent,
                                selected.tpPercent
                              )
                              updateItem(item.key, {
                                productId: value,
                                finishedGoodsId: '',
                                productName: selected.name,
                                perCtnBgs: selected.perCtnBgs ?? '',
                                rawRate: String(selected.rawRate),
                                manufRate: String(selected.manufRate),
                                depotRate: String(selected.depotRate),
                                dealerRate: String(Number(srRate.toFixed(2))),
                                tpRate: String(Number(tpRate.toFixed(2))),
                                mrpRate: String(selected.mrpRate),
                                srCommissionPercent: String(selected.srCommissionPercent),
                                tpPercent: String(selected.tpPercent),
                              })
                              return
                            }

                            // Finished Goods (a Production batch's output) — picked from
                            // the same combobox as the regular Product List, distinguished
                            // by its "Finished Goods" sublabel. Leaves Total pieces (/ctn)
                            // blank/1 rather than copying its pack size in: that field is a
                            // pieces-per-carton multiplier and the pack size (e.g. "2.5 Kg")
                            // is a weight label, not a multiplier — qty here already counts
                            // finished units directly (see rateCardStockPieces in
                            // provider.tsx, which is what actually moves this stock).
                            const selectedFinishedGoods = finishedGoodsById.get(value)
                            if (selectedFinishedGoods) {
                              updateItem(item.key, {
                                productId: '',
                                finishedGoodsId: value,
                                productName: selectedFinishedGoods.name,
                                perCtnBgs: '',
                                rawRate: item.rawRate === '0' ? String(selectedFinishedGoods.rawRate) : item.rawRate,
                                manufRate: item.manufRate === '0' ? String(selectedFinishedGoods.manufRate) : item.manufRate,
                                depotRate: item.depotRate === '0' ? String(selectedFinishedGoods.depotRate) : item.depotRate,
                                dealerRate: item.dealerRate === '0' ? String(selectedFinishedGoods.dealerRate) : item.dealerRate,
                                tpRate: item.tpRate === '0' ? String(selectedFinishedGoods.tpRate ?? 0) : item.tpRate,
                                mrpRate: item.mrpRate === '0' ? String(selectedFinishedGoods.mrpRate ?? 0) : item.mrpRate,
                                srCommissionPercent: '0',
                                tpPercent: '0',
                              })
                              return
                            }

                            const selected = products.find((product) => product.id === value)
                            updateItem(item.key, {
                              productId: value,
                              finishedGoodsId: '',
                              productName: selected?.name ?? item.productName,
                              // Carton size defaults from the product (Edit product →
                              // Carton size) but stays editable per line below — the
                              // "/ctn" field next to Total pieces — for one-off overrides.
                              perCtnBgs: selected?.packSize ?? '',
                              // Only prefill each rate the first time — never overwrite a
                              // rate the user has already typed. Source: the product's own
                              // Rate Card defaults (Edit product → Rate Card rates).
                              rawRate: item.rawRate === '0' ? String(selected?.rawRate ?? 0) : item.rawRate,
                              manufRate: item.manufRate === '0' ? String(selected?.manufRate ?? 0) : item.manufRate,
                              depotRate: item.depotRate === '0' ? String(selected?.depotRate ?? 0) : item.depotRate,
                              dealerRate: item.dealerRate === '0' ? String(selected?.dealerRate ?? 0) : item.dealerRate,
                              tpRate: item.tpRate === '0' ? String(selected?.tpRate ?? 0) : item.tpRate,
                              mrpRate: item.mrpRate === '0' ? String(selected?.mrpRate ?? 0) : item.mrpRate,
                              srCommissionPercent: '0',
                              tpPercent: '0',
                            })
                          }}
                          placeholder={formIsCommission ? 'Select a discount product' : 'Select a product'}
                          searchPlaceholder={
                            formIsCommission ? 'Search discount products...' : 'Search products...'
                          }
                          emptyText={
                            formIsCommission
                              ? 'No discount products found — add one in Discount Product List first.'
                              : undefined
                          }
                        />
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Line total</p>
                        <p className="text-base font-semibold tabular-nums">{formatAmount(lineTotal)}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.key)}
                        disabled={form.items.length === 1}
                        aria-label={`Remove product ${index + 1}`}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Quantity
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-sm text-muted-foreground">Qty</label>
                            <Input
                              type="number"
                              value={item.qty}
                              onChange={(event) => updateItem(item.key, { qty: event.target.value })}
                              className="h-10 bg-background text-base"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm text-muted-foreground">Total pieces</label>
                            <div className="relative">
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={item.perCtnBgs}
                                onChange={(event) => updateItem(item.key, { perCtnBgs: event.target.value })}
                                className="h-10 bg-background pr-12 text-base tabular-nums"
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                                /ctn
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              = {totalPieces.toLocaleString('en-BD')} pcs total
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Costing
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-sm text-muted-foreground">Raw M</label>
                            <Input
                              type="number"
                              value={item.rawRate}
                              onChange={(event) => updateItem(item.key, { rawRate: event.target.value })}
                              className="h-10 bg-background text-base"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm text-muted-foreground">Manuf</label>
                            <Input
                              type="number"
                              value={item.manufRate}
                              onChange={(event) => updateItem(item.key, { manufRate: event.target.value })}
                              className="h-10 bg-background text-base"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Trade rates
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-sm text-muted-foreground">Depot</label>
                            <Input
                              type="number"
                              value={item.depotRate}
                              onChange={(event) => updateItem(item.key, { depotRate: event.target.value })}
                              className="h-10 bg-background text-base"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm text-muted-foreground">Dealer</label>
                            <Input
                              type="number"
                              value={item.dealerRate}
                              onChange={(event) => updateItem(item.key, { dealerRate: event.target.value })}
                              className="h-10 bg-background text-base"
                            />
                          </div>
                        </div>
                        {formIsCommission && item.srCommissionPercent !== '0' ? (
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                            Includes {item.srCommissionPercent}% SR commission over Depot S R
                            {Number(item.tpPercent) ? ` · TP +${item.tpPercent}%` : ''}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Market rates
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-sm text-muted-foreground">TP</label>
                            <Input
                              type="number"
                              value={item.tpRate}
                              onChange={(event) => updateItem(item.key, { tpRate: event.target.value })}
                              className="h-10 bg-background text-base"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm text-muted-foreground">MRP</label>
                            <Input
                              type="number"
                              value={item.mrpRate}
                              onChange={(event) => updateItem(item.key, { mrpRate: event.target.value })}
                              className="h-10 bg-background text-base"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-right sm:hidden">
                      <span className="text-sm text-muted-foreground">Line total: </span>
                      <span className="text-base font-semibold tabular-nums">{formatAmount(lineTotal)}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="mr-2 h-4 w-4" /> Add product line
              </Button>
              <p className="text-xs text-muted-foreground">
                {formIsCommission
                  ? 'Products are pulled from Discount Product List — selecting one auto-fills the SR Rate/TP with the commission already applied.'
                  : 'Product missing from the list? Add it first from Product List. Same product twice (e.g. a different bag/carton size) is fine — add a second line.'}
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-background p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-foreground">
                    <Package className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">Goods Amount</p>
                    <p className="text-lg font-semibold tabular-nums">{formatAmount(totals.dealerRateTotal)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">Depot Net Profit</p>
                    <p className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatAmount(depotNetProfit)}
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowBreakdown((current) => !current)}
                className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                {showBreakdown ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Full breakdown
              </button>

              {showBreakdown ? (
                <div className="mt-3 space-y-4 border-t pt-3 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground">Raw Rate total</p>
                      <p className="font-semibold tabular-nums">{formatAmount(totals.rawRateTotal)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Manuf Rate total</p>
                      <p className="font-semibold tabular-nums">{formatAmount(totals.manufRateTotal)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Depot Rate total</p>
                      <p className="font-semibold tabular-nums">{formatAmount(totals.depotRateTotal)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Pouch/Carton amount</p>
                      <p className="font-semibold tabular-nums">{formatAmount(totals.pouchCartonAmount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Usable money (÷ Depot)</p>
                      <p className="font-semibold tabular-nums">
                        {formatAmount(totals.usableMoney)} · {totals.usableMoneyPercent.toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Usable u Depot</p>
                      <p className="font-semibold tabular-nums">
                        {formatAmount(totals.usableUDepot)} · {totals.usableUDepotPercent.toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Selling total (TP total)</p>
                      <p className="font-semibold tabular-nums">{formatAmount(totals.tpRateTotal)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Consumer total (MRP total)</p>
                      <p className="font-semibold tabular-nums">{formatAmount(totals.mrpRateTotal)}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">মন্তব্য / Remarks</label>
              <Textarea
                value={form.remarks}
                onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))}
                rows={2}
              />
            </div>

            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          </div>

          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-border/60 bg-background/95 px-6 py-4 backdrop-blur">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create rate card'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

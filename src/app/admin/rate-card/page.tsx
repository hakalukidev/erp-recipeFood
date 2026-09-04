"use client"

import { useMemo, useState } from 'react'
import { Calculator, ChevronDown, ChevronRight, Plus, Printer, Search, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
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
import { useERP } from '@/lib/erp/provider'
import type { RateCardLineItem, RateCardRecord } from '@/lib/erp/types'
import { createId, formatDate, sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'

// Company letterhead used on every printed voucher — matches the client's
// paper invoices (Moyner Mor / Mymensingh Sadar office), not the Dhaka
// office used on the Price Quotation screen.
const COMPANY_NAME = 'Recipe Food Products Limited'
const COMPANY_ADDRESS = 'Moyner Mor, Mymensingh Sadar, Mymensingh'
const COMPANY_EMAIL = 'recipeinfo2020@gmail.com'
const COMPANY_HELPLINE = '+8801790787093'

const RATE_COLUMN_LABELS: Record<'raw' | 'manuf' | 'depot' | 'dealer', { unit: string; total: string }> = {
  raw: { unit: 'Raw M', total: 'Raw Rate' },
  manuf: { unit: 'Mnu Ra', total: 'Manuf Rate' },
  depot: { unit: 'Dep Rate', total: 'Depot Rate' },
  dealer: { unit: 'Del Rate', total: 'Delar Rate' },
}

type LineItemForm = {
  key: string
  productId: string
  productName: string
  qty: string
  rawRate: string
  manufRate: string
  depotRate: string
  dealerRate: string
  tpRate: string
  mrpRate: string
  perCtnBgs: string
}

function emptyLineItem(): LineItemForm {
  return {
    key: createId('line'),
    productId: '',
    productName: '',
    qty: '1',
    rawRate: '0',
    manufRate: '0',
    depotRate: '0',
    dealerRate: '0',
    tpRate: '0',
    mrpRate: '0',
    perCtnBgs: '',
  }
}

type RateCardForm = {
  invoiceNo: string
  recipientName: string
  date: string
  deliveryDate: string
  dealerId: string
  depotName: string
  depotAddress: string
  depotMobile: string
  depotHelpline: string
  previousDue: string
  damage: string
  routeDiscount: string
  targetIncentive: string
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
    depotName: '',
    depotAddress: '',
    depotMobile: '',
    depotHelpline: '',
    previousDue: '0',
    damage: '0',
    routeDiscount: '0',
    targetIncentive: '0',
    remarks: '',
    items: [emptyLineItem()],
  }
}

function toLineItemForm(item: RateCardLineItem): LineItemForm {
  return {
    key: createId('line'),
    productId: item.productId ?? '',
    productName: item.productName,
    qty: String(item.qty),
    rawRate: String(item.rawRate),
    manufRate: String(item.manufRate),
    depotRate: String(item.depotRate),
    dealerRate: String(item.dealerRate),
    tpRate: String(item.tpRate ?? 0),
    mrpRate: String(item.mrpRate ?? 0),
    perCtnBgs: item.perCtnBgs ?? '',
  }
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
    qty: Number(item.qty) || 0,
    rawRate: Number(item.rawRate) || 0,
    manufRate: Number(item.manufRate) || 0,
    depotRate: Number(item.depotRate) || 0,
    dealerRate: Number(item.dealerRate) || 0,
    tpRate: Number(item.tpRate) || 0,
    mrpRate: Number(item.mrpRate) || 0,
  }))
  const rawRateTotal = parsed.reduce((sum, item) => sum + item.qty * item.rawRate, 0)
  const manufRateTotal = parsed.reduce((sum, item) => sum + item.qty * item.manufRate, 0)
  const depotRateTotal = parsed.reduce((sum, item) => sum + item.qty * item.depotRate, 0)
  const dealerRateTotal = parsed.reduce((sum, item) => sum + item.qty * item.dealerRate, 0)
  const tpRateTotal = parsed.reduce((sum, item) => sum + item.qty * item.tpRate, 0)
  const mrpRateTotal = parsed.reduce((sum, item) => sum + item.qty * item.mrpRate, 0)
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
function buildRateCardHtml(rateCard: RateCardRecord) {
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
        <td>${escapeHtml(item.productName)}</td>
        <td class="numeric">${item.qty}</td>
        ${columns.map((column) => `<td class="numeric">${formatAmount(rateValue(item, column))}</td>`).join('')}
        <td>${escapeHtml(item.perCtnBgs ?? '')}</td>
        ${columns.map((column) => `<td class="numeric">${formatAmount(item.qty * rateValue(item, column))}</td>`).join('')}
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
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <p class="title">${escapeHtml(COMPANY_NAME)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_ADDRESS)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_EMAIL)} &middot; Help Line: ${escapeHtml(COMPANY_HELPLINE)}</p>
        <p class="subtitle">Company (internal) Voucher</p>
        <table class="meta">
          <tr><td>Dealer Name:</td><td>${escapeHtml(rateCard.recipientName)}</td></tr>
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
              ${columns.map((column) => `<th>${RATE_COLUMN_LABELS[column].unit}</th>`).join('')}
              <th>Per Ctn/Bgs</th>
              ${columns.map((column) => `<th>${RATE_COLUMN_LABELS[column].total}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}${totalsRow}</tbody>
        </table>
        ${rateCard.remarks ? `<p class="remarks"><strong>মন্তব্য:</strong> ${escapeHtml(rateCard.remarks)}</p>` : ''}
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

const PARTY_BOX_STYLES = `
          .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; color: #0f766e; }
          .company-meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
          .top { display: flex; justify-content: flex-end; margin-top: 12px; }
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
          @media print { button { display: none; } }
`

// Depot → Dealer invoice: shows DP (= dealerRate, what the dealer pays) and
// TP (= tpRate, what the dealer resells at), and settles a running account
// (previousDue, damage, routeDiscount, targetIncentive → depotReceivable).
function buildDealerInvoiceHtml(rateCard: RateCardRecord) {
  const rows = rateCard.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td class="numeric">${item.qty}</td>
        <td class="numeric">${formatAmount(item.dealerRate)}</td>
        <td class="numeric">${formatAmount(item.tpRate ?? 0)}</td>
        <td>${escapeHtml(item.perCtnBgs ?? '')}</td>
        <td class="numeric">${formatAmount(item.qty * item.dealerRate)}</td>
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

        <div class="top">
          <table class="meta">
            <tr><td>Order Date:</td><td>${escapeHtml(rateCard.date)}</td></tr>
            <tr><td>Delivery Date:</td><td>${escapeHtml(rateCard.deliveryDate || rateCard.date)}</td></tr>
            <tr><td>Dealer Name:</td><td>${escapeHtml(rateCard.recipientName)}</td></tr>
            <tr><td>Order No:</td><td>${escapeHtml(rateCard.invoiceNo)}</td></tr>
            <tr><td>Goods Amount:</td><td class="numeric hl">${formatAmount(rateCard.dealerRateTotal)}</td></tr>
            <tr><td>Previous Due:</td><td class="numeric">${formatAmount(rateCard.previousDue ?? 0)}</td></tr>
            <tr><td>Damage:</td><td class="numeric">${formatAmount(rateCard.damage ?? 0)}</td></tr>
            <tr><td>Route Discount:</td><td class="numeric">${formatAmount(rateCard.routeDiscount ?? 0)}</td></tr>
            <tr><td>Target Incentive:</td><td class="numeric">${formatAmount(rateCard.targetIncentive ?? 0)}</td></tr>
            <tr><td>Depot Will Receive:</td><td class="numeric hl">${formatAmount(rateCard.depotReceivable)}</td></tr>
          </table>
        </div>

        <div class="parties">
          <div class="party">
            <p class="label">From</p>
            <p class="name">${escapeHtml(rateCard.depotName || 'Depot')}</p>
            ${rateCard.depotAddress ? `<p>${escapeHtml(rateCard.depotAddress)}</p>` : ''}
            ${rateCard.depotMobile ? `<p>Mob: ${escapeHtml(rateCard.depotMobile)}</p>` : ''}
            ${rateCard.depotHelpline ? `<p>Help Line: ${escapeHtml(rateCard.depotHelpline)}</p>` : ''}
          </div>
          <div class="party">
            <p class="label">To &middot; Dealer</p>
            <p class="name">${escapeHtml(rateCard.recipientName)}</p>
          </div>
        </div>

        <table class="doc">
          <thead>
            <tr>
              <th>SL NO</th>
              <th>Description of Products</th>
              <th>QTY</th>
              <th>DP</th>
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
function buildDepotInvoiceHtml(rateCard: RateCardRecord) {
  const depotNetProfit = rateCard.dealerRateTotal - rateCard.depotRateTotal

  const rows = rateCard.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td class="numeric">${item.qty}</td>
        <td class="numeric">${formatAmount(item.depotRate)}</td>
        <td class="numeric">${formatAmount(item.dealerRate)}</td>
        <td>${escapeHtml(item.perCtnBgs ?? '')}</td>
        <td class="numeric">${formatAmount(item.qty * item.depotRate)}</td>
        <td class="numeric">${formatAmount(item.qty * item.dealerRate)}</td>
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

        <div class="top">
          <table class="meta">
            <tr><td>Order Date:</td><td>${escapeHtml(rateCard.date)}</td></tr>
            <tr><td>Delivery Date:</td><td>${escapeHtml(rateCard.deliveryDate || rateCard.date)}</td></tr>
            <tr><td>Depot Name:</td><td>${escapeHtml(rateCard.depotName || rateCard.recipientName)}</td></tr>
            <tr><td>Dealer Name:</td><td>${escapeHtml(rateCard.recipientName)}</td></tr>
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
            <p class="name">${escapeHtml(rateCard.depotName || rateCard.recipientName)}</p>
            ${rateCard.depotAddress ? `<p>${escapeHtml(rateCard.depotAddress)}</p>` : ''}
            ${rateCard.depotMobile ? `<p>Mob: ${escapeHtml(rateCard.depotMobile)}</p>` : ''}
            ${rateCard.depotHelpline ? `<p>Help Line: ${escapeHtml(rateCard.depotHelpline)}</p>` : ''}
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
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

export default function RateCardPage() {
  const { data, saveRateCard, deleteRateCard } = useERP()
  const rateCards = useMemo(() => sortByCreatedAtDesc(toArray(data?.rateCards)), [data?.rateCards])
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const dealers = useMemo(() => toArray(data?.dealers), [data?.dealers])
  const productOptions: ComboboxOption[] = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        sublabel: [product.category, product.sku].filter(Boolean).join(' · '),
      })),
    [products]
  )
  const dealerOptions: ComboboxOption[] = useMemo(
    () =>
      dealers.map((dealer) => ({
        value: dealer.id,
        label: dealer.name,
        sublabel: dealer.phone,
      })),
    [dealers]
  )

  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RateCardForm>(emptyRateCardForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showDepotDetails, setShowDepotDetails] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const filteredRateCards = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return rateCards
    return rateCards.filter((card) => [card.invoiceNo, card.recipientName].join(' ').toLowerCase().includes(normalized))
  }, [rateCards, query])

  const totals = useMemo(() => computeTotals(form.items), [form.items])
  const depotNetProfit = totals.dealerRateTotal - totals.depotRateTotal
  const depotReceivable = useMemo(
    () =>
      totals.dealerRateTotal +
      (Number(form.previousDue) || 0) -
      (Number(form.damage) || 0) -
      (Number(form.routeDiscount) || 0) -
      (Number(form.targetIncentive) || 0),
    [totals.dealerRateTotal, form.previousDue, form.damage, form.routeDiscount, form.targetIncentive]
  )

  function openCreateDialog() {
    setEditingId(null)
    setForm(emptyRateCardForm())
    setFormError(null)
    setShowDepotDetails(false)
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
      depotName: card.depotName ?? '',
      depotAddress: card.depotAddress ?? '',
      depotMobile: card.depotMobile ?? '',
      depotHelpline: card.depotHelpline ?? '',
      previousDue: String(card.previousDue ?? 0),
      damage: String(card.damage ?? 0),
      routeDiscount: String(card.routeDiscount ?? 0),
      targetIncentive: String(card.targetIncentive ?? 0),
      remarks: card.remarks ?? '',
      items: card.items.map(toLineItemForm),
    })
    setFormError(null)
    // Already has depot/account data from before — show it open rather than
    // hiding what was already filled in.
    setShowDepotDetails(Boolean(card.depotName || card.previousDue || card.damage || card.routeDiscount || card.targetIncentive))
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
        productId: item.productId || undefined,
        productName: item.productName.trim(),
        qty: Number(item.qty) || 0,
        rawRate: Number(item.rawRate) || 0,
        manufRate: Number(item.manufRate) || 0,
        depotRate: Number(item.depotRate) || 0,
        dealerRate: Number(item.dealerRate) || 0,
        tpRate: Number(item.tpRate) || 0,
        mrpRate: Number(item.mrpRate) || 0,
        perCtnBgs: item.perCtnBgs.trim() || undefined,
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
          depotName: form.depotName.trim() || undefined,
          depotAddress: form.depotAddress.trim() || undefined,
          depotMobile: form.depotMobile.trim() || undefined,
          depotHelpline: form.depotHelpline.trim() || undefined,
          previousDue: Number(form.previousDue) || 0,
          damage: Number(form.damage) || 0,
          routeDiscount: Number(form.routeDiscount) || 0,
          targetIncentive: Number(form.targetIncentive) || 0,
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
    <AdminShell active="Rate Card / Costing">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
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
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total depot receivable</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {formatAmount(rateCards.reduce((sum, card) => sum + card.depotReceivable, 0))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Goods Amount + due − damage − discount − incentive</p>
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
                    <TableHead className="text-right">Goods Amount</TableHead>
                    <TableHead className="text-right">Depot Net Profit</TableHead>
                    <TableHead className="text-right">Depot Receivable</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRateCards.map((card) => (
                    <TableRow key={card.id}>
                      <TableCell className="font-medium">{card.invoiceNo}</TableCell>
                      <TableCell>{card.recipientName}</TableCell>
                      <TableCell>{formatDate(card.date)}</TableCell>
                      <TableCell className="text-right">{formatAmount(card.dealerRateTotal)}</TableCell>
                      <TableCell className="text-right">{formatAmount(card.dealerRateTotal - card.depotRateTotal)}</TableCell>
                      <TableCell className="text-right">{formatAmount(card.depotReceivable)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(card)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPrintWindow(buildRateCardHtml(card))}>
                              <Printer className="mr-2 h-4 w-4" /> Print Company voucher
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPrintWindow(buildDepotInvoiceHtml(card))}>
                              <Printer className="mr-2 h-4 w-4" /> Print Depot voucher
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPrintWindow(buildDealerInvoiceHtml(card))}>
                              <Printer className="mr-2 h-4 w-4" /> Print Dealer voucher
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(card)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
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
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-5xl overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit rate card' : 'New rate card'}</DialogTitle>
            <DialogDescription>One entry — print the Company, Depot or Dealer voucher from it anytime.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Invoice No</label>
                <Input
                  value={form.invoiceNo}
                  onChange={(event) => setForm((current) => ({ ...current, invoiceNo: event.target.value }))}
                  placeholder="M-001/09"
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
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Delivery date</label>
                <Input
                  type="date"
                  value={form.deliveryDate}
                  onChange={(event) => setForm((current) => ({ ...current, deliveryDate: event.target.value }))}
                />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowDepotDetails((current) => !current)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                {showDepotDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Depot &amp; account details <span className="text-xs">(optional — used on the Depot and Dealer vouchers)</span>
              </button>
              {showDepotDetails ? (
                <div className="mt-3 space-y-4 rounded-lg bg-muted/30 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Input
                      value={form.depotName}
                      onChange={(event) => setForm((current) => ({ ...current, depotName: event.target.value }))}
                      placeholder="Depot / distributor name"
                    />
                    <Input
                      value={form.depotAddress}
                      onChange={(event) => setForm((current) => ({ ...current, depotAddress: event.target.value }))}
                      placeholder="Address"
                    />
                    <Input
                      value={form.depotMobile}
                      onChange={(event) => setForm((current) => ({ ...current, depotMobile: event.target.value }))}
                      placeholder="Mobile"
                    />
                    <Input
                      value={form.depotHelpline}
                      onChange={(event) => setForm((current) => ({ ...current, depotHelpline: event.target.value }))}
                      placeholder="Help line"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Previous due</label>
                      <Input
                        type="number"
                        value={form.previousDue}
                        onChange={(event) => setForm((current) => ({ ...current, previousDue: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Damage</label>
                      <Input
                        type="number"
                        value={form.damage}
                        onChange={(event) => setForm((current) => ({ ...current, damage: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Route discount</label>
                      <Input
                        type="number"
                        value={form.routeDiscount}
                        onChange={(event) => setForm((current) => ({ ...current, routeDiscount: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Target incentive</label>
                      <Input
                        type="number"
                        value={form.targetIncentive}
                        onChange={(event) => setForm((current) => ({ ...current, targetIncentive: event.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Cards, not a <Table>, on purpose — the Combobox's dropdown is
                absolutely positioned relative to this row, and a horizontally
                scrolling table (overflow-x-auto) clips that popover to a tiny
                sliver instead of letting it float over the rest of the row. */}
            <div className="space-y-3">
              {form.items.map((item, index) => (
                <div key={item.key} className="space-y-3 rounded-lg bg-muted/30 p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Combobox
                        options={productOptions}
                        value={item.productId}
                        onChange={(value) => {
                          const selected = products.find((product) => product.id === value)
                          updateItem(item.key, {
                            productId: value,
                            productName: selected?.name ?? item.productName,
                            // Only prefill Raw M the first time — never overwrite a rate
                            // the user has already typed.
                            rawRate: item.rawRate === '0' ? String(selected?.purchasePrice ?? 0) : item.rawRate,
                          })
                        }}
                        placeholder="Select a product"
                        searchPlaceholder="Search products..."
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(item.key)}
                      disabled={form.items.length === 1}
                      aria-label={`Remove product ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">QTY</label>
                      <Input
                        type="number"
                        value={item.qty}
                        onChange={(event) => updateItem(item.key, { qty: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Raw M</label>
                      <Input
                        type="number"
                        value={item.rawRate}
                        onChange={(event) => updateItem(item.key, { rawRate: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Mnu Ra</label>
                      <Input
                        type="number"
                        value={item.manufRate}
                        onChange={(event) => updateItem(item.key, { manufRate: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Dep Rate</label>
                      <Input
                        type="number"
                        value={item.depotRate}
                        onChange={(event) => updateItem(item.key, { depotRate: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Del Rate</label>
                      <Input
                        type="number"
                        value={item.dealerRate}
                        onChange={(event) => updateItem(item.key, { dealerRate: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">TP Rate</label>
                      <Input
                        type="number"
                        value={item.tpRate}
                        onChange={(event) => updateItem(item.key, { tpRate: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">MRP Rate</label>
                      <Input
                        type="number"
                        value={item.mrpRate}
                        onChange={(event) => updateItem(item.key, { mrpRate: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Per Ctn/Bgs</label>
                      <Input
                        value={item.perCtnBgs}
                        onChange={(event) => updateItem(item.key, { perCtnBgs: event.target.value })}
                        placeholder="500 ps = 1 bg"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="mr-2 h-4 w-4" /> Add product line
              </Button>
              <p className="text-xs text-muted-foreground">
                Product missing from the list? Add it first from Inventory / Stock. Same product twice (e.g. a
                different bag/carton size) is fine — add a second line.
              </p>
            </div>

            <div className="rounded-lg bg-muted/30 p-4">
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div>
                  <p className="text-muted-foreground">Goods Amount</p>
                  <p className="text-lg font-semibold">{formatAmount(totals.dealerRateTotal)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Depot Net Profit</p>
                  <p className="text-lg font-semibold text-primary">{formatAmount(depotNetProfit)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Depot Receivable</p>
                  <p className="text-lg font-semibold text-primary">{formatAmount(depotReceivable)}</p>
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
                      <p className="font-semibold">{formatAmount(totals.rawRateTotal)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Manuf Rate total</p>
                      <p className="font-semibold">{formatAmount(totals.manufRateTotal)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Depot Rate total</p>
                      <p className="font-semibold">{formatAmount(totals.depotRateTotal)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Pouch/Carton amount</p>
                      <p className="font-semibold">{formatAmount(totals.pouchCartonAmount)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Usable money (÷ Depot)</p>
                      <p className="font-semibold">
                        {formatAmount(totals.usableMoney)} · {totals.usableMoneyPercent.toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Usable u Depot</p>
                      <p className="font-semibold">
                        {formatAmount(totals.usableUDepot)} · {totals.usableUDepotPercent.toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Selling total (TP total)</p>
                      <p className="font-semibold">{formatAmount(totals.tpRateTotal)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Consumer total (MRP total)</p>
                      <p className="font-semibold">{formatAmount(totals.mrpRateTotal)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Damage / discount / incentive</p>
                      <p className="font-semibold">
                        {formatAmount(
                          (Number(form.damage) || 0) + (Number(form.routeDiscount) || 0) + (Number(form.targetIncentive) || 0)
                        )}
                      </p>
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

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create rate card'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

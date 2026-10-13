"use client"

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Edit,
  Factory,
  Layers,
  Minus,
  Package,
  Plus,
  Printer,
  Search,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { RecordApprovalTag } from '@/components/admin/ApprovalStatusBadge'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { FactoryStockSection } from '@/components/admin/FactoryStockSection'
import { PurchaseLedgerOverview } from '@/components/admin/PurchaseLedgerOverview'
import { VendorPaymentDialog } from '@/components/admin/VendorPaymentDialogs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_HELPLINE,
  COMPANY_INVOICE_FOOTER_NOTE,
  COMPANY_NAME,
} from '@/lib/erp/companyInfo'
import { useERP } from '@/lib/erp/provider'
import type {
  FinishedGoodsRecord,
  MaterialPurchaseRecord,
  PackagingType,
  ProductionBatchRecord,
  PurchaseMaterialCategory,
  PurchaseMaterialRecord,
  PurchaseMaterialUnit,
  PurchaseRecord,
  VendorPaymentRecord,
  VendorRecord,
} from '@/lib/erp/types'
import {
  isCountedEntry,
  computeMaterialAvailablePieces,
  computePackWeightKg,
  computeVendorAccountPayments,
  computeVendorDue,
  createId,
  describePackConversion,
  formatDate,
  formatDateTime,
  sortByCreatedAtDesc,
  toArray,
  dhakaTodayIso,
} from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

function formatAmount(value: number) {
  return value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatQty(value: number) {
  return value.toLocaleString('en-BD', { maximumFractionDigits: 2 })
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const CATEGORY_LABEL: Record<PurchaseMaterialCategory, string> = {
  raw_material: 'Raw Material',
  packaging_material: 'Packaging Material',
}

const PACKAGING_TYPES: PackagingType[] = ['Packet', 'Pouch', 'Carton', 'Bottle', 'Sack', 'Sticker', 'Other']

const UNIT_LABEL: Record<PurchaseMaterialUnit, string> = { kg: 'Kg', pcs: 'Pcs' }

// ---- Material dialog --------------------------------------------------------
type MaterialFormState = {
  name: string
  category: PurchaseMaterialCategory
  packagingType: PackagingType | ''
  unit: PurchaseMaterialUnit
  unitWeightGrams: string
  capacityPerUnit: string
  stockQty: string
  minStock: string
}

const emptyMaterialForm: MaterialFormState = {
  name: '',
  category: 'raw_material',
  packagingType: '',
  unit: 'kg',
  unitWeightGrams: '',
  capacityPerUnit: '',
  stockQty: '0',
  minStock: '0',
}

function formFromMaterial(material: PurchaseMaterialRecord): MaterialFormState {
  return {
    name: material.name,
    category: material.category,
    packagingType: material.packagingType ?? '',
    unit: material.unit,
    unitWeightGrams: material.unitWeightGrams ? String(material.unitWeightGrams) : '',
    capacityPerUnit: material.capacityPerUnit ? String(material.capacityPerUnit) : '',
    stockQty: String(material.stockQty),
    minStock: String(material.minStock),
  }
}

// ---- Finished Goods dialog ---------------------------------------------------
type FinishedGoodsFormState = {
  name: string
  rawMaterialId: string
  packSize: string
  unitWeightKg: string
  pieceWeightGrams: string
  piecesPerUnit: string
  stockQty: string
  minStock: string
  rawRate: string
  manufRate: string
  depotRate: string
  dealerRate: string
  tpRate: string
  mrpRate: string
}

const emptyFinishedGoodsForm: FinishedGoodsFormState = {
  name: '',
  rawMaterialId: '',
  packSize: '',
  unitWeightKg: '0',
  pieceWeightGrams: '',
  piecesPerUnit: '',
  stockQty: '0',
  minStock: '0',
  rawRate: '0',
  manufRate: '0',
  depotRate: '0',
  dealerRate: '0',
  tpRate: '0',
  mrpRate: '0',
}

function formFromFinishedGoods(item: FinishedGoodsRecord): FinishedGoodsFormState {
  return {
    name: item.name,
    rawMaterialId: item.rawMaterialId ?? '',
    packSize: item.packSize ?? '',
    unitWeightKg: String(item.unitWeightKg),
    pieceWeightGrams: item.pieceWeightGrams ? String(item.pieceWeightGrams) : '',
    piecesPerUnit: item.piecesPerUnit ? String(item.piecesPerUnit) : '',
    stockQty: String(item.stockQty),
    minStock: String(item.minStock),
    rawRate: String(item.rawRate),
    manufRate: String(item.manufRate),
    depotRate: String(item.depotRate),
    dealerRate: String(item.dealerRate),
    tpRate: String(item.tpRate ?? 0),
    mrpRate: String(item.mrpRate ?? 0),
  }
}

// ---- Material purchase dialog (2026-10-13) --------------------------------
// Production Entry tab's "New Material Purchase": qty Kg × rate per Kg =
// amount, no vendor/payment/stock — see MaterialPurchaseRecord in types.ts.
type MaterialPurchaseLineDraft = {
  key: string
  materialName: string
  qtyKg: string
  ratePerKg: string
}

function emptyMaterialPurchaseLine(): MaterialPurchaseLineDraft {
  return { key: createId('line'), materialName: '', qtyKg: '', ratePerKg: '' }
}

// ---- Purchase entry dialog --------------------------------------------------
// `amount` can be typed directly (client request, 2026-09-14): whichever of
// rate/amount was edited last is the "basis" — the other one is recomputed
// from it whenever qty changes, so Amount = Qty x Rate stays true either way.
type PurchaseLineDraft = {
  key: string
  materialId?: string
  materialName: string
  unit: PurchaseMaterialUnit
  qty: string
  rate: string
  amount: string
  basis: 'rate' | 'amount'
}

function emptyPurchaseLine(): PurchaseLineDraft {
  return { key: createId('line'), materialName: '', unit: 'kg', qty: '0', rate: '0', amount: '0', basis: 'rate' }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

const PRINT_STYLES = `
          * { box-sizing: border-box; }
          @page { margin: 12mm 16mm; size: A4; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 0; }
          .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; color: #0f766e; }
          .company-meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
          .subtitle { text-align: center; color: #4b5563; font-size: 13px; margin: 10px 0 16px; }
          .meta { border: 1px solid #d1d5db; border-collapse: collapse; margin-bottom: 16px; width: 60%; }
          .meta td { border: 1px solid #d1d5db; padding: 4px 8px; font-size: 13px; }
          .meta td:first-child { font-weight: 600; width: 55%; }
          .hl { background: #ccfbf1; font-weight: 700; }
          table.doc { border-collapse: collapse; width: 100%; }
          table.doc th, table.doc td { border: 1px solid #d1d5db; padding: 5px 7px; font-size: 12.5px; }
          table.doc th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
          .numeric { text-align: right; white-space: nowrap; }
          tr.totals td { font-weight: 700; border-top: 2px solid #111827; }
          .remarks { margin-top: 16px; font-size: 12.5px; }
          .section-heading { font-size: 13px; font-weight: 700; margin: 16px 0 6px; }
          .footnote { text-align: center; font-style: italic; font-size: 11.5px; color: #4b5563; margin-top: 16px; }
          @media print { button { display: none; } }
`

function buildPurchaseVoucherHtml(entry: PurchaseRecord, vendor?: VendorRecord, payments: VendorPaymentRecord[] = []) {
  const rows = entry.items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.materialName)}</td>
        <td>${CATEGORY_LABEL[item.category]}</td>
        <td class="numeric">${formatQty(item.qty)} ${UNIT_LABEL[item.unit]}</td>
        <td class="numeric">${formatAmount(item.rate)}</td>
        <td class="numeric">${formatAmount(item.amount)}</td>
      </tr>
    `
    )
    .join('')

  // Client request (2026-09-13): show the date-wise payment trail instead of
  // just the aggregate Paid figure, like a bank statement — VendorPaymentRecord
  // already carries one row per paydown, this just renders it. The amount paid
  // at purchase-entry time never gets its own VendorPaymentRecord (it's just
  // PurchaseRecord.paid at save time), so it's added back in as the first row.
  const initialPaid = entry.paid - payments.reduce((sum, payment) => sum + payment.amount, 0)
  const historyRows: Array<{ date: string; receiptNumber: string; note?: string; amount: number }> = []
  if (initialPaid > 0) {
    historyRows.push({ date: entry.date, receiptNumber: entry.purchaseNumber, note: 'Paid at purchase time', amount: initialPaid })
  }
  for (const payment of payments) {
    historyRows.push({ date: payment.date, receiptNumber: payment.receiptNumber, note: payment.note, amount: payment.amount })
  }
  historyRows.sort((a, b) => a.date.localeCompare(b.date))
  const paymentRows = historyRows
    .map(
      (row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(formatDate(row.date))}</td>
        <td>${escapeHtml(row.receiptNumber)}</td>
        <td>${row.note ? escapeHtml(row.note) : ''}</td>
        <td class="numeric">${formatAmount(row.amount)}</td>
      </tr>
    `
    )
    .join('')
  const paymentHistoryTable = historyRows.length
    ? `
        <table class="doc" style="margin-top: 16px;">
          <thead>
            <tr>
              <th>SL</th>
              <th>Date</th>
              <th>Receipt No</th>
              <th>Note</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>${paymentRows}</tbody>
          <tr class="totals"><td colspan="4">Total Paid</td><td class="numeric">${formatAmount(entry.paid)}</td></tr>
        </table>
      `
    : ''

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Purchase ${escapeHtml(entry.purchaseNumber)}</title>
        <style>${PRINT_STYLES}</style>
      </head>
      <body>
        <p class="title">${escapeHtml(COMPANY_NAME)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_ADDRESS)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_EMAIL)} &middot; Help Line: ${escapeHtml(COMPANY_HELPLINE)}</p>
        <p class="subtitle">Purchase Voucher</p>
        <table class="meta">
          <tr><td>Purchase No:</td><td>${escapeHtml(entry.purchaseNumber)}</td></tr>
          <tr><td>Vendor:</td><td>${escapeHtml(entry.vendorName)}</td></tr>
          ${vendor?.address ? `<tr><td>Address:</td><td>${escapeHtml(vendor.address)}</td></tr>` : ''}
          ${vendor?.phone ? `<tr><td>Mobile:</td><td>${escapeHtml(vendor.phone)}</td></tr>` : ''}
          <tr><td>Date:</td><td>${escapeHtml(formatDate(entry.date))}</td></tr>
          <tr><td>Total Amount:</td><td class="numeric hl">${formatAmount(entry.totalAmount)}</td></tr>
          <tr><td>Paid:</td><td class="numeric">${formatAmount(entry.paid)}</td></tr>
          <tr><td>Due:</td><td class="numeric hl">${formatAmount(entry.due)}</td></tr>
        </table>
        <table class="doc">
          <thead>
            <tr>
              <th>SL</th>
              <th>Material</th>
              <th>Category</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tr class="totals"><td colspan="5">Total</td><td class="numeric">${formatAmount(entry.totalAmount)}</td></tr>
        </table>
        ${paymentHistoryTable ? `<p class="section-heading">Payment History</p>${paymentHistoryTable}` : ''}
        ${entry.note ? `<p class="remarks"><strong>Note:</strong> ${escapeHtml(entry.note)}</p>` : ''}
        <p class="footnote">${escapeHtml(COMPANY_INVOICE_FOOTER_NOTE)}</p>
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

type MaterialPurchasePeriod = 'month' | 'range' | 'date' | 'all'
type MaterialSummaryRow = { name: string; qtyKg: number; amount: number; avgRate: number; entries: number; lastDate: string }
type MaterialSummarySortKey = 'name' | 'qtyKg' | 'amount' | 'avgRate' | 'entries' | 'lastDate'

// Printable material-wise purchase report for the selected period: the
// summary (in whatever order it's sorted on screen) + every line date-wise.
function buildMaterialPurchaseReportHtml(
  periodLabel: string,
  summary: MaterialSummaryRow[],
  records: MaterialPurchaseRecord[],
  search: string
) {
  const totalKg = summary.reduce((sum, row) => sum + row.qtyKg, 0)
  const totalAmount = summary.reduce((sum, row) => sum + row.amount, 0)
  const summaryRows = summary
    .map(
      (row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(row.name)}</td>
        <td class="numeric">${formatQty(row.qtyKg)} Kg</td>
        <td class="numeric">${formatAmount(row.avgRate)}</td>
        <td class="numeric">${formatAmount(row.amount)}</td>
        <td class="numeric">${row.entries}</td>
      </tr>
    `
    )
    .join('')
  const normalized = search.toLowerCase()
  const detailRows = records
    .flatMap((record) => {
      const entryMatches = !normalized || [record.entryNumber, record.note ?? ''].join(' ').toLowerCase().includes(normalized)
      return record.items
        .filter((item) => entryMatches || item.materialName.toLowerCase().includes(normalized))
        .map((item) => ({ record, item }))
    })
    .map(
      ({ record, item }, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(formatDate(record.date))}</td>
        <td>${escapeHtml(record.entryNumber)}</td>
        <td>${escapeHtml(item.materialName)}</td>
        <td class="numeric">${formatQty(item.qtyKg)} Kg</td>
        <td class="numeric">${formatAmount(item.ratePerKg)}</td>
        <td class="numeric">${formatAmount(item.amount)}</td>
      </tr>
    `
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Material Purchase Report — ${escapeHtml(periodLabel)}</title>
        <style>${PRINT_STYLES}</style>
      </head>
      <body>
        <p class="title">${escapeHtml(COMPANY_NAME)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_ADDRESS)}</p>
        <p class="company-meta">${escapeHtml(COMPANY_EMAIL)} &middot; Help Line: ${escapeHtml(COMPANY_HELPLINE)}</p>
        <p class="subtitle">Material Purchase Report</p>
        <table class="meta">
          <tr><td>Period:</td><td>${escapeHtml(periodLabel)}</td></tr>
          ${search ? `<tr><td>Filter:</td><td>${escapeHtml(search)}</td></tr>` : ''}
          <tr><td>Total Kg:</td><td class="numeric hl">${formatQty(totalKg)} Kg</td></tr>
          <tr><td>Total Amount:</td><td class="numeric hl">${formatAmount(totalAmount)}</td></tr>
        </table>
        <p class="section-heading">Material-wise Summary</p>
        <table class="doc">
          <thead>
            <tr><th>SL</th><th>Material</th><th>Total Kg</th><th>Avg Rate / Kg</th><th>Amount</th><th>Lines</th></tr>
          </thead>
          <tbody>${summaryRows || '<tr><td colspan="6" style="text-align:center">No purchases in this period.</td></tr>'}</tbody>
          <tr class="totals"><td colspan="2">Total</td><td class="numeric">${formatQty(totalKg)} Kg</td><td></td><td class="numeric">${formatAmount(totalAmount)}</td><td></td></tr>
        </table>
        ${
          detailRows
            ? `<p class="section-heading">Date-wise Details</p>
        <table class="doc">
          <thead>
            <tr><th>SL</th><th>Date</th><th>Entry No</th><th>Material</th><th>Qty</th><th>Rate / Kg</th><th>Amount</th></tr>
          </thead>
          <tbody>${detailRows}</tbody>
          <tr class="totals"><td colspan="4">Total</td><td class="numeric">${formatQty(totalKg)} Kg</td><td></td><td class="numeric">${formatAmount(totalAmount)}</td></tr>
        </table>`
            : ''
        }
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

type SectionId = 'purchases' | 'ledger' | 'factoryStock' | 'materials' | 'production' | 'finishedGoods'

const SECTIONS: Array<{ id: SectionId; label: string; description: string }> = [
  { id: 'purchases', label: 'Purchase Entry', description: 'Daily buys from vendors — Kg, rate, paid, due' },
  { id: 'ledger', label: 'Ledger Overview', description: 'Vendor-wise due + product-wise stock, side by side' },
  { id: 'factoryStock', label: 'Factory Stock', description: 'Product-wise: purchased, sold to dealers, remaining' },
  { id: 'materials', label: 'Materials & Stock', description: 'Raw + packaging material stock and low-stock alerts' },
  { id: 'production', label: 'Production Entry', description: 'Material purchase record — date, material, Kg and rate' },
  { id: 'finishedGoods', label: 'Finished Goods', description: 'Production output stock, ready for Rate Card invoicing' },
]

export default function PurchasePage() {
  const {
    data,
    savePurchaseMaterial,
    deletePurchaseMaterial,
    createPurchase,
    updatePurchase,
    deletePurchase,
    recordVendorPayment,
    updateVendorPayment,
    createMaterialUsage,
    deleteMaterialUsage,
    saveFinishedGoods,
    deleteFinishedGoods,
    deleteProductionBatch,
    saveMaterialPurchaseRecord,
    deleteMaterialPurchaseRecord,
  } = useERP()

  const vendors = useMemo(() => sortByCreatedAtDesc(toArray(data?.vendors)), [data?.vendors])
  const vendorById = useMemo(() => new Map(vendors.map((vendor) => [vendor.id, vendor])), [vendors])
  const materials = useMemo(() => sortByCreatedAtDesc(toArray(data?.purchaseMaterials)), [data?.purchaseMaterials])
  const rawMaterials = useMemo(() => materials.filter((material) => material.category === 'raw_material'), [materials])
  const purchases = useMemo(() => sortByCreatedAtDesc(toArray(data?.purchases)), [data?.purchases])
  const vendorPayments = useMemo(() => toArray(data?.vendorPayments), [data?.vendorPayments])
  const vendorPaymentsByPurchaseId = useMemo(() => {
    const map = new Map<string, VendorPaymentRecord[]>()
    for (const payment of vendorPayments) {
      // Vendor-level payments (no purchaseId) belong to no single purchase.
      if (!payment.purchaseId) continue
      const existing = map.get(payment.purchaseId)
      if (existing) existing.push(payment)
      else map.set(payment.purchaseId, [payment])
    }
    return map
  }, [vendorPayments])
  const usages = useMemo(() => sortByCreatedAtDesc(toArray(data?.materialUsages)), [data?.materialUsages])
  const finishedGoodsList = useMemo(() => sortByCreatedAtDesc(toArray(data?.finishedGoods)), [data?.finishedGoods])
  const finishedGoodsById = useMemo(() => new Map(finishedGoodsList.map((item) => [item.id, item])), [finishedGoodsList])
  const productionBatches = useMemo(() => sortByCreatedAtDesc(toArray(data?.productionBatches)), [data?.productionBatches])
  const materialPurchaseRecords = useMemo(
    () =>
      sortByCreatedAtDesc(toArray(data?.materialPurchaseRecords)).sort((left, right) =>
        right.date.localeCompare(left.date)
      ),
    [data?.materialPurchaseRecords]
  )
  // "পুরনো ডিলার ইনভয়েসের stock reconciliation" (2026-09-12) — negative
  // stock a Rate Card invoice caused, auto-linked/resolved against later
  // Production output. Open ones first, then resolved ones (newest first
  // within each group) so what still needs producing surfaces at the top.
  const stockShortfalls = useMemo(() => {
    const rows = sortByCreatedAtDesc(toArray(data?.stockShortfalls))
    return [...rows].sort((left, right) => (left.status === right.status ? 0 : left.status === 'open' ? -1 : 1))
  }, [data?.stockShortfalls])
  const openShortfallCount = useMemo(
    () => stockShortfalls.filter((row) => row.status === 'open').length,
    [stockShortfalls]
  )

  const [section, setSection] = useState<SectionId>('purchases')
  const [query, setQuery] = useState('')
  // Purchase list + summary cards default to the current month. Period
  // modes (2026-10-07 client request): all time, a month, a day or a custom
  // From/To range — "All time" shows all-time totals.
  const [periodMode, setPeriodMode] = useState<'all' | 'monthly' | 'daily' | 'range'>('monthly')
  const [listMonth, setListMonth] = useState(() => dhakaTodayIso().slice(0, 7))
  const [listDay, setListDay] = useState(() => dhakaTodayIso())
  const [rangeFrom, setRangeFrom] = useState(() => `${dhakaTodayIso().slice(0, 7)}-01`)
  const [rangeTo, setRangeTo] = useState(() => dhakaTodayIso())
  const [listSort, setListSort] = useState<'date-desc' | 'date-asc' | 'entered-desc' | 'entered-asc'>('date-desc')
  const [feedback, setFeedback] = useState<string | null>(null)

  const vendorOptions: ComboboxOption[] = useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: vendor.name, sublabel: vendor.phone })),
    [vendors]
  )
  const materialNameSuggestions = useMemo(
    () => Array.from(new Set(materials.map((material) => material.name))).sort((a, b) => a.localeCompare(b)),
    [materials]
  )
  const rawMaterialOptions: ComboboxOption[] = useMemo(
    () => rawMaterials.map((material) => ({ value: material.id, label: material.name, sublabel: `${formatQty(material.stockQty)} Kg in stock` })),
    [rawMaterials]
  )
  const productNameOptions: ComboboxOption[] = useMemo(() => {
    const seen = new Set<string>()
    const options: ComboboxOption[] = []
    for (const product of toArray(data?.products)) {
      const name = product.name?.trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      options.push({ value: name, label: name, sublabel: product.category })
    }
    return options.sort((a, b) => a.label.localeCompare(b.label))
  }, [data?.products])

  // ---- Materials & stock ------------------------------------------------------
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<PurchaseMaterialRecord | null>(null)
  const [materialForm, setMaterialForm] = useState<MaterialFormState>(emptyMaterialForm)

  const [usageDialogOpen, setUsageDialogOpen] = useState(false)
  const [usageMaterial, setUsageMaterial] = useState<PurchaseMaterialRecord | null>(null)
  const [usageQty, setUsageQty] = useState('0')
  const [usageDate, setUsageDate] = useState(dhakaTodayIso())
  const [usageNote, setUsageNote] = useState('')

  const filteredMaterials = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return materials
    return materials.filter((material) =>
      [material.name, CATEGORY_LABEL[material.category], material.packagingType ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    )
  }, [materials, query])

  const lowStockCount = materials.filter((material) => material.stockQty <= material.minStock).length

  function openCreateMaterialDialog() {
    setEditingMaterial(null)
    setMaterialForm(emptyMaterialForm)
    setFeedback(null)
    setMaterialDialogOpen(true)
  }

  function openEditMaterialDialog(material: PurchaseMaterialRecord) {
    setEditingMaterial(material)
    setMaterialForm(formFromMaterial(material))
    setFeedback(null)
    setMaterialDialogOpen(true)
  }

  async function handleSaveMaterial() {
    setFeedback(null)
    try {
      await savePurchaseMaterial(
        {
          name: materialForm.name,
          category: materialForm.category,
          packagingType:
            materialForm.category === 'packaging_material' && materialForm.packagingType
              ? materialForm.packagingType
              : undefined,
          unit: materialForm.unit,
          unitWeightGrams: materialForm.unit === 'kg' ? Number(materialForm.unitWeightGrams) || undefined : undefined,
          capacityPerUnit: materialForm.unit === 'pcs' ? Number(materialForm.capacityPerUnit) || undefined : undefined,
          stockQty: Number(materialForm.stockQty) || 0,
          minStock: Number(materialForm.minStock) || 0,
        },
        editingMaterial?.id
      )
      setMaterialDialogOpen(false)
      setFeedback(editingMaterial ? 'Material updated.' : 'New material added to stock.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save material.')
    }
  }

  async function handleDeleteMaterial(material: PurchaseMaterialRecord) {
    setFeedback(null)
    try {
      await deletePurchaseMaterial(material.id)
      setFeedback(`${material.name} removed from Materials & Stock.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete material.')
    }
  }

  function openUsageDialog(material: PurchaseMaterialRecord) {
    setUsageMaterial(material)
    setUsageQty('0')
    setUsageDate(dhakaTodayIso())
    setUsageNote('')
    setFeedback(null)
    setUsageDialogOpen(true)
  }

  async function handleLogUsage() {
    if (!usageMaterial) return
    setFeedback(null)
    try {
      await createMaterialUsage({
        materialId: usageMaterial.id,
        qty: Number(usageQty) || 0,
        date: usageDate,
        note: usageNote.trim() || undefined,
      })
      setUsageDialogOpen(false)
      setFeedback(`Logged usage against ${usageMaterial.name} — stock updated.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to log material usage.')
    }
  }

  async function handleDeleteUsage(usageId: string, materialName: string) {
    setFeedback(null)
    try {
      await deleteMaterialUsage(usageId)
      setFeedback(`Deleted usage entry for ${materialName} — stock restored.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete usage entry.')
    }
  }

  // ---- Finished Goods ---------------------------------------------------------
  const [finishedGoodsDialogOpen, setFinishedGoodsDialogOpen] = useState(false)
  const [editingFinishedGoods, setEditingFinishedGoods] = useState<FinishedGoodsRecord | null>(null)
  const [finishedGoodsForm, setFinishedGoodsForm] = useState<FinishedGoodsFormState>(emptyFinishedGoodsForm)
  const finishedGoodsPackKg = computePackWeightKg(
    Number(finishedGoodsForm.pieceWeightGrams) || undefined,
    Number(finishedGoodsForm.piecesPerUnit) || undefined
  )
  const finishedGoodsConversion = describePackConversion({
    pieceWeightGrams: Number(finishedGoodsForm.pieceWeightGrams) || undefined,
    piecesPerUnit: Number(finishedGoodsForm.piecesPerUnit) || undefined,
  })

  const filteredFinishedGoods = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return finishedGoodsList
    return finishedGoodsList.filter((item) =>
      [item.name, item.packSize ?? '', item.rawMaterialName ?? ''].join(' ').toLowerCase().includes(normalized)
    )
  }, [finishedGoodsList, query])

  function openCreateFinishedGoodsDialog() {
    setEditingFinishedGoods(null)
    setFinishedGoodsForm(emptyFinishedGoodsForm)
    setFeedback(null)
    setFinishedGoodsDialogOpen(true)
  }

  function openEditFinishedGoodsDialog(item: FinishedGoodsRecord) {
    setEditingFinishedGoods(item)
    setFinishedGoodsForm(formFromFinishedGoods(item))
    setFeedback(null)
    setFinishedGoodsDialogOpen(true)
  }

  async function handleSaveFinishedGoods() {
    setFeedback(null)
    try {
      await saveFinishedGoods(
        {
          name: finishedGoodsForm.name,
          rawMaterialId: finishedGoodsForm.rawMaterialId || undefined,
          packSize: finishedGoodsForm.packSize || undefined,
          unitWeightKg: Number(finishedGoodsForm.unitWeightKg) || 0,
          pieceWeightGrams: Number(finishedGoodsForm.pieceWeightGrams) || undefined,
          piecesPerUnit: Number(finishedGoodsForm.piecesPerUnit) || undefined,
          stockQty: Number(finishedGoodsForm.stockQty) || 0,
          minStock: Number(finishedGoodsForm.minStock) || 0,
          rawRate: Number(finishedGoodsForm.rawRate) || 0,
          manufRate: Number(finishedGoodsForm.manufRate) || 0,
          depotRate: Number(finishedGoodsForm.depotRate) || 0,
          dealerRate: Number(finishedGoodsForm.dealerRate) || 0,
          tpRate: Number(finishedGoodsForm.tpRate) || 0,
          mrpRate: Number(finishedGoodsForm.mrpRate) || 0,
        },
        editingFinishedGoods?.id
      )
      setFinishedGoodsDialogOpen(false)
      setFeedback(editingFinishedGoods ? 'Finished goods updated.' : 'New finished goods item added.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save finished goods.')
    }
  }

  async function handleDeleteFinishedGoods(item: FinishedGoodsRecord) {
    setFeedback(null)
    try {
      await deleteFinishedGoods(item.id)
      setFeedback(`${item.name} removed from Finished Goods.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete finished goods.')
    }
  }

  // ---- Material purchase (Production Entry tab) ---------------------------------
  // Period filter for the list + the material-wise Kg summary: a month, a
  // custom from–to range, a single date, or all time (2026-10-13).
  const [materialPurchasePeriod, setMaterialPurchasePeriod] = useState<MaterialPurchasePeriod>('month')
  const [materialPurchaseMonth, setMaterialPurchaseMonth] = useState(() => dhakaTodayIso().slice(0, 7))
  const [materialPurchaseFrom, setMaterialPurchaseFrom] = useState(() => `${dhakaTodayIso().slice(0, 7)}-01`)
  const [materialPurchaseTo, setMaterialPurchaseTo] = useState(() => dhakaTodayIso())
  const [materialPurchaseDay, setMaterialPurchaseDay] = useState(() => dhakaTodayIso())
  const [materialSummarySort, setMaterialSummarySort] = useState<{ key: MaterialSummarySortKey; dir: 'asc' | 'desc' }>({
    key: 'qtyKg',
    dir: 'desc',
  })
  const [materialPurchaseDialogOpen, setMaterialPurchaseDialogOpen] = useState(false)
  const [editingMaterialPurchase, setEditingMaterialPurchase] = useState<MaterialPurchaseRecord | null>(null)
  const [materialPurchaseDate, setMaterialPurchaseDate] = useState(dhakaTodayIso())
  const [materialPurchaseLines, setMaterialPurchaseLines] = useState<MaterialPurchaseLineDraft[]>([emptyMaterialPurchaseLine()])
  const [materialPurchaseNote, setMaterialPurchaseNote] = useState('')
  const [materialPurchaseSaving, setMaterialPurchaseSaving] = useState(false)
  const [materialPurchaseFormError, setMaterialPurchaseFormError] = useState<string | null>(null)

  const filteredProductionBatches = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return productionBatches
    return productionBatches.filter((batch) =>
      [batch.batchNumber, batch.rawMaterialName].join(' ').toLowerCase().includes(normalized)
    )
  }, [productionBatches, query])

  const materialPurchasePeriodLabel = useMemo(() => {
    switch (materialPurchasePeriod) {
      case 'month':
        return materialPurchaseMonth ? `Month ${materialPurchaseMonth}` : 'All time'
      case 'range':
        return `${materialPurchaseFrom ? formatDate(materialPurchaseFrom) : 'Start'} – ${materialPurchaseTo ? formatDate(materialPurchaseTo) : 'Today'}`
      case 'date':
        return materialPurchaseDay ? formatDate(materialPurchaseDay) : 'All time'
      default:
        return 'All time'
    }
  }, [materialPurchasePeriod, materialPurchaseMonth, materialPurchaseFrom, materialPurchaseTo, materialPurchaseDay])
  const monthMaterialPurchases = useMemo(
    () =>
      materialPurchaseRecords.filter((record) => {
        switch (materialPurchasePeriod) {
          case 'month':
            return !materialPurchaseMonth || record.date.slice(0, 7) === materialPurchaseMonth
          case 'range':
            return (!materialPurchaseFrom || record.date >= materialPurchaseFrom) && (!materialPurchaseTo || record.date <= materialPurchaseTo)
          case 'date':
            return !materialPurchaseDay || record.date === materialPurchaseDay
          default:
            return true
        }
      }),
    [materialPurchaseRecords, materialPurchasePeriod, materialPurchaseMonth, materialPurchaseFrom, materialPurchaseTo, materialPurchaseDay]
  )
  const filteredMaterialPurchases = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return monthMaterialPurchases
    return monthMaterialPurchases.filter((record) =>
      [record.entryNumber, record.note ?? '', ...record.items.map((item) => item.materialName)]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    )
  }, [monthMaterialPurchases, query])
  // Material-wise "কোন কাঁচামাল কত কেজি কিনলাম" for the selected period —
  // grouped by name (case/space-insensitive). A search that matches a
  // material name narrows the summary to that material's lines only.
  const materialPurchaseSummary = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const map = new Map<string, MaterialSummaryRow>()
    for (const record of filteredMaterialPurchases) {
      const entryMatches = !normalized || [record.entryNumber, record.note ?? ''].join(' ').toLowerCase().includes(normalized)
      for (const item of record.items) {
        if (!entryMatches && !item.materialName.toLowerCase().includes(normalized)) continue
        const key = item.materialName.trim().toLowerCase().replace(/\s+/g, ' ')
        const row = map.get(key) ?? { name: item.materialName.trim(), qtyKg: 0, amount: 0, avgRate: 0, entries: 0, lastDate: '' }
        row.qtyKg += item.qtyKg
        row.amount += item.amount
        row.entries += 1
        if (record.date > row.lastDate) row.lastDate = record.date
        map.set(key, row)
      }
    }
    const rows = Array.from(map.values()).map((row) => ({ ...row, avgRate: row.qtyKg > 0 ? row.amount / row.qtyKg : 0 }))
    const { key, dir } = materialSummarySort
    const sign = dir === 'asc' ? 1 : -1
    return rows.sort((left, right) =>
      key === 'name' || key === 'lastDate'
        ? sign * left[key].localeCompare(right[key])
        : sign * (left[key] - right[key])
    )
  }, [filteredMaterialPurchases, query, materialSummarySort])

  function toggleMaterialSummarySort(key: MaterialSummarySortKey) {
    setMaterialSummarySort((current) =>
      current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }
    )
  }

  function printMaterialPurchaseReport() {
    openPrintWindow(
      buildMaterialPurchaseReportHtml(
        materialPurchasePeriodLabel,
        materialPurchaseSummary,
        [...filteredMaterialPurchases].sort((left, right) => left.date.localeCompare(right.date) || left.entryNumber.localeCompare(right.entryNumber)),
        query.trim()
      )
    )
  }

  const materialPurchaseNameSuggestions = useMemo(
    () =>
      Array.from(
        new Set([
          ...rawMaterials.map((material) => material.name),
          ...materialPurchaseRecords.flatMap((record) => record.items.map((item) => item.materialName)),
        ])
      ).sort((a, b) => a.localeCompare(b)),
    [rawMaterials, materialPurchaseRecords]
  )

  function openCreateMaterialPurchaseDialog() {
    setEditingMaterialPurchase(null)
    setMaterialPurchaseDate(dhakaTodayIso())
    setMaterialPurchaseLines([emptyMaterialPurchaseLine()])
    setMaterialPurchaseNote('')
    setMaterialPurchaseFormError(null)
    setFeedback(null)
    setMaterialPurchaseDialogOpen(true)
  }

  function openEditMaterialPurchaseDialog(record: MaterialPurchaseRecord) {
    setEditingMaterialPurchase(record)
    setMaterialPurchaseDate(record.date)
    setMaterialPurchaseLines(
      record.items.map((item) => ({
        key: createId('line'),
        materialName: item.materialName,
        qtyKg: String(item.qtyKg),
        ratePerKg: String(item.ratePerKg),
      }))
    )
    setMaterialPurchaseNote(record.note ?? '')
    setMaterialPurchaseFormError(null)
    setFeedback(null)
    setMaterialPurchaseDialogOpen(true)
  }

  function updateMaterialPurchaseLine(key: string, patch: Partial<MaterialPurchaseLineDraft>) {
    setMaterialPurchaseLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function removeMaterialPurchaseLine(key: string) {
    setMaterialPurchaseLines((current) => (current.length > 1 ? current.filter((line) => line.key !== key) : current))
  }

  async function handleSaveMaterialPurchase() {
    setMaterialPurchaseFormError(null)
    const filled = materialPurchaseLines.filter(
      (line) => line.materialName.trim() || Number(line.qtyKg) || Number(line.ratePerKg)
    )
    if (filled.length === 0) {
      setMaterialPurchaseFormError('Add at least one material with its quantity and rate.')
      return
    }
    const invalid = filled.find((line) => !line.materialName.trim() || !(Number(line.qtyKg) > 0) || !(Number(line.ratePerKg) >= 0) || line.ratePerKg === '')
    if (invalid) {
      setMaterialPurchaseFormError('Every material line needs a name, a quantity above 0 and a rate per Kg.')
      return
    }

    setMaterialPurchaseSaving(true)
    try {
      await saveMaterialPurchaseRecord(
        {
          date: materialPurchaseDate,
          note: materialPurchaseNote.trim() || undefined,
          items: filled.map((line) => ({
            materialName: line.materialName.trim(),
            qtyKg: Number(line.qtyKg),
            ratePerKg: Number(line.ratePerKg),
          })),
        },
        editingMaterialPurchase?.id
      )
      setMaterialPurchaseDialogOpen(false)
      setFeedback(editingMaterialPurchase ? 'Material purchase updated.' : 'Material purchase recorded.')
    } catch (reason) {
      setMaterialPurchaseFormError(reason instanceof Error ? reason.message : 'Unable to save material purchase.')
    } finally {
      setMaterialPurchaseSaving(false)
    }
  }

  async function handleDeleteMaterialPurchase(record: MaterialPurchaseRecord) {
    if (!window.confirm(`Delete material purchase ${record.entryNumber}?`)) return
    setFeedback(null)
    try {
      await deleteMaterialPurchaseRecord(record.id)
      setFeedback(`Deleted material purchase ${record.entryNumber}.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete material purchase.')
    }
  }

  async function handleDeleteProductionBatch(batch: ProductionBatchRecord) {
    setFeedback(null)
    try {
      await deleteProductionBatch(batch.id)
      setFeedback(`Deleted production batch ${batch.batchNumber} — stock reversed.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete production batch.')
    }
  }

  // ---- Purchase entry ---------------------------------------------------------
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false)
  const [editingPurchase, setEditingPurchase] = useState<PurchaseRecord | null>(null)
  const [purchaseVendorId, setPurchaseVendorId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(dhakaTodayIso())
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLineDraft[]>([emptyPurchaseLine()])
  const [purchasePaid, setPurchasePaid] = useState('0')
  const [purchaseNote, setPurchaseNote] = useState('')
  const [purchaseSaving, setPurchaseSaving] = useState(false)
  const [purchaseFormError, setPurchaseFormError] = useState<string | null>(null)

  const [paymentPurchase, setPaymentPurchase] = useState<PurchaseRecord | null>(null)
  const [editingPayment, setEditingPayment] = useState<VendorPaymentRecord | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('0')
  const [paymentDate, setPaymentDate] = useState(dhakaTodayIso())
  const [paymentNote, setPaymentNote] = useState('')
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentHistoryPurchase, setPaymentHistoryPurchase] = useState<PurchaseRecord | null>(null)
  const [paymentHistoryDialogOpen, setPaymentHistoryDialogOpen] = useState(false)
  const [vendorPayDialogOpen, setVendorPayDialogOpen] = useState(false)

  const purchaseTotal = useMemo(
    () => purchaseLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
    [purchaseLines]
  )
  // Vendor payments already on file against the purchase being edited —
  // already included in `purchasePaid`, which can't be edited below this.
  const editingVendorPaymentsTotal = useMemo(
    () => (editingPurchase ? (vendorPaymentsByPurchaseId.get(editingPurchase.id) ?? []).reduce((sum, payment) => sum + payment.amount, 0) : 0),
    [editingPurchase, vendorPaymentsByPurchaseId]
  )
  // Vendor's running due from everything else on file (openingDue + every
  // other purchase's own due) — computeVendorDue already includes the
  // purchase being edited, so its own current due is subtracted back out to
  // get "everything but this one" (client request, 2026-09-13: seeing the
  // vendor's other/prior balance while entering this purchase is what makes
  // "paid more than this purchase's own total, to pay down the old due"
  // make sense on screen instead of looking like a typo).
  const vendorDueExcludingThisPurchase = useMemo(() => {
    if (!purchaseVendorId) return 0
    const total = computeVendorDue(data ?? null, purchaseVendorId)
    return editingPurchase && editingPurchase.vendorId === purchaseVendorId ? total - editingPurchase.due : total
  }, [data, purchaseVendorId, editingPurchase])

  // null = no period filter (All time, or an empty month/day input).
  const inPeriod = useMemo<((date: string) => boolean) | null>(() => {
    if (periodMode === 'monthly' && listMonth) return (date) => date.slice(0, 7) === listMonth
    if (periodMode === 'daily' && listDay) return (date) => date.slice(0, 10) === listDay
    if (periodMode === 'range' && (rangeFrom || rangeTo)) {
      return (date) => {
        const day = date.slice(0, 10)
        return (!rangeFrom || day >= rangeFrom) && (!rangeTo || day <= rangeTo)
      }
    }
    return null
  }, [periodMode, listMonth, listDay, rangeFrom, rangeTo])

  const filteredPurchases = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const direction = listSort.endsWith('-asc') ? 1 : -1
    return purchases
      .filter(
        (purchase) =>
          (!inPeriod || inPeriod(purchase.date)) &&
          (!normalized || [purchase.purchaseNumber, purchase.vendorName].join(' ').toLowerCase().includes(normalized))
      )
      .sort((left, right) => {
        if (listSort.startsWith('date')) {
          const byDate = left.date.localeCompare(right.date)
          if (byDate !== 0) return byDate * direction
        }
        return left.createdAt.localeCompare(right.createdAt) * direction
      })
  }, [purchases, query, inPeriod, listSort])

  const monthLabel = !inPeriod
    ? 'All time'
    : periodMode === 'monthly'
      ? new Date(`${listMonth}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : periodMode === 'daily'
        ? formatDate(listDay)
        : `${rangeFrom ? formatDate(rangeFrom) : 'Start'} – ${rangeTo ? formatDate(rangeTo) : 'Today'}`

  // Selected period's figures (rejected entries excluded). "Deposited" is
  // cash that actually went out in the period: paid-at-purchase on that
  // period's purchases plus every vendor payment (per-purchase or
  // vendor-level) dated in it — so a March purchase paid off in April counts
  // in April.
  const monthPurchaseStats = useMemo(() => {
    if (!inPeriod) return null
    const inMonth = inPeriod
    const monthPurchases = purchases.filter((purchase) => inMonth(purchase.date) && isCountedEntry(purchase))
    const paidAtPurchase = monthPurchases.reduce((sum, purchase) => {
      const laterPayments = (vendorPaymentsByPurchaseId.get(purchase.id) ?? []).reduce((total, payment) => total + payment.amount, 0)
      return sum + purchase.paid - laterPayments
    }, 0)
    const paymentsInMonth = vendorPayments
      .filter((payment) => inMonth(payment.date) && isCountedEntry(payment))
      .reduce((sum, payment) => sum + payment.amount, 0)
    const totalAmount = monthPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0)
    return {
      count: monthPurchases.length,
      totalAmount,
      totalPaid: paidAtPurchase + paymentsInMonth,
      newDue: totalAmount - paidAtPurchase,
    }
  }, [purchases, vendorPayments, vendorPaymentsByPurchaseId, inPeriod])

  const purchaseStats = useMemo(() => {
    const openingDueTotal = vendors.reduce((sum, vendor) => sum + (vendor.openingDue ?? 0), 0)
    const fromPurchases = purchases.reduce(
      (totals, purchase) => ({
        totalAmount: totals.totalAmount + purchase.totalAmount,
        totalPaid: totals.totalPaid + purchase.paid,
        totalDue: totals.totalDue + purchase.due,
      }),
      { totalAmount: 0, totalPaid: 0, totalDue: 0 }
    )
    const accountPayments = computeVendorAccountPayments(data ?? null)
    return {
      ...fromPurchases,
      totalPaid: fromPurchases.totalPaid + accountPayments,
      totalDue: fromPurchases.totalDue + openingDueTotal - accountPayments,
    }
  }, [data, purchases, vendors])

  function openCreatePurchaseDialog() {
    setEditingPurchase(null)
    setPurchaseVendorId('')
    setPurchaseDate(dhakaTodayIso())
    setPurchaseLines([emptyPurchaseLine()])
    setPurchasePaid('0')
    setPurchaseNote('')
    setPurchaseFormError(null)
    setFeedback(null)
    setPurchaseDialogOpen(true)
  }

  // Edit Option (client request, 2026-09-13) — same dialog as New Purchase,
  // pre-filled from the existing record. Saving overwrites it in place —
  // never adds a new transaction on top.
  function openEditPurchaseDialog(purchase: PurchaseRecord) {
    setEditingPurchase(purchase)
    setPurchaseVendorId(purchase.vendorId ?? '')
    setPurchaseDate(purchase.date)
    setPurchaseLines(
      purchase.items.map((item) => ({
        key: createId('line'),
        materialId: item.materialId,
        materialName: item.materialName,
        unit: item.unit,
        qty: String(item.qty),
        rate: String(item.rate),
        amount: String(item.amount),
        basis: 'rate' as const,
      }))
    )
    // Total paid, not just the paid-at-purchase part — editing it replaces
    // the figure (see updatePurchase in provider.tsx).
    setPurchasePaid(String(purchase.paid))
    setPurchaseNote(purchase.note ?? '')
    setPurchaseFormError(null)
    setFeedback(null)
    setPurchaseDialogOpen(true)
  }

  function updatePurchaseLine(key: string, patch: Partial<PurchaseLineDraft>) {
    setPurchaseLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  // Qty always recomputes whichever of rate/amount isn't the current basis,
  // so the relationship Amount = Qty x Rate holds no matter which side the
  // user is driving.
  function handleLineQtyChange(key: string, value: string) {
    setPurchaseLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line
        const qtyNum = Number(value) || 0
        if (line.basis === 'amount') {
          const amountNum = Number(line.amount) || 0
          return { ...line, qty: value, rate: qtyNum > 0 ? String(roundMoney(amountNum / qtyNum)) : line.rate }
        }
        const rateNum = Number(line.rate) || 0
        return { ...line, qty: value, amount: String(roundMoney(qtyNum * rateNum)) }
      })
    )
  }

  function handleLineRateChange(key: string, value: string) {
    setPurchaseLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line
        const qtyNum = Number(line.qty) || 0
        const rateNum = Number(value) || 0
        return { ...line, rate: value, basis: 'rate', amount: String(roundMoney(qtyNum * rateNum)) }
      })
    )
  }

  // Typing Amount directly (client request, 2026-09-14) back-calculates the
  // per-Kg Rate instead — qty stays what the user entered.
  function handleLineAmountChange(key: string, value: string) {
    setPurchaseLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line
        const qtyNum = Number(line.qty) || 0
        const amountNum = Number(value) || 0
        return { ...line, amount: value, basis: 'amount', rate: qtyNum > 0 ? String(roundMoney(amountNum / qtyNum)) : line.rate }
      })
    )
  }

  // Free-text material name field, backed by a <datalist> of already-known
  // names for suggestions. Typing a name that exactly matches an existing
  // material links straight to it (so its unit/stock apply); an unmatched
  // name is created in Materials & Stock at save time, which is also what
  // makes it show up as a suggestion the next time someone types it.
  function handleLineMaterialNameChange(key: string, typedName: string) {
    const existing = materials.find((item) => item.name.toLowerCase() === typedName.trim().toLowerCase())
    updatePurchaseLine(key, {
      materialName: typedName,
      materialId: existing?.id,
      unit: existing?.unit ?? 'kg',
    })
  }

  function addPurchaseLine() {
    setPurchaseLines((current) => [...current, emptyPurchaseLine()])
  }

  function removePurchaseLine(key: string) {
    setPurchaseLines((current) => (current.length > 1 ? current.filter((line) => line.key !== key) : current))
  }

  async function handleSavePurchase() {
    setPurchaseFormError(null)

    if (!purchaseVendorId) {
      setPurchaseFormError('Pick the vendor this purchase is from.')
      return
    }

    const eligibleLines = purchaseLines.filter((line) => line.materialName.trim() && (Number(line.qty) || 0) > 0)

    if (eligibleLines.length === 0) {
      setPurchaseFormError('Type at least one material name and enter a quantity.')
      return
    }

    setPurchaseSaving(true)
    try {
      // Names typed fresh (no materialId yet) get created in Materials &
      // Stock here, once per distinct name, so two lines with the same new
      // name share one material instead of creating duplicates.
      const newlyCreatedIds = new Map<string, string>()
      const items = []
      for (const line of eligibleLines) {
        const name = line.materialName.trim()
        const nameKey = name.toLowerCase()
        let materialId = line.materialId
        if (!materialId) {
          const existing = materials.find((item) => item.name.toLowerCase() === nameKey)
          materialId =
            existing?.id ??
            newlyCreatedIds.get(nameKey) ??
            (await savePurchaseMaterial({ name, category: 'raw_material', unit: line.unit, stockQty: 0, minStock: 0 }))
          if (!existing) newlyCreatedIds.set(nameKey, materialId)
        }
        items.push({
          materialId,
          materialName: name,
          qty: Number(line.qty) || 0,
          rate: Number(line.rate) || 0,
          ...(line.basis === 'amount' ? { amount: Number(line.amount) || 0 } : {}),
        })
      }

      const purchaseInput = {
        vendorId: purchaseVendorId,
        date: purchaseDate,
        items,
        paid: Number(purchasePaid) || 0,
        note: purchaseNote.trim() || undefined,
      }

      if (editingPurchase) {
        await updatePurchase(editingPurchase.id, purchaseInput)
        setFeedback(`Purchase ${editingPurchase.purchaseNumber} updated — stock and vendor due recalculated.`)
      } else {
        await createPurchase(purchaseInput)
        setFeedback('Purchase recorded — stock and vendor due updated.')
      }
      setPurchaseDialogOpen(false)
    } catch (reason) {
      setPurchaseFormError(reason instanceof Error ? reason.message : 'Unable to save purchase.')
    } finally {
      setPurchaseSaving(false)
    }
  }

  async function handleDeletePurchase(purchase: PurchaseRecord) {
    setFeedback(null)
    try {
      await deletePurchase(purchase.id)
      setFeedback(`Deleted purchase ${purchase.purchaseNumber} — stock reversed.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete purchase.')
    }
  }

  function openPaymentDialog(purchase: PurchaseRecord) {
    setPaymentPurchase(purchase)
    setEditingPayment(null)
    setPaymentAmount('0')
    setPaymentDate(dhakaTodayIso())
    setPaymentNote('')
    setFeedback(null)
    setPaymentDialogOpen(true)
  }

  // Edit Option (client request, 2026-09-13) — reuses the same Record
  // payment dialog, pre-filled from the payment being corrected.
  function openEditPaymentDialog(purchase: PurchaseRecord, payment: VendorPaymentRecord) {
    setPaymentPurchase(purchase)
    setEditingPayment(payment)
    setPaymentAmount(String(payment.amount))
    setPaymentDate(payment.date)
    setPaymentNote(payment.note ?? '')
    setFeedback(null)
    setPaymentHistoryDialogOpen(false)
    setPaymentDialogOpen(true)
  }

  function openPaymentHistoryDialog(purchase: PurchaseRecord) {
    setPaymentHistoryPurchase(purchase)
    setFeedback(null)
    setPaymentHistoryDialogOpen(true)
  }

  async function handleRecordPayment() {
    if (!paymentPurchase) return
    setFeedback(null)
    try {
      if (editingPayment) {
        await updateVendorPayment(editingPayment.id, {
          amount: Number(paymentAmount) || 0,
          date: paymentDate,
          note: paymentNote.trim() || undefined,
        })
        setFeedback(`Payment ${editingPayment.receiptNumber} updated against ${paymentPurchase.purchaseNumber}.`)
      } else {
        await recordVendorPayment({
          purchaseId: paymentPurchase.id,
          amount: Number(paymentAmount) || 0,
          date: paymentDate,
          note: paymentNote.trim() || undefined,
        })
        setFeedback(`Payment recorded against ${paymentPurchase.purchaseNumber}.`)
      }
      setPaymentDialogOpen(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save payment.')
    }
  }

  function openPrintWindow(html: string) {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
  }

  const materialExportHeaders = ['Material', 'Category', 'Type', 'Unit', 'Stock', 'Available Pieces', 'Min Stock']
  const materialExportRows = useMemo(
    () =>
      filteredMaterials.map((material) => [
        material.name,
        CATEGORY_LABEL[material.category],
        material.packagingType ?? '',
        UNIT_LABEL[material.unit],
        material.stockQty,
        computeMaterialAvailablePieces(material) ?? '',
        material.minStock,
      ]),
    [filteredMaterials]
  )

  const purchaseExportHeaders = ['Purchase No', 'Vendor', 'Date', 'Items', 'Total', 'Paid', 'Due']
  const purchaseExportRows = useMemo(
    () =>
      filteredPurchases.map((purchase) => [
        purchase.purchaseNumber,
        purchase.vendorName,
        formatDate(purchase.date),
        purchase.items.length,
        purchase.totalAmount.toFixed(2),
        purchase.paid.toFixed(2),
        purchase.due.toFixed(2),
      ]),
    [filteredPurchases]
  )

  return (
    <AdminShell active="Purchase">
      <div className="space-y-6">
        <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-border/70 bg-muted/30 p-1">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSection(item.id)
                setQuery('')
              }}
              className={cn(
                'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                section === item.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        {section === 'purchases' ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Purchases</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {(monthPurchaseStats?.count ?? purchases.length).toLocaleString('en-BD')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {monthPurchaseStats ? `Procurement transactions in ${monthLabel}` : 'Total procurement transactions'}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Total purchased</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {formatAmount(monthPurchaseStats?.totalAmount ?? purchaseStats.totalAmount)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {monthPurchaseStats ? `Purchases dated ${monthLabel}` : "Sum of every purchase's total amount"}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Total deposited</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-600">
                    {formatAmount(monthPurchaseStats?.totalPaid ?? purchaseStats.totalPaid)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {monthPurchaseStats ? `Paid to vendors in ${monthLabel}` : 'Paid at purchase time + vendor payments'}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Total due to vendors</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">{formatAmount(purchaseStats.totalDue)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Currently owed across every vendor
                    {monthPurchaseStats ? ` · ${monthLabel}'s purchases left ${formatAmount(monthPurchaseStats.newDue)} unpaid` : ''}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Purchase Entry</CardTitle>
                  <CardDescription>
                    How much (Kg/Pcs) was bought from a vendor, at what rate, how much was deposited, and what's still
                    owed — stock on the Materials & Stock list updates automatically.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={periodMode} onValueChange={(value) => setPeriodMode(value as typeof periodMode)}>
                    <SelectTrigger className="w-full sm:w-36" aria-label="Period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="range">Custom range</SelectItem>
                    </SelectContent>
                  </Select>
                  {periodMode === 'monthly' ? (
                    <Input
                      className="w-full sm:w-44"
                      type="month"
                      value={listMonth}
                      onChange={(event) => setListMonth(event.target.value)}
                      aria-label="Month"
                    />
                  ) : null}
                  {periodMode === 'daily' ? (
                    <Input
                      className="w-full sm:w-44"
                      type="date"
                      value={listDay}
                      onChange={(event) => setListDay(event.target.value)}
                      aria-label="Day"
                    />
                  ) : null}
                  {periodMode === 'range' ? (
                    <>
                      <Input
                        className="w-full sm:w-40"
                        type="date"
                        value={rangeFrom}
                        max={rangeTo || undefined}
                        onChange={(event) => setRangeFrom(event.target.value)}
                        aria-label="From date"
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        className="w-full sm:w-40"
                        type="date"
                        value={rangeTo}
                        min={rangeFrom || undefined}
                        onChange={(event) => setRangeTo(event.target.value)}
                        aria-label="To date"
                      />
                    </>
                  ) : null}
                  <Select value={listSort} onValueChange={(value) => setListSort(value as typeof listSort)}>
                    <SelectTrigger className="w-full sm:w-52" aria-label="Sort order">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date-desc">Date: newest first</SelectItem>
                      <SelectItem value="date-asc">Date: oldest first</SelectItem>
                      <SelectItem value="entered-desc">Entered: newest first</SelectItem>
                      <SelectItem value="entered-asc">Entered: oldest first</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="pl-9"
                      placeholder="Search purchase no or vendor"
                    />
                  </div>
                  <Button onClick={openCreatePurchaseDialog} className="h-10 rounded-xl">
                    <Plus className="mr-2 h-4 w-4" />
                    New Purchase
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFeedback(null)
                      setVendorPayDialogOpen(true)
                    }}
                    className="h-10 rounded-xl"
                    disabled={vendors.length === 0}
                  >
                    <Wallet className="mr-2 h-4 w-4" />
                    Pay vendor
                  </Button>
                  <ExportMenu
                    filenameBase="purchases"
                    title={`Purchases — ${monthLabel}`}
                    headers={purchaseExportHeaders}
                    rows={purchaseExportRows}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Purchase No</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Due</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPurchases.map((purchase) => (
                        <TableRow key={purchase.id}>
                          <TableCell className="font-medium">
                            {purchase.purchaseNumber}
                            <RecordApprovalTag record={purchase} />
                            {purchase.updatedAt ? (
                              <p
                                className="text-[11px] font-normal text-amber-600"
                                title={`Last edited ${formatDateTime(purchase.updatedAt)}${purchase.updatedByName ? ` by ${purchase.updatedByName}` : ''}`}
                              >
                                Edited{purchase.editCount && purchase.editCount > 1 ? ` ×${purchase.editCount}` : ''} · {formatDate(purchase.updatedAt)}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell>{purchase.vendorName}</TableCell>
                          <TableCell>{formatDate(purchase.date)}</TableCell>
                          <TableCell className="max-w-64 truncate text-muted-foreground">
                            {purchase.items.map((item) => `${item.materialName} (${formatQty(item.qty)} ${UNIT_LABEL[item.unit]})`).join(', ')}
                          </TableCell>
                          <TableCell className="text-right">{formatAmount(purchase.totalAmount)}</TableCell>
                          <TableCell className="text-right text-emerald-600">{formatAmount(purchase.paid)}</TableCell>
                          <TableCell className={cn('text-right', purchase.due > 0 ? 'text-destructive' : 'text-emerald-600')}>
                            {formatAmount(Math.abs(purchase.due))}
                            {purchase.due < 0 ? ' (extra)' : ''}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  Actions
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditPurchaseDialog(purchase)}>
                                  <Edit className="mr-2 h-4 w-4" /> Edit purchase
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={purchase.due <= 0}
                                  onClick={() => openPaymentDialog(purchase)}
                                >
                                  <Wallet className="mr-2 h-4 w-4" /> Record payment
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={(vendorPaymentsByPurchaseId.get(purchase.id) ?? []).length === 0}
                                  onClick={() => openPaymentHistoryDialog(purchase)}
                                >
                                  <Wallet className="mr-2 h-4 w-4" /> Payment history
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    openPrintWindow(
                                      buildPurchaseVoucherHtml(
                                        purchase,
                                        purchase.vendorId ? vendorById.get(purchase.vendorId) : undefined,
                                        vendorPaymentsByPurchaseId.get(purchase.id) ?? []
                                      )
                                    )
                                  }
                                >
                                  <Printer className="mr-2 h-4 w-4" /> Print voucher
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => handleDeletePurchase(purchase)}>
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredPurchases.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                            <Truck className="mx-auto mb-2 h-8 w-8 opacity-50" />
                            {purchases.length === 0 ? 'No purchases recorded yet.' : 'No purchases match this month / search.'}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {section === 'ledger' ? <PurchaseLedgerOverview /> : null}

        {section === 'factoryStock' ? <FactoryStockSection /> : null}

        {section === 'materials' ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Materials on file</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{materials.length.toLocaleString('en-BD')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Raw + packaging materials</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Raw material</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {materials.filter((material) => material.category === 'raw_material').length.toLocaleString('en-BD')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Bought/tracked in Kg</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Packaging material</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {materials.filter((material) => material.category === 'packaging_material').length.toLocaleString('en-BD')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Packet/Pouch/Carton/Bottle/Sack/Sticker</p>
                </CardContent>
              </Card>
              <Card className={cn('border-border/70 shadow-sm', lowStockCount > 0 && 'border-destructive/50 bg-destructive/5')}>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Needs purchasing</p>
                  <p className={cn('mt-2 text-2xl font-semibold tracking-tight', lowStockCount > 0 && 'text-destructive')}>
                    {lowStockCount.toLocaleString('en-BD')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">At or below their minimum stock</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Materials & Stock</CardTitle>
                  <CardDescription>
                    Raw material (Kg) and packaging material (Packet/Pouch/Carton/Bottle/Sack/Sticker, by weight or by
                    the piece) — stock rises with every Purchase and falls with every Usage entry logged here.
                  </CardDescription>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(200px,1fr)_auto_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="pl-9"
                      placeholder="Search material name, category, or type"
                    />
                  </div>
                  <Button onClick={openCreateMaterialDialog} className="h-10 rounded-xl">
                    <Plus className="mr-2 h-4 w-4" />
                    Add material
                  </Button>
                  <ExportMenu
                    filenameBase="purchase-materials"
                    title="Materials & Stock"
                    headers={materialExportHeaders}
                    rows={materialExportRows}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Material</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Available Pieces</TableHead>
                        <TableHead className="text-right">Min Stock</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMaterials.map((material) => {
                        const pieces = computeMaterialAvailablePieces(material)
                        const low = material.stockQty <= material.minStock
                        return (
                          <TableRow key={material.id}>
                            <TableCell className="min-w-48">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                  <AvatarFallback className="bg-muted text-muted-foreground">
                                    {material.category === 'packaging_material' ? (
                                      <Package className="h-4 w-4" />
                                    ) : (
                                      <Boxes className="h-4 w-4" />
                                    )}
                                  </AvatarFallback>
                                </Avatar>
                                <p className="font-semibold">{material.name}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{CATEGORY_LABEL[material.category]}</Badge>
                            </TableCell>
                            <TableCell>{material.packagingType ?? '—'}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatQty(material.stockQty)} {UNIT_LABEL[material.unit]}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {pieces !== undefined ? pieces.toLocaleString('en-BD') : '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatQty(material.minStock)} {UNIT_LABEL[material.unit]}
                            </TableCell>
                            <TableCell>
                              {low ? (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertTriangle className="h-3 w-3" /> Low — buy more
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-emerald-600">
                                  OK
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9"
                                  onClick={() => openUsageDialog(material)}
                                  aria-label={`Log usage for ${material.name}`}
                                  title="Log usage (production/issue — reduces stock)"
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9"
                                  onClick={() => openEditMaterialDialog(material)}
                                  aria-label={`Edit ${material.name}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteMaterial(material)}
                                  aria-label={`Delete ${material.name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {filteredMaterials.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                            <Boxes className="mx-auto mb-2 h-8 w-8 opacity-50" />
                            No materials on file yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>Recent usage</CardTitle>
                <CardDescription>Stock taken out for production or issued out — most recent first.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Material</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usages.slice(0, 15).map((usage) => (
                        <TableRow key={usage.id}>
                          <TableCell className="font-medium">{usage.materialName}<RecordApprovalTag record={usage} /></TableCell>
                          <TableCell>{formatDate(usage.date)}</TableCell>
                          <TableCell className="text-right text-destructive">
                            -{formatQty(usage.qty)} {UNIT_LABEL[usage.unit]}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{usage.note || '—'}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteUsage(usage.id, usage.materialName)}
                              aria-label="Delete usage entry"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {usages.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                            No usage logged yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {section === 'production' ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Material purchase entries</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{monthMaterialPurchases.length.toLocaleString('en-BD')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{materialPurchasePeriodLabel}</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Material bought</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {formatQty(monthMaterialPurchases.reduce((sum, record) => sum + record.totalQtyKg, 0))} Kg
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Sum of every material line&apos;s Kg</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Purchase value</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    ৳ {formatAmount(monthMaterialPurchases.reduce((sum, record) => sum + record.totalAmount, 0))}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Qty × rate — record only, no vendor due or payment</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Material Purchase</CardTitle>
                  <CardDescription>
                    কাঁচামাল কেনার আলাদা হিসাব — date, material, Kg and rate. This doesn&apos;t touch vendors, payments,
                    due, Factory Stock or raw material stock.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={openCreateMaterialPurchaseDialog} className="h-10 rounded-xl">
                    <Plus className="mr-2 h-4 w-4" />
                    New Material Purchase
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={materialPurchasePeriod} onValueChange={(value) => setMaterialPurchasePeriod(value as MaterialPurchasePeriod)}>
                    <SelectTrigger className="h-10 w-40" aria-label="Period">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Month-wise</SelectItem>
                      <SelectItem value="range">Custom range</SelectItem>
                      <SelectItem value="date">Single date</SelectItem>
                      <SelectItem value="all">All time</SelectItem>
                    </SelectContent>
                  </Select>
                  {materialPurchasePeriod === 'month' ? (
                    <Input
                      type="month"
                      value={materialPurchaseMonth}
                      onChange={(event) => setMaterialPurchaseMonth(event.target.value)}
                      className="h-10 w-44"
                      aria-label="Month"
                    />
                  ) : null}
                  {materialPurchasePeriod === 'range' ? (
                    <>
                      <Input
                        type="date"
                        value={materialPurchaseFrom}
                        onChange={(event) => setMaterialPurchaseFrom(event.target.value)}
                        className="h-10 w-44"
                        aria-label="From date"
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        type="date"
                        value={materialPurchaseTo}
                        onChange={(event) => setMaterialPurchaseTo(event.target.value)}
                        className="h-10 w-44"
                        aria-label="To date"
                      />
                    </>
                  ) : null}
                  {materialPurchasePeriod === 'date' ? (
                    <Input
                      type="date"
                      value={materialPurchaseDay}
                      onChange={(event) => setMaterialPurchaseDay(event.target.value)}
                      className="h-10 w-44"
                      aria-label="Date"
                    />
                  ) : null}
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="h-10 pl-9"
                      placeholder="Search entry no or material"
                    />
                  </div>
                  <Button variant="outline" onClick={printMaterialPurchaseReport} className="h-10 rounded-xl">
                    <Printer className="mr-2 h-4 w-4" />
                    Print Report
                  </Button>
                </div>

                <div>
                  <p className="mb-3 text-sm font-medium">
                    Material-wise total — {materialPurchasePeriodLabel}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">Click a column heading to sort</span>
                  </p>
                  <div className="overflow-x-auto rounded-2xl border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead className="w-12">SL</TableHead>
                          {(
                            [
                              ['name', 'Material', false],
                              ['qtyKg', 'Total Kg', true],
                              ['avgRate', 'Avg Rate / Kg', true],
                              ['amount', 'Amount', true],
                              ['entries', 'Lines', true],
                              ['lastDate', 'Last Bought', true],
                            ] as Array<[MaterialSummarySortKey, string, boolean]>
                          ).map(([key, label, numeric]) => (
                            <TableHead key={key} className={numeric ? 'text-right' : undefined}>
                              <button
                                type="button"
                                onClick={() => toggleMaterialSummarySort(key)}
                                className={cn(
                                  'inline-flex items-center gap-1 hover:text-foreground',
                                  materialSummarySort.key === key && 'text-foreground'
                                )}
                              >
                                {label}
                                {materialSummarySort.key === key ? (materialSummarySort.dir === 'asc' ? ' ▲' : ' ▼') : null}
                              </button>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {materialPurchaseSummary.map((row, index) => (
                          <TableRow key={row.name}>
                            <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatQty(row.qtyKg)} Kg</TableCell>
                            <TableCell className="text-right tabular-nums">৳ {formatAmount(row.avgRate)}</TableCell>
                            <TableCell className="text-right tabular-nums">৳ {formatAmount(row.amount)}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.entries}</TableCell>
                            <TableCell className="text-right">{row.lastDate ? formatDate(row.lastDate) : '—'}</TableCell>
                          </TableRow>
                        ))}
                        {materialPurchaseSummary.length > 0 ? (
                          <TableRow className="bg-muted/30 font-semibold hover:bg-muted/30">
                            <TableCell colSpan={2}>Total</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatQty(materialPurchaseSummary.reduce((sum, row) => sum + row.qtyKg, 0))} Kg
                            </TableCell>
                            <TableCell />
                            <TableCell className="text-right tabular-nums">
                              ৳ {formatAmount(materialPurchaseSummary.reduce((sum, row) => sum + row.amount, 0))}
                            </TableCell>
                            <TableCell colSpan={2} />
                          </TableRow>
                        ) : (
                          <TableRow>
                            <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                              No material bought in this period.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Entry No</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Materials</TableHead>
                        <TableHead className="text-right">Total Kg</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMaterialPurchases.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="font-medium">
                            {record.entryNumber}
                            {record.note ? <p className="max-w-48 truncate text-xs font-normal text-muted-foreground">{record.note}</p> : null}
                          </TableCell>
                          <TableCell>{formatDate(record.date)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {record.items.map((item, index) => (
                              <p key={index} className="whitespace-nowrap">
                                {item.materialName}: {formatQty(item.qtyKg)} Kg × ৳ {formatAmount(item.ratePerKg)} = ৳ {formatAmount(item.amount)}
                              </p>
                            ))}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatQty(record.totalQtyKg)} Kg</TableCell>
                          <TableCell className="text-right tabular-nums">৳ {formatAmount(record.totalAmount)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                onClick={() => openEditMaterialPurchaseDialog(record)}
                                aria-label={`Edit material purchase ${record.entryNumber}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => void handleDeleteMaterialPurchase(record)}
                                aria-label={`Delete material purchase ${record.entryNumber}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredMaterialPurchases.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                            <Boxes className="mx-auto mb-2 h-8 w-8 opacity-50" />
                            No material purchases recorded for this period.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Earlier production batches (raw material → Finished Goods) stay
                listed so they can still be reviewed or deleted; new batches
                are no longer created from this tab (2026-10-13). */}
            {productionBatches.length > 0 ? (
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle>Earlier production batches</CardTitle>
                  <CardDescription>Recorded before this tab switched to material purchases. Deleting one reverses its stock.</CardDescription>
                </CardHeader>
                <CardContent>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}

        {section === 'finishedGoods' ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Pack sizes on file</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{finishedGoodsList.length.toLocaleString('en-BD')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Every Production output variant</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Total units in stock</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {finishedGoodsList.reduce((sum, item) => sum + item.stockQty, 0).toLocaleString('en-BD')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Ready for Rate Card / Trade Sales invoicing</p>
                </CardContent>
              </Card>
              <Card
                className={cn(
                  'border-border/70 shadow-sm',
                  finishedGoodsList.some((item) => item.stockQty <= item.minStock) && 'border-destructive/50 bg-destructive/5'
                )}
              >
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Needs production</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">
                    {finishedGoodsList.filter((item) => item.stockQty <= item.minStock).length.toLocaleString('en-BD')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">At or below their minimum stock</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Finished Goods</CardTitle>
                  <CardDescription>
                    Every pack-size variant a Production batch can output (e.g. "মরিচ ২.৫ কেজি") — stock rises with
                    every Production batch and falls the moment a Rate Card invoice bills it out to a Depot/Dealer.
                  </CardDescription>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(200px,1fr)_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="pl-9"
                      placeholder="Search name, pack size, or raw material"
                    />
                  </div>
                  <Button onClick={openCreateFinishedGoodsDialog} className="h-10 rounded-xl">
                    <Plus className="mr-2 h-4 w-4" />
                    Add pack size
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Name</TableHead>
                        <TableHead>Pack Size</TableHead>
                        <TableHead>Raw Material</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Min Stock</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFinishedGoods.map((item) => {
                        const low = item.stockQty <= item.minStock
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="min-w-48">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                  <AvatarFallback className="bg-muted text-muted-foreground">
                                    <Layers className="h-4 w-4" />
                                  </AvatarFallback>
                                </Avatar>
                                <p className="font-semibold">{item.name}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.packSize ?? '—'}
                              {describePackConversion(item) ? (
                                <p className="text-[11px] text-muted-foreground">{describePackConversion(item)}</p>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{item.rawMaterialName ?? '—'}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatQty(item.stockQty)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatQty(item.minStock)}
                            </TableCell>
                            <TableCell>
                              {low ? (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertTriangle className="h-3 w-3" /> Low — produce more
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-emerald-600">
                                  OK
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9"
                                  onClick={() => openEditFinishedGoodsDialog(item)}
                                  aria-label={`Edit ${item.name}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteFinishedGoods(item)}
                                  aria-label={`Delete ${item.name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {filteredFinishedGoods.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                            <Layers className="mx-auto mb-2 h-8 w-8 opacity-50" />
                            No finished goods pack sizes on file yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className={cn('border-border/70 shadow-sm', openShortfallCount > 0 && 'border-destructive/50 bg-destructive/5')}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4.5 w-4.5" />
                  Stock shortfalls
                </CardTitle>
                <CardDescription>
                  A Rate Card invoice can bill out a Finished Goods item before it's actually been produced — stock
                  goes negative and the shortfall is tracked here against that invoice. Recording a Production batch
                  for the same item auto-covers the oldest open shortfall first; {openShortfallCount > 0
                    ? `${openShortfallCount} still ${openShortfallCount === 1 ? 'needs' : 'need'} producing.`
                    : 'none are currently open.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Finished Goods</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Shortfall</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockShortfalls.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.finishedGoodsName}</TableCell>
                          <TableCell className="text-muted-foreground">{row.invoiceNo}</TableCell>
                          <TableCell className="text-muted-foreground">{row.date}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatQty(row.shortfallQty)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatQty(row.remainingQty)}</TableCell>
                          <TableCell>
                            {row.status === 'open' ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="h-3 w-3" /> Awaiting production
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 text-emerald-600">
                                <CheckCircle2 className="h-3 w-3" /> Resolved
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {stockShortfalls.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                            No invoice has ever sold a Finished Goods item ahead of its stock.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      {/* ---- Material dialog ---- */}
      <Dialog open={materialDialogOpen} onOpenChange={setMaterialDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMaterial ? 'Edit material' : 'Add material'}</DialogTitle>
            <DialogDescription>
              For a Kg-tracked packaging material, set grams used per finished piece to see pieces available. For a
              Pcs-tracked one (sack/carton), set how many finished pieces one unit holds instead.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Material name<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Combobox
                options={productNameOptions}
                value={materialForm.name}
                onChange={(value) => setMaterialForm((current) => ({ ...current, name: value }))}
                onCreateNew={(typedText) => setMaterialForm((current) => ({ ...current, name: typedText }))}
                placeholder="Select from Product list"
                searchPlaceholder="Search product name..."
                emptyText="No matching product."
                createNewLabel="Use this name"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Category</p>
                <Select
                  value={materialForm.category}
                  onValueChange={(value) =>
                    setMaterialForm((current) => ({ ...current, category: value as PurchaseMaterialCategory, packagingType: '' }))
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="raw_material">Raw Material</SelectItem>
                    <SelectItem value="packaging_material">Packaging Material</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Tracked in</p>
                <Select
                  value={materialForm.unit}
                  onValueChange={(value) => setMaterialForm((current) => ({ ...current, unit: value as PurchaseMaterialUnit }))}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">Kg (by weight)</SelectItem>
                    <SelectItem value="pcs">Pcs (by count)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {materialForm.category === 'packaging_material' ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Packaging type</p>
                <Select
                  value={materialForm.packagingType || undefined}
                  onValueChange={(value) => setMaterialForm((current) => ({ ...current, packagingType: value as PackagingType }))}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PACKAGING_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {materialForm.category === 'packaging_material' && materialForm.unit === 'kg' ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Grams used per finished piece</p>
                <Input
                  type="number"
                  min={0}
                  value={materialForm.unitWeightGrams}
                  onChange={(event) => setMaterialForm((current) => ({ ...current, unitWeightGrams: event.target.value }))}
                  placeholder="e.g. 3 (a 40g tea pouch uses 3g of film)"
                />
              </div>
            ) : null}

            {materialForm.category === 'packaging_material' && materialForm.unit === 'pcs' ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Finished pieces per unit</p>
                <Input
                  type="number"
                  min={0}
                  value={materialForm.capacityPerUnit}
                  onChange={(event) => setMaterialForm((current) => ({ ...current, capacityPerUnit: event.target.value }))}
                  placeholder="e.g. 500 (one sack holds 500 finished pieces)"
                />
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Opening stock ({UNIT_LABEL[materialForm.unit]})</p>
                <Input
                  type="number"
                  min={0}
                  value={materialForm.stockQty}
                  onChange={(event) => setMaterialForm((current) => ({ ...current, stockQty: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Minimum stock ({UNIT_LABEL[materialForm.unit]})</p>
                <Input
                  type="number"
                  min={0}
                  value={materialForm.minStock}
                  onChange={(event) => setMaterialForm((current) => ({ ...current, minStock: event.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setMaterialDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className="rounded-xl" onClick={() => void handleSaveMaterial()}>
                {editingMaterial ? 'Update material' : 'Save material'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Log usage dialog ---- */}
      <Dialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log usage — {usageMaterial?.name}</DialogTitle>
            <DialogDescription>
              Production consuming this material, or stock issued out — this takes it back down off the running stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Quantity ({usageMaterial ? UNIT_LABEL[usageMaterial.unit] : ''})</p>
              <Input type="number" min={0} value={usageQty} onChange={(event) => setUsageQty(event.target.value)} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Date</p>
              <Input type="date" value={usageDate} onChange={(event) => setUsageDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Note (optional)</p>
              <Textarea
                value={usageNote}
                onChange={(event) => setUsageNote(event.target.value)}
                placeholder="e.g. Packed into today's production batch"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setUsageDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className="rounded-xl" onClick={() => void handleLogUsage()}>
                Log usage
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- New purchase dialog ---- */}
      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto p-0 sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Truck className="h-4.5 w-4.5" />
              </span>
              <div>
                <DialogTitle>{editingPurchase ? `Edit purchase — ${editingPurchase.purchaseNumber}` : 'New purchase'}</DialogTitle>
                <DialogDescription>Pick the vendor, then add materials with quantity and rate.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 px-6 pb-6">
            <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Vendor</label>
                <Combobox
                  options={vendorOptions}
                  value={purchaseVendorId}
                  onChange={setPurchaseVendorId}
                  placeholder="Select a vendor"
                  searchPlaceholder="Search vendors..."
                  emptyText="No vendors found — add one on the Vendor page first."
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Purchase Date</label>
                <Input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} className="bg-background" />
              </div>
            </div>

            {/* Cards, not a <Table>, on purpose — the Combobox's dropdown is
                absolutely positioned relative to this row, and a horizontally
                scrolling table clips that popover to a sliver instead of
                letting it float over the rest of the row. */}
            <datalist id="purchase-material-suggestions">
              {materialNameSuggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <div className="space-y-3">
              {purchaseLines.map((line, index) => (
                <div key={line.key} className="space-y-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Input
                        list="purchase-material-suggestions"
                        value={line.materialName}
                        onChange={(event) => handleLineMaterialNameChange(line.key, event.target.value)}
                        placeholder="Type material name"
                        className="bg-background"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removePurchaseLine(line.key)}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Qty ({UNIT_LABEL[line.unit]})</label>
                      <Input
                        type="number"
                        min={0}
                        value={line.qty}
                        onChange={(event) => handleLineQtyChange(line.key, event.target.value)}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Rate (per {UNIT_LABEL[line.unit]})</label>
                      <Input
                        type="number"
                        min={0}
                        value={line.rate}
                        onChange={(event) => handleLineRateChange(line.key, event.target.value)}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Amount</label>
                      <Input
                        type="number"
                        min={0}
                        value={line.amount}
                        onChange={(event) => handleLineAmountChange(line.key, event.target.value)}
                        className="bg-background text-right"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addPurchaseLine}>
                <Plus className="mr-2 h-4 w-4" />
                Add material line
              </Button>

              <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total amount</p>
                  <p className="text-lg font-semibold">{formatAmount(purchaseTotal)}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">
                    {editingPurchase ? 'Total paid' : 'Paid now'}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={purchasePaid}
                    onChange={(event) => setPurchasePaid(event.target.value)}
                    className="bg-background"
                  />
                  {editingPurchase && editingVendorPaymentsTotal > 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      Includes {formatAmount(editingVendorPaymentsTotal)} recorded as separate vendor payments — can&apos;t go below that.
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Can be more than the total amount — the extra pays down this vendor&apos;s older due below.
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due (this purchase)</p>
                  {(() => {
                    const thisDue = purchaseTotal - (Number(purchasePaid) || 0)
                    return (
                      <p className={cn('text-lg font-semibold', thisDue > 0 ? 'text-destructive' : 'text-emerald-600')}>
                        {formatAmount(Math.abs(thisDue))}
                        {thisDue < 0 ? ' (extra)' : ''}
                      </p>
                    )
                  })()}
                </div>
              </div>

              {purchaseVendorId ? (
                <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Previous due</p>
                    <p className="text-lg font-semibold tabular-nums">{formatAmount(vendorDueExcludingThisPurchase)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">+ New purchase</p>
                    <p className="text-lg font-semibold tabular-nums">{formatAmount(purchaseTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">− Payment</p>
                    <p className="text-lg font-semibold tabular-nums text-emerald-600">
                      {formatAmount(Number(purchasePaid) || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">= Current due</p>
                    {(() => {
                      const totalDue =
                        vendorDueExcludingThisPurchase + purchaseTotal - (Number(purchasePaid) || 0)
                      return (
                        <p className={cn('text-lg font-semibold tabular-nums', totalDue > 0 ? 'text-destructive' : 'text-emerald-600')}>
                          {formatAmount(Math.abs(totalDue))}
                          {totalDue < 0 ? ' (extra)' : ''}
                        </p>
                      )
                    })()}
                  </div>
                </div>
              ) : null}

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
                <Textarea value={purchaseNote} onChange={(event) => setPurchaseNote(event.target.value)} placeholder="Any remarks about this purchase" className="bg-background" />
              </div>
            </div>

            {purchaseFormError ? <p className="text-sm text-destructive">{purchaseFormError}</p> : null}

            <div className="flex justify-end gap-3 border-t border-border/60 pt-4">
              <Button variant="outline" onClick={() => setPurchaseDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleSavePurchase()} disabled={purchaseSaving}>
                {purchaseSaving ? 'Saving…' : editingPurchase ? 'Save changes' : 'Record purchase'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <VendorPaymentDialog open={vendorPayDialogOpen} onOpenChange={setVendorPayDialogOpen} onSaved={setFeedback} />

      {/* ---- Vendor payment dialog ---- */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingPayment ? `Edit payment ${editingPayment.receiptNumber}` : 'Record payment'} — {paymentPurchase?.purchaseNumber}
            </DialogTitle>
            <DialogDescription>
              {paymentPurchase
                ? `${paymentPurchase.vendorName} — ${formatAmount(
                    paymentPurchase.due + (editingPayment?.amount ?? 0)
                  )} currently due.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Amount deposited</p>
              <Input
                type="number"
                min={0}
                max={paymentPurchase ? paymentPurchase.due + (editingPayment?.amount ?? 0) : undefined}
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Date</p>
              <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Note (optional)</p>
              <Textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="e.g. Paid by bank transfer" />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setPaymentDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className="rounded-xl" onClick={() => void handleRecordPayment()}>
                {editingPayment ? 'Save changes' : 'Record payment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Payment history dialog ---- */}
      <Dialog open={paymentHistoryDialogOpen} onOpenChange={setPaymentHistoryDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Payment history — {paymentHistoryPurchase?.purchaseNumber}</DialogTitle>
            <DialogDescription>
              {paymentHistoryPurchase
                ? `${paymentHistoryPurchase.vendorName} — ${formatAmount(paymentHistoryPurchase.paid)} paid of ${formatAmount(paymentHistoryPurchase.totalAmount)} total.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto rounded-xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt No</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(paymentHistoryPurchase ? vendorPaymentsByPurchaseId.get(paymentHistoryPurchase.id) ?? [] : [])
                  .slice()
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{formatDate(payment.date)}</TableCell>
                      <TableCell>{payment.receiptNumber}<RecordApprovalTag record={payment} /></TableCell>
                      <TableCell className="max-w-40 truncate text-muted-foreground">{payment.note ?? ''}</TableCell>
                      <TableCell className="text-right">{formatAmount(payment.amount)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => paymentHistoryPurchase && openEditPaymentDialog(paymentHistoryPurchase, payment)}
                        >
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                {!paymentHistoryPurchase || (vendorPaymentsByPurchaseId.get(paymentHistoryPurchase.id) ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      No separate vendor payments recorded yet — only the amount paid at purchase time.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setPaymentHistoryDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Finished Goods dialog ---- */}
      <Dialog open={finishedGoodsDialogOpen} onOpenChange={setFinishedGoodsDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFinishedGoods ? 'Edit finished goods' : 'New finished goods pack size'}</DialogTitle>
            <DialogDescription>
              One pack-size variant a Production batch can output — e.g. &ldquo;মরিচ ২.৫ কেজি&rdquo;. The rate columns
              prefill a Rate Card line the moment this item is picked there.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Name</p>
              <Input
                value={finishedGoodsForm.name}
                onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. মরিচ ২.৫ কেজি"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Raw material (optional)</p>
                <Combobox
                  options={rawMaterialOptions}
                  value={finishedGoodsForm.rawMaterialId}
                  onChange={(value) => setFinishedGoodsForm((current) => ({ ...current, rawMaterialId: value }))}
                  placeholder="Select raw material"
                  searchPlaceholder="Search raw materials..."
                  emptyText="No raw materials found — add one in Materials & Stock first."
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Pack size label (optional)</p>
                <Input
                  value={finishedGoodsForm.packSize}
                  onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, packSize: event.target.value }))}
                  placeholder="e.g. 2.5 Kg"
                />
              </div>
            </div>
            {/* Packaging conversion (spec §10): piece → gram → kg. */}
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-sm font-medium text-foreground">
                Packaging conversion <span className="font-normal text-muted-foreground">(optional — for packets in a carton)</span>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Weight per piece / packet (gram)</p>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={finishedGoodsForm.pieceWeightGrams}
                    onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, pieceWeightGrams: event.target.value }))}
                    placeholder="e.g. 45"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Pieces per carton / unit</p>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={finishedGoodsForm.piecesPerUnit}
                    onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, piecesPerUnit: event.target.value }))}
                    placeholder="e.g. 72"
                  />
                </div>
              </div>
              {finishedGoodsConversion ? (
                <p className="text-xs font-medium text-primary">1 carton = {finishedGoodsConversion}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Raw material Kg per produced unit</p>
              <Input
                type="number"
                min={0}
                step="0.001"
                value={
                  finishedGoodsPackKg !== undefined ? String(Math.round(finishedGoodsPackKg * 1000) / 1000) : finishedGoodsForm.unitWeightKg
                }
                disabled={finishedGoodsPackKg !== undefined}
                onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, unitWeightKg: event.target.value }))}
                placeholder="e.g. 15 (one sack of this pack size uses 15 Kg raw material)"
              />
              {finishedGoodsPackKg !== undefined ? (
                <p className="text-[11px] text-muted-foreground">Calculated from the packaging conversion above.</p>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Opening stock</p>
                <Input
                  type="number"
                  min={0}
                  value={finishedGoodsForm.stockQty}
                  onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, stockQty: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Minimum stock</p>
                <Input
                  type="number"
                  min={0}
                  value={finishedGoodsForm.minStock}
                  onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, minStock: event.target.value }))}
                />
              </div>
            </div>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Rate Card defaults</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Raw M</p>
                <Input
                  type="number"
                  min={0}
                  value={finishedGoodsForm.rawRate}
                  onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, rawRate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Manuf Rate</p>
                <Input
                  type="number"
                  min={0}
                  value={finishedGoodsForm.manufRate}
                  onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, manufRate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Depot P R</p>
                <Input
                  type="number"
                  min={0}
                  value={finishedGoodsForm.depotRate}
                  onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, depotRate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Depot S R</p>
                <Input
                  type="number"
                  min={0}
                  value={finishedGoodsForm.dealerRate}
                  onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, dealerRate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">TP</p>
                <Input
                  type="number"
                  min={0}
                  value={finishedGoodsForm.tpRate}
                  onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, tpRate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">MRP</p>
                <Input
                  type="number"
                  min={0}
                  value={finishedGoodsForm.mrpRate}
                  onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, mrpRate: event.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setFinishedGoodsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className="rounded-xl" onClick={() => void handleSaveFinishedGoods()}>
                {editingFinishedGoods ? 'Update finished goods' : 'Save finished goods'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- New production batch dialog ---- */}
      <Dialog open={materialPurchaseDialogOpen} onOpenChange={setMaterialPurchaseDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto p-0 sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Boxes className="h-4.5 w-4.5" />
              </span>
              <div>
                <DialogTitle>
                  {editingMaterialPurchase ? `Edit material purchase — ${editingMaterialPurchase.entryNumber}` : 'New Material Purchase'}
                </DialogTitle>
                <DialogDescription>কাঁচামাল কেনার রেকর্ড তৈরি করুন</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 px-6 pb-6">
            <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Purchase Date *</label>
                <Input
                  type="date"
                  value={materialPurchaseDate}
                  onChange={(event) => setMaterialPurchaseDate(event.target.value)}
                  className="bg-background"
                />
              </div>
            </div>

            <datalist id="material-purchase-suggestions">
              {materialPurchaseNameSuggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <div className="space-y-3">
              {materialPurchaseLines.map((line, index) => {
                const qtyKg = Number(line.qtyKg) || 0
                const ratePerKg = Number(line.ratePerKg) || 0
                return (
                  <div key={line.key} className="space-y-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <label className="text-xs text-muted-foreground">Type of Materials *</label>
                        <Input
                          list="material-purchase-suggestions"
                          value={line.materialName}
                          onChange={(event) => updateMaterialPurchaseLine(line.key, { materialName: event.target.value })}
                          placeholder="যেমন: হলুদ"
                          className="bg-background"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-5 h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeMaterialPurchaseLine(line.key)}
                        aria-label="Remove material"
                        disabled={materialPurchaseLines.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Qty (Kg) *</label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.qtyKg}
                          onChange={(event) => updateMaterialPurchaseLine(line.key, { qtyKg: event.target.value })}
                          placeholder="0"
                          className="bg-background"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Rate (per Kg) *</label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.ratePerKg}
                          onChange={(event) => updateMaterialPurchaseLine(line.key, { ratePerKg: event.target.value })}
                          placeholder="0"
                          className="bg-background"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Amount</label>
                        <p className="flex h-9 items-center justify-end rounded-md border border-border/60 bg-muted/30 px-3 text-sm font-medium tabular-nums">
                          ৳ {formatAmount(roundMoney(qtyKg * ratePerKg))}
                        </p>
                        {qtyKg > 0 && ratePerKg > 0 ? (
                          <p className="text-right text-[11px] text-muted-foreground">
                            {formatQty(qtyKg)} কেজি × {formatQty(ratePerKg)} টাকা
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMaterialPurchaseLines((current) => [...current, emptyMaterialPurchaseLine()])}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Materials
              </Button>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
                <Textarea
                  value={materialPurchaseNote}
                  onChange={(event) => setMaterialPurchaseNote(event.target.value)}
                  placeholder="প্রয়োজনে মন্তব্য লিখুন..."
                  className="bg-background"
                />
              </div>
            </div>

            {materialPurchaseFormError ? <p className="text-sm text-destructive">{materialPurchaseFormError}</p> : null}

            <div className="flex justify-end gap-3 border-t border-border/60 pt-4">
              <Button variant="outline" onClick={() => setMaterialPurchaseDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleSaveMaterialPurchase()} disabled={materialPurchaseSaving}>
                {materialPurchaseSaving ? 'Saving…' : editingMaterialPurchase ? 'Save changes' : 'Record Entry'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

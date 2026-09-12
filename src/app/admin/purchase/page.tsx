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
import { ExportMenu } from '@/components/admin/ExportMenu'
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
  PackagingType,
  ProductionBatchRecord,
  PurchaseMaterialCategory,
  PurchaseMaterialRecord,
  PurchaseMaterialUnit,
  PurchaseRecord,
  VendorRecord,
} from '@/lib/erp/types'
import {
  computeMaterialAvailablePieces,
  createId,
  formatDate,
  sortByCreatedAtDesc,
  toArray,
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

// ---- Production entry dialog ---------------------------------------------
type ProductionOutputDraft = {
  key: string
  finishedGoodsId?: string
  finishedGoodsName: string
  qtyProduced: string
  unitWeightKg: string
}

function emptyProductionOutput(): ProductionOutputDraft {
  return { key: createId('line'), finishedGoodsName: '', qtyProduced: '0', unitWeightKg: '0' }
}

// ---- Purchase entry dialog --------------------------------------------------
type PurchaseLineDraft = {
  key: string
  materialId?: string
  materialName: string
  unit: PurchaseMaterialUnit
  qty: string
  rate: string
}

function emptyPurchaseLine(): PurchaseLineDraft {
  return { key: createId('line'), materialName: '', unit: 'kg', qty: '0', rate: '0' }
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
          .footnote { text-align: center; font-style: italic; font-size: 11.5px; color: #4b5563; margin-top: 16px; }
          @media print { button { display: none; } }
`

function buildPurchaseVoucherHtml(entry: PurchaseRecord, vendor?: VendorRecord) {
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
        ${entry.note ? `<p class="remarks"><strong>Note:</strong> ${escapeHtml(entry.note)}</p>` : ''}
        <p class="footnote">${escapeHtml(COMPANY_INVOICE_FOOTER_NOTE)}</p>
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

type SectionId = 'purchases' | 'materials' | 'production' | 'finishedGoods'

const SECTIONS: Array<{ id: SectionId; label: string; description: string }> = [
  { id: 'purchases', label: 'Purchase Entry', description: 'Daily buys from vendors — Kg, rate, paid, due' },
  { id: 'materials', label: 'Materials & Stock', description: 'Raw + packaging material stock and low-stock alerts' },
  { id: 'production', label: 'Production Entry', description: 'Raw material repacked into Finished Goods pack sizes' },
  { id: 'finishedGoods', label: 'Finished Goods', description: 'Production output stock, ready for Rate Card invoicing' },
]

export default function PurchasePage() {
  const {
    data,
    savePurchaseMaterial,
    deletePurchaseMaterial,
    createPurchase,
    deletePurchase,
    recordVendorPayment,
    createMaterialUsage,
    deleteMaterialUsage,
    saveFinishedGoods,
    deleteFinishedGoods,
    createProductionBatch,
    deleteProductionBatch,
  } = useERP()

  const vendors = useMemo(() => sortByCreatedAtDesc(toArray(data?.vendors)), [data?.vendors])
  const vendorById = useMemo(() => new Map(vendors.map((vendor) => [vendor.id, vendor])), [vendors])
  const materials = useMemo(() => sortByCreatedAtDesc(toArray(data?.purchaseMaterials)), [data?.purchaseMaterials])
  const rawMaterials = useMemo(() => materials.filter((material) => material.category === 'raw_material'), [materials])
  const purchases = useMemo(() => sortByCreatedAtDesc(toArray(data?.purchases)), [data?.purchases])
  const usages = useMemo(() => sortByCreatedAtDesc(toArray(data?.materialUsages)), [data?.materialUsages])
  const finishedGoodsList = useMemo(() => sortByCreatedAtDesc(toArray(data?.finishedGoods)), [data?.finishedGoods])
  const finishedGoodsById = useMemo(() => new Map(finishedGoodsList.map((item) => [item.id, item])), [finishedGoodsList])
  const productionBatches = useMemo(() => sortByCreatedAtDesc(toArray(data?.productionBatches)), [data?.productionBatches])
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
  const finishedGoodsOptions: ComboboxOption[] = useMemo(
    () =>
      finishedGoodsList.map((item) => ({
        value: item.id,
        label: item.name,
        sublabel: item.packSize ? `${item.packSize} · ${formatQty(item.stockQty)} in stock` : `${formatQty(item.stockQty)} in stock`,
      })),
    [finishedGoodsList]
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
  const [usageDate, setUsageDate] = useState(new Date().toISOString().slice(0, 10))
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
    setUsageDate(new Date().toISOString().slice(0, 10))
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

  // ---- Production entry --------------------------------------------------------
  const [productionDialogOpen, setProductionDialogOpen] = useState(false)
  const [productionRawMaterialId, setProductionRawMaterialId] = useState('')
  const [productionDate, setProductionDate] = useState(new Date().toISOString().slice(0, 10))
  const [productionOutputs, setProductionOutputs] = useState<ProductionOutputDraft[]>([emptyProductionOutput()])
  const [productionNote, setProductionNote] = useState('')
  const [productionSaving, setProductionSaving] = useState(false)
  const [productionFormError, setProductionFormError] = useState<string | null>(null)

  const filteredProductionBatches = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return productionBatches
    return productionBatches.filter((batch) =>
      [batch.batchNumber, batch.rawMaterialName].join(' ').toLowerCase().includes(normalized)
    )
  }, [productionBatches, query])

  const productionRawMaterial = useMemo(
    () => (productionRawMaterialId ? data?.purchaseMaterials[productionRawMaterialId] : undefined),
    [data?.purchaseMaterials, productionRawMaterialId]
  )
  const productionRawKgTotal = useMemo(
    () =>
      productionOutputs.reduce(
        (sum, output) => sum + (Number(output.qtyProduced) || 0) * (Number(output.unitWeightKg) || 0),
        0
      ),
    [productionOutputs]
  )

  function openCreateProductionDialog() {
    setProductionRawMaterialId('')
    setProductionDate(new Date().toISOString().slice(0, 10))
    setProductionOutputs([emptyProductionOutput()])
    setProductionNote('')
    setProductionFormError(null)
    setFeedback(null)
    setProductionDialogOpen(true)
  }

  function updateProductionOutput(key: string, patch: Partial<ProductionOutputDraft>) {
    setProductionOutputs((current) => current.map((output) => (output.key === key ? { ...output, ...patch } : output)))
  }

  function selectProductionOutput(key: string, finishedGoodsId: string) {
    const finishedGoods = finishedGoodsById.get(finishedGoodsId)
    updateProductionOutput(key, {
      finishedGoodsId,
      finishedGoodsName: finishedGoods?.name ?? '',
      unitWeightKg: finishedGoods?.unitWeightKg ? String(finishedGoods.unitWeightKg) : '0',
    })
  }

  function addProductionOutput() {
    setProductionOutputs((current) => [...current, emptyProductionOutput()])
  }

  function removeProductionOutput(key: string) {
    setProductionOutputs((current) => (current.length > 1 ? current.filter((output) => output.key !== key) : current))
  }

  async function handleSaveProductionBatch() {
    setProductionFormError(null)

    if (!productionRawMaterialId) {
      setProductionFormError('Pick the raw material this batch repacks.')
      return
    }

    const outputs = productionOutputs
      .filter((output) => output.finishedGoodsId && (Number(output.qtyProduced) || 0) > 0)
      .map((output) => ({
        finishedGoodsId: output.finishedGoodsId as string,
        qtyProduced: Number(output.qtyProduced) || 0,
        unitWeightKg: Number(output.unitWeightKg) || 0,
      }))

    if (outputs.length === 0) {
      setProductionFormError('Pick at least one finished goods pack size and enter a quantity produced.')
      return
    }

    setProductionSaving(true)
    try {
      await createProductionBatch({
        rawMaterialId: productionRawMaterialId,
        date: productionDate,
        note: productionNote.trim() || undefined,
        outputs,
      })
      setProductionDialogOpen(false)
      setFeedback('Production batch recorded — raw material and finished goods stock updated.')
    } catch (reason) {
      setProductionFormError(reason instanceof Error ? reason.message : 'Unable to record production batch.')
    } finally {
      setProductionSaving(false)
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
  const [purchaseVendorId, setPurchaseVendorId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [purchaseLines, setPurchaseLines] = useState<PurchaseLineDraft[]>([emptyPurchaseLine()])
  const [purchasePaid, setPurchasePaid] = useState('0')
  const [purchaseNote, setPurchaseNote] = useState('')
  const [purchaseSaving, setPurchaseSaving] = useState(false)
  const [purchaseFormError, setPurchaseFormError] = useState<string | null>(null)

  const [paymentPurchase, setPaymentPurchase] = useState<PurchaseRecord | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('0')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentNote, setPaymentNote] = useState('')
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)

  const purchaseTotal = useMemo(
    () => purchaseLines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.rate) || 0), 0),
    [purchaseLines]
  )

  const filteredPurchases = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return purchases
    return purchases.filter((purchase) =>
      [purchase.purchaseNumber, purchase.vendorName].join(' ').toLowerCase().includes(normalized)
    )
  }, [purchases, query])

  const purchaseStats = useMemo(
    () =>
      purchases.reduce(
        (totals, purchase) => ({
          totalAmount: totals.totalAmount + purchase.totalAmount,
          totalPaid: totals.totalPaid + purchase.paid,
          totalDue: totals.totalDue + purchase.due,
        }),
        { totalAmount: 0, totalPaid: 0, totalDue: 0 }
      ),
    [purchases]
  )

  function openCreatePurchaseDialog() {
    setPurchaseVendorId('')
    setPurchaseDate(new Date().toISOString().slice(0, 10))
    setPurchaseLines([emptyPurchaseLine()])
    setPurchasePaid('0')
    setPurchaseNote('')
    setPurchaseFormError(null)
    setFeedback(null)
    setPurchaseDialogOpen(true)
  }

  function updatePurchaseLine(key: string, patch: Partial<PurchaseLineDraft>) {
    setPurchaseLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)))
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
        })
      }

      await createPurchase({
        vendorId: purchaseVendorId,
        date: purchaseDate,
        items,
        paid: Number(purchasePaid) || 0,
        note: purchaseNote.trim() || undefined,
      })
      setPurchaseDialogOpen(false)
      setFeedback('Purchase recorded — stock and vendor due updated.')
    } catch (reason) {
      setPurchaseFormError(reason instanceof Error ? reason.message : 'Unable to record purchase.')
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
    setPaymentAmount('0')
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setPaymentNote('')
    setFeedback(null)
    setPaymentDialogOpen(true)
  }

  async function handleRecordPayment() {
    if (!paymentPurchase) return
    setFeedback(null)
    try {
      await recordVendorPayment({
        purchaseId: paymentPurchase.id,
        amount: Number(paymentAmount) || 0,
        date: paymentDate,
        note: paymentNote.trim() || undefined,
      })
      setPaymentDialogOpen(false)
      setFeedback(`Payment recorded against ${paymentPurchase.purchaseNumber}.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record payment.')
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
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{purchases.length.toLocaleString('en-BD')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Total procurement transactions</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Total purchased</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{formatAmount(purchaseStats.totalAmount)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Sum of every purchase's total amount</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Total deposited</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-600">{formatAmount(purchaseStats.totalPaid)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Paid at purchase time + separate vendor payments</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Total due to vendors</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">{formatAmount(purchaseStats.totalDue)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Currently owed across every vendor</p>
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
                <div className="grid gap-3 sm:grid-cols-[minmax(200px,1fr)_auto_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="pl-9"
                      placeholder="Search purchase no or vendor"
                    />
                  </div>
                  <Button onClick={openCreatePurchaseDialog} className="h-10 rounded-xl" disabled={materials.length === 0}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Purchase
                  </Button>
                  <ExportMenu
                    filenameBase="purchases"
                    title="Purchases"
                    headers={purchaseExportHeaders}
                    rows={purchaseExportRows}
                  />
                </div>
              </CardHeader>
              <CardContent>
                {materials.length === 0 ? (
                  <div className="mb-4 rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                    Add at least one material on the Materials & Stock tab before recording a purchase.
                  </div>
                ) : null}
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
                          <TableCell className="font-medium">{purchase.purchaseNumber}</TableCell>
                          <TableCell>{purchase.vendorName}</TableCell>
                          <TableCell>{formatDate(purchase.date)}</TableCell>
                          <TableCell className="max-w-64 truncate text-muted-foreground">
                            {purchase.items.map((item) => `${item.materialName} (${formatQty(item.qty)} ${UNIT_LABEL[item.unit]})`).join(', ')}
                          </TableCell>
                          <TableCell className="text-right">{formatAmount(purchase.totalAmount)}</TableCell>
                          <TableCell className="text-right text-emerald-600">{formatAmount(purchase.paid)}</TableCell>
                          <TableCell className="text-right text-destructive">{formatAmount(purchase.due)}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  Actions
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  disabled={purchase.due <= 0}
                                  onClick={() => openPaymentDialog(purchase)}
                                >
                                  <Wallet className="mr-2 h-4 w-4" /> Record payment
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openPrintWindow(buildPurchaseVoucherHtml(purchase, purchase.vendorId ? vendorById.get(purchase.vendorId) : undefined))}>
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
                            No purchases recorded yet.
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
                          <TableCell className="font-medium">{usage.materialName}</TableCell>
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
                  <p className="text-sm text-muted-foreground">Production batches</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{productionBatches.length.toLocaleString('en-BD')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Raw material repacked into Finished Goods</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Raw material consumed</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {formatQty(productionBatches.reduce((sum, batch) => sum + batch.rawKgConsumedTotal, 0))} Kg
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Sum of every batch's raw Kg used</p>
                </CardContent>
              </Card>
              <Card className="border-border/70 shadow-sm">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">Finished units produced</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">
                    {productionBatches
                      .reduce((sum, batch) => sum + batch.outputs.reduce((s, o) => s + o.qtyProduced, 0), 0)
                      .toLocaleString('en-BD')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Across every pack size, every batch</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Production Entry</CardTitle>
                  <CardDescription>
                    Pick a raw material, then repack it into one or more Finished Goods pack sizes — raw material
                    stock drops by the Kg used, each pack size's Finished Goods stock rises by the qty produced, and
                    whatever raw material is left over just stays on the shelf.
                  </CardDescription>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(200px,1fr)_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="pl-9"
                      placeholder="Search batch no or raw material"
                    />
                  </div>
                  <Button
                    onClick={openCreateProductionDialog}
                    className="h-10 rounded-xl"
                    disabled={rawMaterials.length === 0 || finishedGoodsList.length === 0}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Production
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {rawMaterials.length === 0 ? (
                  <div className="mb-4 rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                    Add at least one raw material on the Materials & Stock tab before recording production.
                  </div>
                ) : finishedGoodsList.length === 0 ? (
                  <div className="mb-4 rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                    Add at least one pack size on the Finished Goods tab before recording production.
                  </div>
                ) : null}
                <div className="overflow-x-auto rounded-2xl border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Batch No</TableHead>
                        <TableHead>Raw Material</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Output</TableHead>
                        <TableHead className="text-right">Raw Kg Used</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProductionBatches.map((batch) => (
                        <TableRow key={batch.id}>
                          <TableCell className="font-medium">{batch.batchNumber}</TableCell>
                          <TableCell>{batch.rawMaterialName}</TableCell>
                          <TableCell>{formatDate(batch.date)}</TableCell>
                          <TableCell className="max-w-64 truncate text-muted-foreground">
                            {batch.outputs.map((output) => `${output.finishedGoodsName} (${output.qtyProduced})`).join(', ')}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatQty(batch.rawKgConsumedTotal)} Kg</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteProductionBatch(batch)}
                              aria-label={`Delete production batch ${batch.batchNumber}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredProductionBatches.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                            <Factory className="mx-auto mb-2 h-8 w-8 opacity-50" />
                            No production batches recorded yet.
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
                            <TableCell>{item.packSize ?? '—'}</TableCell>
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
                <DialogTitle>New purchase</DialogTitle>
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
                        onChange={(event) => updatePurchaseLine(line.key, { qty: event.target.value })}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Rate (per {UNIT_LABEL[line.unit]})</label>
                      <Input
                        type="number"
                        min={0}
                        value={line.rate}
                        onChange={(event) => updatePurchaseLine(line.key, { rate: event.target.value })}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Amount</label>
                      <p className="flex h-9 items-center justify-end rounded-md border border-transparent px-3 text-sm font-medium tabular-nums">
                        {formatAmount((Number(line.qty) || 0) * (Number(line.rate) || 0))}
                      </p>
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
                  <label className="text-xs text-muted-foreground">Paid now</label>
                  <Input
                    type="number"
                    min={0}
                    max={purchaseTotal}
                    value={purchasePaid}
                    onChange={(event) => setPurchasePaid(event.target.value)}
                    className="bg-background"
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due</p>
                  <p className="text-lg font-semibold text-destructive">
                    {formatAmount(Math.max(purchaseTotal - (Number(purchasePaid) || 0), 0))}
                  </p>
                </div>
              </div>

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
                {purchaseSaving ? 'Saving…' : 'Record purchase'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Vendor payment dialog ---- */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment — {paymentPurchase?.purchaseNumber}</DialogTitle>
            <DialogDescription>
              {paymentPurchase ? `${paymentPurchase.vendorName} — ${formatAmount(paymentPurchase.due)} currently due.` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Amount deposited</p>
              <Input
                type="number"
                min={0}
                max={paymentPurchase?.due ?? undefined}
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
                Record payment
              </Button>
            </div>
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
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Raw material Kg per produced unit</p>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={finishedGoodsForm.unitWeightKg}
                onChange={(event) => setFinishedGoodsForm((current) => ({ ...current, unitWeightKg: event.target.value }))}
                placeholder="e.g. 15 (one sack of this pack size uses 15 Kg raw material)"
              />
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
      <Dialog open={productionDialogOpen} onOpenChange={setProductionDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto p-0 sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader className="border-b border-border/60 px-6 pb-4 pt-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Factory className="h-4.5 w-4.5" />
              </span>
              <div>
                <DialogTitle>New production batch</DialogTitle>
                <DialogDescription>
                  Pick the raw material, then add every pack size it's being repacked into with the qty produced.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 px-6 pb-6">
            <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Raw material</label>
                <Combobox
                  options={rawMaterialOptions}
                  value={productionRawMaterialId}
                  onChange={setProductionRawMaterialId}
                  placeholder="Select raw material"
                  searchPlaceholder="Search raw materials..."
                  emptyText="No raw materials found — add one in Materials & Stock first."
                />
                {productionRawMaterial ? (
                  <p className="text-xs text-muted-foreground">
                    {formatQty(productionRawMaterial.stockQty)} Kg currently in stock
                    {productionRawKgTotal > productionRawMaterial.stockQty ? (
                      <span className="text-destructive"> — this batch uses more than what's on hand</span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Production Date</label>
                <Input
                  type="date"
                  value={productionDate}
                  onChange={(event) => setProductionDate(event.target.value)}
                  className="bg-background"
                />
              </div>
            </div>

            {/* Cards, not a <Table>, on purpose — the Combobox's dropdown is
                absolutely positioned relative to this row, and a horizontally
                scrolling table clips that popover to a sliver instead of
                letting it float over the rest of the row. */}
            <div className="space-y-3">
              {productionOutputs.map((output, index) => (
                <div key={output.key} className="space-y-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Combobox
                        options={finishedGoodsOptions}
                        value={output.finishedGoodsId ?? ''}
                        onChange={(value) => selectProductionOutput(output.key, value)}
                        placeholder="Select pack size"
                        searchPlaceholder="Search finished goods..."
                        emptyText="No finished goods found — add one in the Finished Goods tab first."
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeProductionOutput(output.key)}
                      aria-label="Remove output line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Qty produced</label>
                      <Input
                        type="number"
                        min={0}
                        value={output.qtyProduced}
                        onChange={(event) => updateProductionOutput(output.key, { qtyProduced: event.target.value })}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Raw Kg per unit</label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={output.unitWeightKg}
                        onChange={(event) => updateProductionOutput(output.key, { unitWeightKg: event.target.value })}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Raw Kg consumed</label>
                      <p className="flex h-9 items-center justify-end rounded-md border border-transparent px-3 text-sm font-medium tabular-nums">
                        {formatQty((Number(output.qtyProduced) || 0) * (Number(output.unitWeightKg) || 0))} Kg
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addProductionOutput}>
                <Plus className="mr-2 h-4 w-4" />
                Add pack size
              </Button>

              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Total raw material consumed</p>
                <p className="text-lg font-semibold">{formatQty(productionRawKgTotal)} Kg</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
                <Textarea
                  value={productionNote}
                  onChange={(event) => setProductionNote(event.target.value)}
                  placeholder="Any remarks about this batch"
                  className="bg-background"
                />
              </div>
            </div>

            {productionFormError ? <p className="text-sm text-destructive">{productionFormError}</p> : null}

            <div className="flex justify-end gap-3 border-t border-border/60 pt-4">
              <Button variant="outline" onClick={() => setProductionDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleSaveProductionBatch()} disabled={productionSaving}>
                {productionSaving ? 'Saving…' : 'Record production'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

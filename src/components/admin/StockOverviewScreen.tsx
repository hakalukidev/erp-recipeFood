"use client"

import { useDeferredValue, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  AlertTriangle,
  Boxes,
  PackageX,
  PencilLine,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'

import { AdminShell } from './AdminShell'
import { ExportMenu } from './ExportMenu'
import { QuickCreateProductDialog } from './quick-create/QuickCreateProductDialog'
import { QuickCreateSupplierDialog } from './quick-create/QuickCreateSupplierDialog'
import { StockControlSection } from './StockControlSection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buildInventoryDashboard } from '@/lib/erp/dashboards'
import { useERP } from '@/lib/erp/provider'
import { RECIPE_STARTER_CATALOG, RECIPE_STARTER_CATEGORIES } from '@/lib/erp/starterCatalog'
import { formatCurrency, formatDate, formatDateTime, getProductStatus, toArray } from '@/lib/erp/utils'

const SUPPLIER_NONE = '__none__'
const currencyOptions = ['BDT', 'USD', 'CNY', 'EUR']
// Doubles as the Section 15 "Stock Type" classification — Raw Material,
// Packaging Material, Semi-Finished Goods, Finished Goods, Damaged Goods,
// Returned Goods, and Promotional Stock are all represented here rather
// than in a second, near-duplicate field.
const productTypeOptions = [
  'Raw Material',
  'Packaging Material',
  'Semi-Finished Goods',
  'Finished Goods',
  'Damaged Goods',
  'Returned Goods',
  'Promotional Stock',
  'Trading Goods',
]
const unitOptions = ['Pcs', 'Kg', 'Gram', 'Litre', 'ML', 'Box', 'Carton', 'Pack', 'Set', 'Dozen']

function statValueFontSizeClass(value: string) {
  const length = value.length
  if (length <= 6) return 'text-2xl md:text-3xl'
  if (length <= 9) return 'text-xl md:text-2xl'
  if (length <= 13) return 'text-lg md:text-xl'
  if (length <= 17) return 'text-base md:text-lg'
  return 'text-sm md:text-base'
}

type ProductFormState = {
  name: string
  banglaName: string
  englishName: string
  sku: string
  category: string
  subCategory: string
  brand: string
  productType: string
  serialNumber: string
  warrantyMonths: string
  unit: string
  purchaseUnit: string
  salesUnit: string
  conversionRatio: string
  packSize: string
  weight: string
  supplierId: string
  purchasePrice: string
  sellingPrice: string
  wholesalePrice: string
  mrp: string
  dealerPrice: string
  distributorPrice: string
  minSellingPrice: string
  batchApplicable: boolean
  expiryApplicable: boolean
  isActive: boolean
  stockQty: string
  minStock: string
  maxStock: string
  imageUrl: string
  imagePublicId: string
}

type PurchaseFormState = {
  productId: string
  supplierId: string
  quantity: string
  unitCost: string
  currency: string
}

type InventoryView = 'products' | 'low-stock' | 'purchases'

type ProductImageUploadResult = {
  imageUrl: string
  imagePublicId: string
}

function createEmptyProductForm(): ProductFormState {
  return {
    name: '',
    banglaName: '',
    englishName: '',
    sku: '',
    category: '',
    subCategory: '',
    brand: '',
    productType: '',
    serialNumber: '',
    warrantyMonths: '0',
    unit: '',
    purchaseUnit: '',
    salesUnit: '',
    conversionRatio: '1',
    packSize: '',
    weight: '',
    supplierId: SUPPLIER_NONE,
    purchasePrice: '',
    sellingPrice: '',
    wholesalePrice: '',
    mrp: '',
    dealerPrice: '',
    distributorPrice: '',
    minSellingPrice: '',
    batchApplicable: false,
    expiryApplicable: false,
    isActive: true,
    stockQty: '0',
    minStock: '0',
    maxStock: '0',
    imageUrl: '',
    imagePublicId: '',
  }
}

function createEmptyPurchaseForm(currency = 'BDT'): PurchaseFormState {
  return {
    productId: '',
    supplierId: SUPPLIER_NONE,
    quantity: '1',
    unitCost: '',
    currency,
  }
}

function parseAmount(value: string) {
  const normalized = value.replaceAll(',', '').trim()
  return normalized ? Number(normalized) : 0
}

function productToForm(product: {
  name: string
  banglaName?: string
  englishName?: string
  sku: string
  category: string
  subCategory?: string
  brand?: string
  productType?: string
  serialNumber?: string
  warrantyMonths?: number
  unit?: string
  purchaseUnit?: string
  salesUnit?: string
  conversionRatio?: number
  packSize?: string
  weight?: number
  supplierId: string
  purchasePrice: number
  sellingPrice: number
  wholesalePrice?: number
  mrp?: number
  dealerPrice?: number
  distributorPrice?: number
  minSellingPrice?: number
  batchApplicable?: boolean
  expiryApplicable?: boolean
  isActive?: boolean
  stockQty: number
  minStock: number
  maxStock: number
  imageUrl?: string
  imagePublicId?: string
}): ProductFormState {
  return {
    name: product.name,
    banglaName: product.banglaName ?? '',
    englishName: product.englishName ?? '',
    sku: product.sku,
    category: product.category,
    subCategory: product.subCategory ?? '',
    brand: product.brand ?? '',
    productType: product.productType ?? '',
    serialNumber: product.serialNumber ?? '',
    warrantyMonths: String(product.warrantyMonths ?? 0),
    unit: product.unit ?? '',
    purchaseUnit: product.purchaseUnit ?? '',
    salesUnit: product.salesUnit ?? '',
    conversionRatio: String(product.conversionRatio ?? 1),
    packSize: product.packSize ?? '',
    weight: product.weight ? String(product.weight) : '',
    supplierId: product.supplierId || SUPPLIER_NONE,
    purchasePrice: String(product.purchasePrice),
    sellingPrice: String(product.sellingPrice),
    wholesalePrice: product.wholesalePrice ? String(product.wholesalePrice) : '',
    mrp: product.mrp ? String(product.mrp) : '',
    dealerPrice: product.dealerPrice ? String(product.dealerPrice) : '',
    distributorPrice: product.distributorPrice ? String(product.distributorPrice) : '',
    minSellingPrice: product.minSellingPrice ? String(product.minSellingPrice) : '',
    batchApplicable: product.batchApplicable ?? false,
    expiryApplicable: product.expiryApplicable ?? false,
    isActive: product.isActive ?? true,
    stockQty: String(product.stockQty),
    minStock: String(product.minStock),
    maxStock: String(product.maxStock),
    imageUrl: product.imageUrl || '',
    imagePublicId: product.imagePublicId || '',
  }
}

function statusBadgeClass(status: ReturnType<typeof getProductStatus>) {
  if (status === 'active') {
    return 'border-emerald-200 bg-emerald-500/10 text-emerald-700'
  }

  if (status === 'low-stock') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700'
  }

  return 'border-rose-200 bg-rose-500/10 text-rose-700'
}

function statusLabel(status: ReturnType<typeof getProductStatus>) {
  return status.replace('-', ' ')
}
async function uploadProductImage(file: File): Promise<ProductImageUploadResult> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  const folder = process.env.NEXT_PUBLIC_CLOUDINARY_FOLDER || 'inventory'

  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary upload configuration is missing.')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', uploadPreset)
  formData.append('folder', folder)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error('Unable to upload product image.')
  }

  const result = (await response.json()) as { secure_url?: string; public_id?: string }
  if (!result.secure_url || !result.public_id) {
    throw new Error('Cloudinary did not return a valid image response.')
  }

  return {
    imageUrl: result.secure_url,
    imagePublicId: result.public_id,
  }
}

async function deleteCloudinaryImage(publicId: string) {
  const response = await fetch('/api/cloudinary/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ publicId }),
  })

  if (!response.ok) {
    throw new Error('Unable to delete product image.')
  }
}

export function StockOverviewScreen() {
  const {
    data,
    hasPermission,
    saveProduct,
    deleteProduct,
    recordPurchase,
    loading,
  } = useERP()

  const products = useMemo(
    () => [...toArray(data?.products)].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [data?.products]
  )
  const purchases = useMemo(
    () => [...toArray(data?.purchases)].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.purchases]
  )
  const suppliers = useMemo(() => toArray(data?.suppliers), [data?.suppliers])
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set([...RECIPE_STARTER_CATEGORIES, ...products.map((product) => product.category).filter(Boolean)])
      ).sort(),
    [products]
  )

  const [search, setSearch] = useState('')
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('all')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [productForm, setProductForm] = useState<ProductFormState>(() => createEmptyProductForm())
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(() => createEmptyPurchaseForm())
  const [addProductOpen, setAddProductOpen] = useState(false)
  const [receivePurchaseOpen, setReceivePurchaseOpen] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [isSavingProduct, setIsSavingProduct] = useState(false)
  const [isReceivingPurchase, setIsReceivingPurchase] = useState(false)
  const [quickCreateSupplierOpen, setQuickCreateSupplierOpen] = useState(false)
  const [quickCreatePurchaseSupplierOpen, setQuickCreatePurchaseSupplierOpen] = useState(false)
  const [quickCreatePurchaseProductOpen, setQuickCreatePurchaseProductOpen] = useState(false)
  const [pendingSearchText, setPendingSearchText] = useState('')
  const [starterCatalogOpen, setStarterCatalogOpen] = useState(false)
  const [starterSelectedSkus, setStarterSelectedSkus] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(RECIPE_STARTER_CATALOG.map((entry) => [entry.sku, true]))
  )
  const [isCreatingStarterCatalog, setIsCreatingStarterCatalog] = useState(false)

  const supplierOptions: ComboboxOption[] = useMemo(
    () => [
      { value: SUPPLIER_NONE, label: 'Not assigned' },
      ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, sublabel: supplier.phone })),
    ],
    [suppliers]
  )

  const purchaseProductOptions: ComboboxOption[] = useMemo(
    () => products.map((product) => ({ value: product.id, label: product.name, sublabel: `stock ${product.stockQty}` })),
    [products]
  )
  const [busyProductId, setBusyProductId] = useState<string | null>(null)
  const [activeInventoryView, setActiveInventoryView] = useState<InventoryView>('products')
  const [productImageFile, setProductImageFile] = useState<File | null>(null)
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null)
  const [pendingImageDeleteId, setPendingImageDeleteId] = useState<string | null>(null)

  const deferredSearch = useDeferredValue(search)
  const canCreateInventory = hasPermission('products:create')
  const canEditInventory = hasPermission('products:edit')
  const canDeleteInventory = hasPermission('products:delete')
  const currency = data?.settings.currency ?? 'BDT'

  const filteredProducts = useMemo(() => {
    let result = products

    if (selectedSupplierFilter !== 'all') {
      result = result.filter((product) => {
        const prodSupplierId = product.supplierId || SUPPLIER_NONE
        return prodSupplierId === selectedSupplierFilter
      })
    }

    const query = deferredSearch.trim().toLowerCase()
    if (query) {
      result = result.filter((product) => {
        const supplierName = data?.suppliers[product.supplierId]?.name ?? ''
        return [product.name, product.sku, product.category, supplierName].join(' ').toLowerCase().includes(query)
      })
    }

    return result
  }, [data?.suppliers, deferredSearch, products, selectedSupplierFilter])

  const productExportHeaders = ['Product', 'SKU', 'Stock', 'Cost', 'Sell Price', 'Supplier']
  const productExportRows = useMemo(
    () =>
      filteredProducts.map((product) => [
        product.name,
        product.sku,
        product.stockQty,
        product.purchasePrice,
        product.sellingPrice,
        data?.suppliers[product.supplierId]?.name ?? '',
      ]),
    [data?.suppliers, filteredProducts]
  )

  const lowStockProducts = useMemo(() => products.filter((product) => product.stockQty <= product.minStock), [products])
  const totalInventoryValue = useMemo(() => products.reduce((sum, product) => sum + product.purchasePrice * product.stockQty, 0), [products])
  const totalUnits = useMemo(() => products.reduce((sum, product) => sum + product.stockQty, 0), [products])
  // Section 57 — Inventory Dashboard.
  const inventoryDashboard = useMemo(() => buildInventoryDashboard(data), [data])
  const selectedPurchaseProduct = useMemo(() => products.find((product) => product.id === purchaseForm.productId) ?? null, [products, purchaseForm.productId])
  const purchaseTotal = parseAmount(purchaseForm.unitCost) * parseAmount(purchaseForm.quantity)

  function resetProductEditor() {
    setEditingProductId(null)
    setProductForm(createEmptyProductForm())
    setProductImageFile(null)
    setProductImagePreview(null)
    setPendingImageDeleteId(null)
  }

  function resetPurchaseEditor() {
    setPurchaseForm(createEmptyPurchaseForm(currency))
  }

  function openCreateProductDialog() {
    resetProductEditor()
    setFeedback(null)
    setAddProductOpen(true)
  }

  const existingSkuSet = useMemo(() => new Set(products.map((product) => product.sku.toUpperCase())), [products])

  function openStarterCatalogDialog() {
    setStarterSelectedSkus(Object.fromEntries(RECIPE_STARTER_CATALOG.map((entry) => [entry.sku, true])))
    setFeedback(null)
    setStarterCatalogOpen(true)
  }

  async function handleCreateStarterCatalog() {
    const itemsToCreate = RECIPE_STARTER_CATALOG.filter(
      (entry) => starterSelectedSkus[entry.sku] && !existingSkuSet.has(entry.sku.toUpperCase())
    )

    if (!itemsToCreate.length) {
      setFeedback('Nothing to create — selected products already exist.')
      return
    }

    setIsCreatingStarterCatalog(true)
    setFeedback(null)

    let created = 0
    try {
      for (const entry of itemsToCreate) {
        await saveProduct({
          name: entry.name,
          englishName: entry.name,
          sku: entry.sku,
          category: entry.category,
          subCategory: entry.subCategory,
          productType: entry.productType,
          unit: entry.unit,
          purchaseUnit: entry.unit,
          salesUnit: entry.unit,
          conversionRatio: 1,
          packSize: entry.packSize,
          purchasePrice: 0,
          sellingPrice: 0,
          wholesalePrice: 0,
          batchApplicable: true,
          expiryApplicable: true,
          isActive: true,
          stockQty: 0,
          minStock: 0,
        })
        created += 1
      }

      setFeedback(`Created ${created} product${created === 1 ? '' : 's'} from the starter catalog. Set pricing and opening stock from the Inventory list.`)
      setStarterCatalogOpen(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? `${reason.message} (${created} created before this error.)` : 'Unable to create the starter catalog.')
    } finally {
      setIsCreatingStarterCatalog(false)
    }
  }

  function openEditProductDialog(productId: string) {
    const product = data?.products[productId]
    if (!product) {
      return
    }

    setEditingProductId(productId)
    setProductForm(productToForm(product))
    setProductImageFile(null)
    setProductImagePreview(product.imageUrl ?? null)
    setPendingImageDeleteId(null)
    setFeedback(null)
    setAddProductOpen(true)
  }

  function openReceivePurchaseDialog() {
    resetPurchaseEditor()
    setFeedback(null)
    setReceivePurchaseOpen(true)
  }

  function handleProductImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      return
    }

    setProductImageFile(file)
    setProductImagePreview(URL.createObjectURL(file))
    setProductForm((current) => ({
      ...current,
      imageUrl: '',
      imagePublicId: '',
    }))

    if (editingProductId && data?.products[editingProductId]?.imagePublicId) {
      setPendingImageDeleteId(data.products[editingProductId].imagePublicId ?? null)
    }
  }

  function handleRemoveProductImage() {
    setProductImageFile(null)
    setProductImagePreview(null)

    if (productForm.imagePublicId) {
      setPendingImageDeleteId(productForm.imagePublicId)
    }

    setProductForm((current) => ({
      ...current,
      imageUrl: '',
      imagePublicId: '',
    }))
  }
  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setIsSavingProduct(true)

    try {
      let nextImageUrl = productForm.imageUrl
      let nextImagePublicId = productForm.imagePublicId

      if (productImageFile) {
        const uploadResult = await uploadProductImage(productImageFile)
        nextImageUrl = uploadResult.imageUrl
        nextImagePublicId = uploadResult.imagePublicId
      }

      await saveProduct(
        {
          name: productForm.name,
          banglaName: productForm.banglaName,
          englishName: productForm.englishName,
          sku: productForm.sku,
          category: productForm.category,
          subCategory: productForm.subCategory,
          brand: productForm.brand,
          productType: productForm.productType,
          serialNumber: productForm.serialNumber,
          warrantyMonths: parseAmount(productForm.warrantyMonths),
          unit: productForm.unit,
          purchaseUnit: productForm.purchaseUnit || productForm.unit,
          salesUnit: productForm.salesUnit || productForm.unit,
          conversionRatio: parseAmount(productForm.conversionRatio) || 1,
          packSize: productForm.packSize,
          weight: parseAmount(productForm.weight),
          supplierId: productForm.supplierId === SUPPLIER_NONE ? '' : productForm.supplierId,
          purchasePrice: parseAmount(productForm.purchasePrice),
          sellingPrice: parseAmount(productForm.sellingPrice),
          wholesalePrice: parseAmount(productForm.wholesalePrice) || parseAmount(productForm.sellingPrice),
          mrp: parseAmount(productForm.mrp),
          dealerPrice: parseAmount(productForm.dealerPrice),
          distributorPrice: parseAmount(productForm.distributorPrice),
          minSellingPrice: parseAmount(productForm.minSellingPrice),
          batchApplicable: productForm.batchApplicable,
          expiryApplicable: productForm.expiryApplicable,
          isActive: productForm.isActive,
          stockQty: parseAmount(productForm.stockQty),
          minStock: parseAmount(productForm.minStock),
          maxStock: parseAmount(productForm.maxStock),
          imageUrl: nextImageUrl,
          imagePublicId: nextImagePublicId,
        },
        editingProductId ?? undefined
      )

      if (pendingImageDeleteId && pendingImageDeleteId !== nextImagePublicId) {
        await deleteCloudinaryImage(pendingImageDeleteId)
      }

      setFeedback(editingProductId ? 'Product updated successfully.' : 'Product added to inventory successfully.')
      setAddProductOpen(false)
      resetProductEditor()
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save product.')
    } finally {
      setIsSavingProduct(false)
    }
  }

  async function handleDeleteProduct(productId: string) {
    const product = data?.products[productId]
    if (!product) {
      return
    }

    if (!window.confirm(`Delete ${product.name} from inventory?`)) {
      return
    }

    setFeedback(null)
    setBusyProductId(productId)

    try {
      if (product.imagePublicId) {
        await deleteCloudinaryImage(product.imagePublicId)
      }

      await deleteProduct(productId)
      setFeedback(`${product.name} was deleted from inventory.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete product.')
    } finally {
      setBusyProductId(null)
    }
  }

  async function handleReceivePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setIsReceivingPurchase(true)

    try {
      if (!purchaseForm.productId) {
        throw new Error('Select a product before receiving stock.')
      }

      if (purchaseForm.supplierId === SUPPLIER_NONE) {
        throw new Error('Select a supplier for this purchase.')
      }

      await recordPurchase({
        productId: purchaseForm.productId,
        supplierId: purchaseForm.supplierId,
        quantity: parseAmount(purchaseForm.quantity),
        unitCost: parseAmount(purchaseForm.unitCost),
        currency: purchaseForm.currency,
      })

      setFeedback('Purchase received and inventory updated successfully.')
      setReceivePurchaseOpen(false)
      resetPurchaseEditor()
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to receive purchase.')
    } finally {
      setIsReceivingPurchase(false)
    }
  }

  return (
    <AdminShell active="Inventory / Stock">
      <div className="space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardContent className="flex flex-col gap-6 p-6">
            <div className="flex flex-wrap gap-3 xl:justify-end">
                <Button className="rounded-xl" onClick={openCreateProductDialog} disabled={!canCreateInventory}>
                  Add product
                </Button>
                <Button variant="secondary" className="rounded-xl" onClick={openReceivePurchaseDialog} disabled={!canCreateInventory || products.length === 0}>
                  Receive purchase
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={openStarterCatalogDialog} disabled={!canCreateInventory}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Load starter catalog
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              {[
                { label: 'Products', value: String(products.length) },
                { label: 'Units in stock', value: String(totalUnits) },
                { label: 'Inventory value', value: formatCurrency(totalInventoryValue, currency) },
                { label: 'Low stock', value: String(lowStockProducts.length) },
                { label: 'Suppliers', value: String(suppliers.length) },
              ].map((stat) => (
                <div key={stat.label} className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card px-4 py-4">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className={`mt-1 truncate font-semibold tracking-tight ${statValueFontSizeClass(stat.value)}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        {/* Section 57: Inventory Dashboard */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Inventory dashboard</CardTitle>
            <CardDescription>Stock value, expiry exposure, and a product / batch breakdown.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">
              {[
                { label: 'Total stock value', value: formatCurrency(inventoryDashboard.totalStockValue, currency), icon: Boxes },
                { label: 'Raw material', value: formatCurrency(inventoryDashboard.rawMaterialValue, currency), icon: Boxes },
                { label: 'Finished goods', value: formatCurrency(inventoryDashboard.finishedGoodsValue, currency), icon: Boxes },
                { label: 'Damaged', value: formatCurrency(inventoryDashboard.damagedValue, currency), icon: AlertTriangle },
                { label: 'Low stock', value: String(inventoryDashboard.lowStockCount), icon: AlertTriangle },
                { label: 'Out of stock', value: String(inventoryDashboard.outOfStockCount), icon: PackageX },
                { label: 'Near expiry', value: String(inventoryDashboard.nearExpiryBatches.length), icon: AlertTriangle },
                { label: 'Expired', value: String(inventoryDashboard.expiredBatches.length), icon: PackageX },
              ].map((stat) => {
                const Icon = stat.icon
                return (
                  <div key={stat.label} className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card px-4 py-4">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{stat.label}</span></div>
                    <p className={`mt-1 truncate font-semibold tracking-tight ${statValueFontSizeClass(stat.value)}`}>{stat.value}</p>
                  </div>
                )
              })}
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Product-wise stock</p>
                <div className="max-h-72 overflow-auto rounded-xl border border-border/70">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted"><tr><th className="p-2.5 text-left">Product</th><th className="p-2.5 text-right">Qty</th><th className="p-2.5 text-right">Value</th></tr></thead>
                    <tbody>
                      {inventoryDashboard.productWiseStock.slice(0, 100).map((product) => (
                        <tr key={product.id} className="border-t border-border/70">
                          <td className="p-2.5">{product.name}<span className="block text-xs text-muted-foreground">{product.sku}</span></td>
                          <td className="p-2.5 text-right">{product.stockQty}</td>
                          <td className="p-2.5 text-right">{formatCurrency(product.purchasePrice * product.stockQty, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!inventoryDashboard.productWiseStock.length ? <p className="p-6 text-center text-sm text-muted-foreground">No products yet.</p> : null}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Batch-wise stock</p>
                <div className="max-h-72 overflow-auto rounded-xl border border-border/70">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted"><tr><th className="p-2.5 text-left">Batch</th><th className="p-2.5 text-right">Qty</th><th className="p-2.5 text-right">Expiry</th></tr></thead>
                    <tbody>
                      {inventoryDashboard.batchWiseStock.slice(0, 100).map((batch) => (
                        <tr key={batch.id} className="border-t border-border/70">
                          <td className="p-2.5">{batch.productName}<span className="block text-xs text-muted-foreground">{batch.batchNumber}</span></td>
                          <td className="p-2.5 text-right">{batch.quantity}</td>
                          <td className="p-2.5 text-right">{batch.expiryDate ? formatDate(batch.expiryDate) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!inventoryDashboard.batchWiseStock.length ? <p className="p-6 text-center text-sm text-muted-foreground">No batches recorded yet.</p> : null}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>
                  {activeInventoryView === 'products' ? 'Inventory list' : activeInventoryView === 'low-stock' ? 'Low stock focus' : 'Recent purchases'}
                </CardTitle>
                <CardDescription>
                  {activeInventoryView === 'products'
                    ? 'Search by product, model, category, or supplier. Edit and delete actions are available in each row.'
                    : activeInventoryView === 'low-stock'
                      ? 'Products that need replenishment soon.'
                      : 'Latest stock receipts recorded in the system.'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant={activeInventoryView === 'products' ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setActiveInventoryView('products')}>Products</Button>
                <Button variant={activeInventoryView === 'low-stock' ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setActiveInventoryView('low-stock')}>Low stock focus</Button>
                <Button variant={activeInventoryView === 'purchases' ? 'default' : 'outline'} size="sm" className="rounded-lg" onClick={() => setActiveInventoryView('purchases')}>Recent purchases</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              {activeInventoryView === 'products' ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center w-full lg:max-w-3xl">
                  <div className="relative w-full sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search inventory..." />
                  </div>
                  <div className="w-full sm:w-48">
                    <Select value={selectedSupplierFilter} onValueChange={setSelectedSupplierFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Suppliers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Suppliers</SelectItem>
                        <SelectItem value={SUPPLIER_NONE}>Not assigned</SelectItem>
                        {suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : <div />}

              {activeInventoryView === 'products' ? (
                <ExportMenu filenameBase="products" title="Products" headers={productExportHeaders} rows={productExportRows} />
              ) : null}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/70">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    {activeInventoryView === 'products' ? (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Product</TableHead>
                        <TableHead>Model / SKU</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Sell price</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    ) : activeInventoryView === 'low-stock' ? (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Product</TableHead>
                        <TableHead>Available</TableHead>
                        <TableHead>Minimum</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Updated</TableHead>
                      </TableRow>
                    ) : (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Product</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit cost</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Received</TableHead>
                      </TableRow>
                    )}
                  </TableHeader>
                  <TableBody>
                    {activeInventoryView === 'products' ? filteredProducts.map((product) => {
                      const supplier = data?.suppliers[product.supplierId]
                      const status = getProductStatus(product.stockQty, product.minStock)

                      return (
                        <TableRow key={product.id}>
                          <TableCell><div className="flex items-center gap-3">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-14 w-14 rounded-xl border border-border/70 object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/30 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">No image</div>}<div><p className="font-semibold text-foreground">{product.name}</p><p className="text-sm text-muted-foreground">{product.category || 'General equipment'}{product.subCategory ? ` · ${product.subCategory}` : ''}</p><div className="mt-1 flex flex-wrap gap-1">{product.batchApplicable ? <Badge variant="outline" className="border-sky-200 bg-sky-500/10 text-[10px] text-sky-700">Batch</Badge> : null}{product.expiryApplicable ? <Badge variant="outline" className="border-violet-200 bg-violet-500/10 text-[10px] text-violet-700">Expiry</Badge> : null}{product.isActive === false ? <Badge variant="outline" className="border-rose-200 bg-rose-500/10 text-[10px] text-rose-700">Inactive</Badge> : null}</div></div></div></TableCell>
                          <TableCell className="font-medium"><p>{product.sku}</p>{product.serialNumber ? <p className="text-xs font-normal text-muted-foreground">SN: {product.serialNumber}</p> : null}{product.warrantyMonths ? <p className="text-xs font-normal text-muted-foreground">{product.warrantyMonths}mo warranty</p> : null}</TableCell>
                          <TableCell><div className="flex flex-col gap-2"><span className="font-medium">{product.stockQty} {product.unit || 'units'}</span><Badge variant="outline" className={statusBadgeClass(status)}>{statusLabel(status)}</Badge></div></TableCell>
                          <TableCell>{formatCurrency(product.purchasePrice, currency)}</TableCell>
                          <TableCell>{formatCurrency(product.sellingPrice, currency)}</TableCell>
                          <TableCell>{supplier?.name ?? 'Not assigned'}</TableCell>
                          <TableCell>{formatDateTime(product.updatedAt)}</TableCell>
                          <TableCell>{canEditInventory || canDeleteInventory ? <div className="flex justify-end gap-2">{canEditInventory ? <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openEditProductDialog(product.id)}><PencilLine className="mr-2 h-4 w-4" />Edit</Button> : null}{canDeleteInventory ? <Button variant="outline" size="sm" className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => void handleDeleteProduct(product.id)} disabled={busyProductId === product.id}><Trash2 className="mr-2 h-4 w-4" />Delete</Button> : null}</div> : <span className="text-sm text-muted-foreground">View only</span>}</TableCell>
                        </TableRow>
                      )
                    }) : activeInventoryView === 'low-stock' ? lowStockProducts.map((product) => {
                      const status = getProductStatus(product.stockQty, product.minStock)

                      return (
                        <TableRow key={product.id}>
                          <TableCell><div><p className="font-semibold text-foreground">{product.name}</p><p className="text-sm text-muted-foreground">{product.sku}</p></div></TableCell>
                          <TableCell>{product.stockQty}</TableCell>
                          <TableCell>{product.minStock}</TableCell>
                          <TableCell><Badge variant="outline" className={statusBadgeClass(status)}>{statusLabel(status)}</Badge></TableCell>
                          <TableCell>{formatDateTime(product.updatedAt)}</TableCell>
                        </TableRow>
                      )
                    }) : purchases.slice(0, 10).map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell className="font-semibold">{purchase.productName}</TableCell>
                        <TableCell>{purchase.supplierName}</TableCell>
                        <TableCell>{purchase.quantity}</TableCell>
                        <TableCell>{formatCurrency(purchase.unitCost, purchase.currency)}</TableCell>
                        <TableCell>{formatCurrency(purchase.total, purchase.currency)}</TableCell>
                        <TableCell>{formatDateTime(purchase.createdAt)}</TableCell>
                      </TableRow>
                    ))}

                    {activeInventoryView === 'products' && !filteredProducts.length ? <TableRow><TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">No products matched your search.</TableCell></TableRow> : null}
                    {activeInventoryView === 'low-stock' && !lowStockProducts.length ? <TableRow><TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">No low-stock products right now.</TableCell></TableRow> : null}
                    {activeInventoryView === 'purchases' && !purchases.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No purchase receipts yet.</TableCell></TableRow> : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingProductId ? 'Edit product' : 'Add product'}</DialogTitle>
              <DialogDescription>Use the essential fields only. This form is optimized for workshop and lift inventory records.</DialogDescription>
            </DialogHeader>
            {(editingProductId ? canEditInventory : canCreateInventory) ? (
              <form className="space-y-6" onSubmit={handleSaveProduct}>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Identity</p>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Product name</p><Input placeholder="Mustard Oil 200ml" value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} required /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Product code / SKU</p><Input placeholder="RFP-MO-200" value={productForm.sku} onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))} required /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">বাংলা নাম <span className="font-normal text-muted-foreground">(optional)</span></p><Input placeholder="সরিষার তেল ২০০ মিলি" value={productForm.banglaName} onChange={(event) => setProductForm((current) => ({ ...current, banglaName: event.target.value }))} /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">English name <span className="font-normal text-muted-foreground">(optional)</span></p><Input placeholder="Mustard Oil 200ml" value={productForm.englishName} onChange={(event) => setProductForm((current) => ({ ...current, englishName: event.target.value }))} /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Category</p><Input list="product-category-options" placeholder="Edible Oil" value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} /><datalist id="product-category-options">{categoryOptions.map((category) => (<option key={category} value={category} />))}</datalist></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Sub-category <span className="font-normal text-muted-foreground">(optional)</span></p><Input placeholder="Mustard Oil" value={productForm.subCategory} onChange={(event) => setProductForm((current) => ({ ...current, subCategory: event.target.value }))} /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Brand <span className="font-normal text-muted-foreground">(optional)</span></p><Input placeholder="Recipe" value={productForm.brand} onChange={(event) => setProductForm((current) => ({ ...current, brand: event.target.value }))} /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Product type <span className="font-normal text-muted-foreground">(optional)</span></p><Input list="product-type-options" placeholder="Finished Goods" value={productForm.productType} onChange={(event) => setProductForm((current) => ({ ...current, productType: event.target.value }))} /><datalist id="product-type-options">{productTypeOptions.map((type) => (<option key={type} value={type} />))}</datalist></div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Units &amp; Packaging</p>
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Unit</p><Input list="product-unit-options" placeholder="Pcs / Kg / Litre" value={productForm.unit} onChange={(event) => setProductForm((current) => ({ ...current, unit: event.target.value }))} /><datalist id="product-unit-options">{unitOptions.map((unit) => (<option key={unit} value={unit} />))}</datalist></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Purchase unit <span className="font-normal text-muted-foreground">(optional)</span></p><Input list="product-unit-options" placeholder="Defaults to unit" value={productForm.purchaseUnit} onChange={(event) => setProductForm((current) => ({ ...current, purchaseUnit: event.target.value }))} /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Sales unit <span className="font-normal text-muted-foreground">(optional)</span></p><Input list="product-unit-options" placeholder="Defaults to unit" value={productForm.salesUnit} onChange={(event) => setProductForm((current) => ({ ...current, salesUnit: event.target.value }))} /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Conversion ratio <span className="font-normal text-muted-foreground">(purchase → sales)</span></p><Input type="number" min="0" step="0.01" placeholder="1" value={productForm.conversionRatio} onChange={(event) => setProductForm((current) => ({ ...current, conversionRatio: event.target.value }))} /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Pack size <span className="font-normal text-muted-foreground">(optional)</span></p><Input placeholder="200 ml" value={productForm.packSize} onChange={(event) => setProductForm((current) => ({ ...current, packSize: event.target.value }))} /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Weight <span className="font-normal text-muted-foreground">(kg, optional)</span></p><Input type="number" min="0" step="0.01" placeholder="0.2" value={productForm.weight} onChange={(event) => setProductForm((current) => ({ ...current, weight: event.target.value }))} /></div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Pricing ({currency})</p>
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Cost price</p><Input inputMode="numeric" placeholder="120" value={productForm.purchasePrice} onChange={(event) => setProductForm((current) => ({ ...current, purchasePrice: event.target.value }))} required /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">MRP <span className="font-normal text-muted-foreground">(optional)</span></p><Input inputMode="numeric" placeholder="180" value={productForm.mrp} onChange={(event) => setProductForm((current) => ({ ...current, mrp: event.target.value }))} /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Retail (selling) price</p><Input inputMode="numeric" placeholder="170" value={productForm.sellingPrice} onChange={(event) => setProductForm((current) => ({ ...current, sellingPrice: event.target.value }))} required /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Wholesale price <span className="font-normal text-muted-foreground">(optional)</span></p><Input inputMode="numeric" placeholder="Defaults to selling price" value={productForm.wholesalePrice} onChange={(event) => setProductForm((current) => ({ ...current, wholesalePrice: event.target.value }))} /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Dealer price <span className="font-normal text-muted-foreground">(optional)</span></p><Input inputMode="numeric" placeholder="150" value={productForm.dealerPrice} onChange={(event) => setProductForm((current) => ({ ...current, dealerPrice: event.target.value }))} /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Distributor price <span className="font-normal text-muted-foreground">(optional)</span></p><Input inputMode="numeric" placeholder="140" value={productForm.distributorPrice} onChange={(event) => setProductForm((current) => ({ ...current, distributorPrice: event.target.value }))} /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Minimum selling price <span className="font-normal text-muted-foreground">(optional)</span></p><Input inputMode="numeric" placeholder="130" value={productForm.minSellingPrice} onChange={(event) => setProductForm((current) => ({ ...current, minSellingPrice: event.target.value }))} /></div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Stock &amp; Batch</p>
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Opening stock</p><Input type="number" min="0" value={productForm.stockQty} onChange={(event) => setProductForm((current) => ({ ...current, stockQty: event.target.value }))} required /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Reorder level</p><Input type="number" min="0" value={productForm.minStock} onChange={(event) => setProductForm((current) => ({ ...current, minStock: event.target.value }))} required /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Maximum stock <span className="font-normal text-muted-foreground">(optional)</span></p><Input type="number" min="0" placeholder="No cap" value={productForm.maxStock} onChange={(event) => setProductForm((current) => ({ ...current, maxStock: event.target.value }))} /></div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3"><p className="text-sm font-medium text-foreground">Batch applicable</p><Switch checked={productForm.batchApplicable} onCheckedChange={(checked) => setProductForm((current) => ({ ...current, batchApplicable: checked }))} /></div>
                    <div className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3"><p className="text-sm font-medium text-foreground">Expiry applicable</p><Switch checked={productForm.expiryApplicable} onCheckedChange={(checked) => setProductForm((current) => ({ ...current, expiryApplicable: checked }))} /></div>
                    <div className="flex items-center justify-between rounded-xl border border-border/70 px-4 py-3"><p className="text-sm font-medium text-foreground">Active</p><Switch checked={productForm.isActive} onCheckedChange={(checked) => setProductForm((current) => ({ ...current, isActive: checked }))} /></div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Supplier</p>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Supplier</p><Combobox options={supplierOptions} value={productForm.supplierId} onChange={(value) => setProductForm((current) => ({ ...current, supplierId: value }))} placeholder="Select supplier" searchPlaceholder="Search suppliers..." onCreateNew={(typedText) => { setPendingSearchText(typedText); setQuickCreateSupplierOpen(true) }} createNewLabel="Create supplier" /></div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Warranty <span className="font-normal normal-case text-muted-foreground/80">(only for warranted goods)</span></p>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Serial number <span className="font-normal text-muted-foreground">(optional)</span></p><Input placeholder="SN-000123" value={productForm.serialNumber} onChange={(event) => setProductForm((current) => ({ ...current, serialNumber: event.target.value }))} /></div>
                    <div className="space-y-2"><p className="text-sm font-medium text-foreground">Warranty (months) <span className="font-normal text-muted-foreground">(optional)</span></p><Input type="number" min="0" placeholder="0" value={productForm.warrantyMonths} onChange={(event) => setProductForm((current) => ({ ...current, warrantyMonths: event.target.value }))} /></div>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Product image</p>
                      <p className="text-xs text-muted-foreground">Upload one thumbnail for the product list and editor.</p>
                    </div>
                    {(productImagePreview || productForm.imageUrl) ? <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={handleRemoveProductImage}>Delete image</Button> : null}
                  </div>
                  {(productImagePreview || productForm.imageUrl) ? <img src={productImagePreview ?? productForm.imageUrl} alt={productForm.name || 'Product preview'} className="h-32 w-32 rounded-2xl border border-border/70 object-cover" /> : <div className="flex h-32 w-32 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/30 text-xs uppercase tracking-[0.2em] text-muted-foreground">No image</div>}
                  <Input type="file" accept="image/*" onChange={handleProductImageChange} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddProductOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isSavingProduct}>{isSavingProduct ? 'Saving...' : editingProductId ? 'Update product' : 'Save product'}</Button>
                </DialogFooter>
              </form>
            ) : <p className="text-sm text-muted-foreground">Your current role can view stock but cannot create or edit products.</p>}
          </DialogContent>
        </Dialog>

        <Dialog open={receivePurchaseOpen} onOpenChange={setReceivePurchaseOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Receive purchase</DialogTitle>
              <DialogDescription>Select a product, confirm the supplier, and post the incoming quantity to stock.</DialogDescription>
            </DialogHeader>
            {canCreateInventory ? (
              <form className="space-y-5" onSubmit={handleReceivePurchase}>
                <div className="space-y-2"><p className="text-sm font-medium text-foreground">Product</p><Combobox options={purchaseProductOptions} value={purchaseForm.productId} onChange={(value) => { const product = data?.products[value]; setPurchaseForm((current) => ({ ...current, productId: value, supplierId: product?.supplierId || SUPPLIER_NONE, unitCost: product ? String(product.purchasePrice) : current.unitCost })) }} placeholder="Select product" searchPlaceholder="Search products..." onCreateNew={(typedText) => { setPendingSearchText(typedText); setQuickCreatePurchaseProductOpen(true) }} createNewLabel="Create product" /></div>
                {selectedPurchaseProduct ? <div className="rounded-2xl border border-border/70 bg-muted/30 p-4"><div className="grid gap-3 sm:grid-cols-2"><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Current stock</p><p className="mt-1 text-lg font-semibold">{selectedPurchaseProduct.stockQty} units</p></div><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Last cost</p><p className="mt-1 text-lg font-semibold">{formatCurrency(selectedPurchaseProduct.purchasePrice, currency)}</p></div></div></div> : null}
                <div className="space-y-2"><p className="text-sm font-medium text-foreground">Supplier</p><Combobox options={supplierOptions} value={purchaseForm.supplierId} onChange={(value) => setPurchaseForm((current) => ({ ...current, supplierId: value }))} placeholder="Select supplier" searchPlaceholder="Search suppliers..." onCreateNew={(typedText) => { setPendingSearchText(typedText); setQuickCreatePurchaseSupplierOpen(true) }} createNewLabel="Create supplier" /></div>
                <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><p className="text-sm font-medium text-foreground">Quantity received</p><Input type="number" min="1" value={purchaseForm.quantity} onChange={(event) => setPurchaseForm((current) => ({ ...current, quantity: event.target.value }))} required /></div><div className="space-y-2"><p className="text-sm font-medium text-foreground">Unit cost</p><Input inputMode="numeric" placeholder="330000" value={purchaseForm.unitCost} onChange={(event) => setPurchaseForm((current) => ({ ...current, unitCost: event.target.value }))} required /></div></div>
                <div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><p className="text-sm font-medium text-foreground">Currency</p><Select value={purchaseForm.currency} onValueChange={(value) => setPurchaseForm((current) => ({ ...current, currency: value }))}><SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger><SelectContent>{currencyOptions.map((currencyOption) => (<SelectItem key={currencyOption} value={currencyOption}>{currencyOption}</SelectItem>))}</SelectContent></Select></div><div className="space-y-2 rounded-2xl border border-border/70 p-4"><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Purchase total</p><p className="mt-1 text-2xl font-semibold">{formatCurrency(purchaseTotal, purchaseForm.currency)}</p><p className="mt-1 text-sm text-muted-foreground">Stock after receive: {(selectedPurchaseProduct?.stockQty ?? 0) + parseAmount(purchaseForm.quantity)} units</p></div></div>
                <DialogFooter><Button type="button" variant="outline" onClick={() => setReceivePurchaseOpen(false)}>Cancel</Button><Button type="submit" variant="secondary" disabled={isReceivingPurchase}>{isReceivingPurchase ? 'Posting...' : 'Receive stock'}</Button></DialogFooter>
              </form>
            ) : <p className="text-sm text-muted-foreground">Your current role cannot record inbound purchases.</p>}
          </DialogContent>
        </Dialog>

        <Dialog open={starterCatalogOpen} onOpenChange={setStarterCatalogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Load Recipe Food starter catalog</DialogTitle>
              <DialogDescription>
                Creates the Category/SKU structure from the product spec (Mustard Oil, Tejpatta, Suji, Muri, Spice Products) with zero opening stock and zero price — update pricing and stock afterward from the Inventory list.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <div className="space-y-4">
                {RECIPE_STARTER_CATEGORIES.map((category) => (
                  <div key={category} className="space-y-2 rounded-2xl border border-border/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{category}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {RECIPE_STARTER_CATALOG.filter((entry) => entry.category === category).map((entry) => {
                        const alreadyExists = existingSkuSet.has(entry.sku.toUpperCase())
                        return (
                          <label
                            key={entry.sku}
                            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${alreadyExists ? 'border-border/50 text-muted-foreground' : 'border-border/70'}`}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(starterSelectedSkus[entry.sku]) && !alreadyExists}
                              disabled={alreadyExists}
                              onChange={(event) =>
                                setStarterSelectedSkus((current) => ({ ...current, [entry.sku]: event.target.checked }))
                              }
                            />
                            <span className="flex-1">
                              {entry.name}
                              <span className="ml-1 text-xs text-muted-foreground">({entry.sku})</span>
                            </span>
                            {alreadyExists ? <Badge variant="outline" className="text-[10px]">Added</Badge> : null}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStarterCatalogOpen(false)}>Cancel</Button>
              <Button type="button" onClick={() => void handleCreateStarterCatalog()} disabled={isCreatingStarterCatalog}>
                {isCreatingStarterCatalog ? 'Creating...' : 'Create selected products'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {loading ? <Card className="border-border/70 shadow-sm"><CardContent className="p-4 text-sm text-muted-foreground">Loading inventory...</CardContent></Card> : null}

        <StockControlSection />
      </div>

      <QuickCreateSupplierDialog
        open={quickCreateSupplierOpen}
        onOpenChange={setQuickCreateSupplierOpen}
        initialName={pendingSearchText}
        onCreated={(supplierId) => setProductForm((current) => ({ ...current, supplierId }))}
      />
      <QuickCreateSupplierDialog
        open={quickCreatePurchaseSupplierOpen}
        onOpenChange={setQuickCreatePurchaseSupplierOpen}
        initialName={pendingSearchText}
        onCreated={(supplierId) => setPurchaseForm((current) => ({ ...current, supplierId }))}
      />
      <QuickCreateProductDialog
        open={quickCreatePurchaseProductOpen}
        onOpenChange={setQuickCreatePurchaseProductOpen}
        initialName={pendingSearchText}
        onCreated={(productId) => {
          const product = data?.products[productId]
          setPurchaseForm((current) => ({
            ...current,
            productId,
            supplierId: product?.supplierId || SUPPLIER_NONE,
            unitCost: product ? String(product.purchasePrice) : current.unitCost,
          }))
        }}
      />
    </AdminShell>
  )
}

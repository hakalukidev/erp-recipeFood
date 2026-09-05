"use client"

import { useDeferredValue, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { PencilLine, Search, Sparkles, Trash2 } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { ExportMenu } from './ExportMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import { RECIPE_STARTER_CATALOG, RECIPE_STARTER_CATEGORIES } from '@/lib/erp/starterCatalog'
import { formatCurrency, toArray } from '@/lib/erp/utils'

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

function parseAmount(value: string) {
  const normalized = value.replaceAll(',', '').trim()
  return normalized ? Number(normalized) : 0
}

// The quick "Add product" form only asks for a name and size, but every
// product still needs a unique SKU internally (invoices, batches, and
// exports all key off it) — so one is derived from the name here instead
// of asking for it up front. Full details, including a custom SKU, can
// still be set later from Edit product.
function generateSku(name: string, existingSkus: Set<string>) {
  const base =
    name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20) || 'PRODUCT'

  let candidate = base
  let suffix = 1
  while (existingSkus.has(candidate)) {
    suffix += 1
    candidate = `${base}-${suffix}`
  }
  return candidate
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
    loading,
  } = useERP()

  const products = useMemo(
    () => [...toArray(data?.products)].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [data?.products]
  )
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set([...RECIPE_STARTER_CATEGORIES, ...products.map((product) => product.category).filter(Boolean)])
      ).sort(),
    [products]
  )

  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [productForm, setProductForm] = useState<ProductFormState>(() => createEmptyProductForm())
  const [addProductOpen, setAddProductOpen] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [isSavingProduct, setIsSavingProduct] = useState(false)
  const [starterCatalogOpen, setStarterCatalogOpen] = useState(false)
  const [starterSelectedSkus, setStarterSelectedSkus] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(RECIPE_STARTER_CATALOG.map((entry) => [entry.sku, true]))
  )
  const [isCreatingStarterCatalog, setIsCreatingStarterCatalog] = useState(false)
  const [busyProductId, setBusyProductId] = useState<string | null>(null)
  const [productImageFile, setProductImageFile] = useState<File | null>(null)
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null)
  const [pendingImageDeleteId, setPendingImageDeleteId] = useState<string | null>(null)

  const deferredSearch = useDeferredValue(search)
  const canCreateInventory = hasPermission('products:create')
  const canEditInventory = hasPermission('products:edit')
  const canDeleteInventory = hasPermission('products:delete')
  const currency = data?.settings.currency ?? 'BDT'

  const filteredProducts = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    if (!query) {
      return products
    }

    return products.filter((product) =>
      [product.name, product.sku, product.category].join(' ').toLowerCase().includes(query)
    )
  }, [deferredSearch, products])

  const productExportHeaders = ['Product', 'Price']
  const productExportRows = useMemo(
    () => filteredProducts.map((product) => [product.name, product.sellingPrice]),
    [filteredProducts]
  )

  function resetProductEditor() {
    setEditingProductId(null)
    setProductForm(createEmptyProductForm())
    setProductImageFile(null)
    setProductImagePreview(null)
    setPendingImageDeleteId(null)
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

      setFeedback(`Created ${created} product${created === 1 ? '' : 's'} from the starter catalog. Set pricing from the Product List.`)
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

      const sku = productForm.sku.trim() || generateSku(productForm.name, existingSkuSet)

      await saveProduct(
        {
          name: productForm.name,
          banglaName: productForm.banglaName,
          englishName: productForm.englishName,
          sku,
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

      setFeedback(editingProductId ? 'Product updated successfully.' : 'Product added to the list successfully.')
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

    if (!window.confirm(`Delete ${product.name} from the product list?`)) {
      return
    }

    setFeedback(null)
    setBusyProductId(productId)

    try {
      if (product.imagePublicId) {
        await deleteCloudinaryImage(product.imagePublicId)
      }

      await deleteProduct(productId)
      setFeedback(`${product.name} was deleted from the product list.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete product.')
    } finally {
      setBusyProductId(null)
    }
  }

  return (
    <AdminShell active="Product List">
      <div className="space-y-6">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>Product list</CardTitle>
                <CardDescription>Every product — name, image, and price.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button className="rounded-xl" onClick={openCreateProductDialog} disabled={!canCreateInventory}>
                  Add product
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={openStarterCatalogDialog} disabled={!canCreateInventory}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Load starter catalog
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search products..." />
              </div>
              <ExportMenu filenameBase="products" title="Products" headers={productExportHeaders} rows={productExportRows} />
            </div>

            {feedback ? <p className="rounded-xl bg-primary/5 p-3 text-sm text-primary">{feedback}</p> : null}

            {filteredProducts.length ? (
              <div className="overflow-hidden rounded-2xl border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-16">Image</TableHead>
                      <TableHead>Product name</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                      {canEditInventory || canDeleteInventory ? <TableHead className="text-right">Actions</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div className="h-12 w-12 overflow-hidden rounded-lg bg-muted/30">
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[8px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                                No image
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="max-w-[16rem] truncate text-sm font-semibold text-foreground" title={product.name}>{product.name}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-semibold text-foreground">{formatCurrency(product.sellingPrice, currency)}</p>
                        </TableCell>
                        <TableCell>
                          {product.isActive === false ? (
                            <Badge variant="outline" className="border-rose-200 bg-rose-500/10 text-[10px] text-rose-700">Inactive</Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-500/10 text-[10px] text-emerald-700">Active</Badge>
                          )}
                        </TableCell>
                        {canEditInventory || canDeleteInventory ? (
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {canEditInventory ? (
                                <Button variant="outline" size="sm" className="h-8 rounded-lg px-2" onClick={() => openEditProductDialog(product.id)}>
                                  <PencilLine className="h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                              {canDeleteInventory ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-lg border-rose-200 px-2 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                  onClick={() => void handleDeleteProduct(product.id)}
                                  disabled={busyProductId === product.id}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {products.length ? 'No products matched your search.' : 'No products yet — add one to get started.'}
              </p>
            )}
          </CardContent>
        </Card>

        {loading ? <Card className="border-border/70 shadow-sm"><CardContent className="p-4 text-sm text-muted-foreground">Loading products...</CardContent></Card> : null}

        <Dialog open={addProductOpen} onOpenChange={setAddProductOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingProductId ? 'Edit product' : 'Add product'}</DialogTitle>
              <DialogDescription>
                {editingProductId
                  ? 'Use the essential fields only. This form is optimized for workshop and lift inventory records.'
                  : 'Just the product name and size for now — a SKU is generated automatically. Add pricing, stock, and other details later from Edit product.'}
              </DialogDescription>
            </DialogHeader>
            {(editingProductId ? canEditInventory : canCreateInventory) ? (
              editingProductId ? (
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
                  <Button type="submit" disabled={isSavingProduct}>{isSavingProduct ? 'Saving...' : 'Update product'}</Button>
                </DialogFooter>
              </form>
              ) : (
              <form className="space-y-5" onSubmit={handleSaveProduct}>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Product name</p>
                  <Input
                    placeholder="Mustard Oil 200ml"
                    value={productForm.name}
                    onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))}
                    autoFocus
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Size <span className="font-normal text-muted-foreground">(optional)</span></p>
                  <Input
                    placeholder="200 ml"
                    value={productForm.packSize}
                    onChange={(event) => setProductForm((current) => ({ ...current, packSize: event.target.value }))}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddProductOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isSavingProduct}>{isSavingProduct ? 'Saving...' : 'Save product'}</Button>
                </DialogFooter>
              </form>
              )
            ) : <p className="text-sm text-muted-foreground">Your current role can view products but cannot create or edit them.</p>}
          </DialogContent>
        </Dialog>

        <Dialog open={starterCatalogOpen} onOpenChange={setStarterCatalogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Load Recipe Food starter catalog</DialogTitle>
              <DialogDescription>
                Creates the Category/SKU structure from the product spec (Mustard Oil, Tejpatta, Suji, Muri, Spice Products) with zero opening stock and zero price — update pricing afterward from the Product List.
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
      </div>
    </AdminShell>
  )
}

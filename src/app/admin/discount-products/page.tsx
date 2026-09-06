"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { BadgePercent, Edit, Plus, Search, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type { DiscountProductInput, DiscountProductRecord } from '@/lib/erp/types'
import { computeDiscountProductRates, formatCurrency, sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'

// Discount Product List — see DiscountProductRecord in types.ts for the field
// meanings and computeDiscountProductRates in utils.ts for how SR Rate/TP
// Rate are derived from Dealer Rate rather than stored.
type DiscountProductFormState = {
  name: string
  banglaName: string
  category: string
  perCtnBgs: string
  rawRate: string
  manufRate: string
  depotRate: string
  dealerRate: string
  srCommissionPercent: string
  tpPercent: string
  mrpRate: string
}

const emptyForm: DiscountProductFormState = {
  name: '',
  banglaName: '',
  category: '',
  perCtnBgs: '',
  rawRate: '0',
  manufRate: '0',
  depotRate: '0',
  dealerRate: '0',
  srCommissionPercent: '8',
  tpPercent: '0',
  mrpRate: '0',
}

function formFromProduct(product: DiscountProductRecord): DiscountProductFormState {
  return {
    name: product.name,
    banglaName: product.banglaName ?? '',
    category: product.category ?? '',
    perCtnBgs: product.perCtnBgs ?? '',
    rawRate: String(product.rawRate),
    manufRate: String(product.manufRate),
    depotRate: String(product.depotRate),
    dealerRate: String(product.dealerRate),
    srCommissionPercent: String(product.srCommissionPercent),
    tpPercent: String(product.tpPercent),
    mrpRate: String(product.mrpRate),
  }
}

function parseAmount(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function DiscountProductsPage() {
  const { data, saveDiscountProduct, deleteDiscountProduct } = useERP()
  const products = useMemo(
    () => sortByCreatedAtDesc(toArray(data?.discountProducts)),
    [data?.discountProducts]
  )
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<DiscountProductRecord | null>(null)
  const [form, setForm] = useState<DiscountProductFormState>(emptyForm)
  const [feedback, setFeedback] = useState<string | null>(null)

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return products

    return products.filter((product) =>
      [product.name, product.banglaName, product.category].join(' ').toLowerCase().includes(normalizedQuery)
    )
  }, [products, query])

  const exportHeaders = [
    'Description',
    'Per Ctn/Bgs',
    'Raw M',
    'Manu R',
    'Depot P R',
    'Depot S R',
    'SR Com %',
    'SR Rate',
    'TP %',
    'TP Rate',
    'MRP',
  ]
  const exportRows = useMemo(
    () =>
      filteredProducts.map((product) => {
        const { srRate, tpRate } = computeDiscountProductRates(
          product.dealerRate,
          product.srCommissionPercent,
          product.tpPercent
        )
        return [
          product.name,
          product.perCtnBgs ?? '',
          product.rawRate,
          product.manufRate,
          product.depotRate,
          product.dealerRate,
          product.srCommissionPercent,
          Number(srRate.toFixed(2)),
          product.tpPercent,
          Number(tpRate.toFixed(2)),
          product.mrpRate,
        ]
      }),
    [filteredProducts]
  )

  function openCreateDialog() {
    setEditingProduct(null)
    setForm(emptyForm)
    setFeedback(null)
    setDialogOpen(true)
  }

  function openEditDialog(product: DiscountProductRecord) {
    setEditingProduct(product)
    setForm(formFromProduct(product))
    setFeedback(null)
    setDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const input: DiscountProductInput = {
      name: form.name,
      banglaName: form.banglaName,
      category: form.category,
      perCtnBgs: form.perCtnBgs,
      rawRate: parseAmount(form.rawRate),
      manufRate: parseAmount(form.manufRate),
      depotRate: parseAmount(form.depotRate),
      dealerRate: parseAmount(form.dealerRate),
      srCommissionPercent: parseAmount(form.srCommissionPercent),
      tpPercent: parseAmount(form.tpPercent),
      mrpRate: parseAmount(form.mrpRate),
    }

    try {
      await saveDiscountProduct(input, editingProduct?.id)
      setDialogOpen(false)
      setForm(emptyForm)
      setEditingProduct(null)
      setFeedback(editingProduct ? 'Discount product updated.' : 'New discount product added.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save discount product.')
    }
  }

  async function handleDelete(product: DiscountProductRecord) {
    setFeedback(null)

    try {
      await deleteDiscountProduct(product.id)
      setFeedback(`${product.name} removed from the discount product list.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete discount product.')
    }
  }

  return (
    <AdminShell active="Discount Product List">
      <div className="space-y-6">
        <Card className="w-full max-w-xs border-border/70 shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Discount products</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{products.length.toLocaleString('en-BD')}</p>
            <p className="mt-1 text-xs text-muted-foreground">Flat-rate/commission price list on file</p>
          </CardContent>
        </Card>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Discount product list</CardTitle>
              <CardDescription>
                Products sold flat-rate/commission — Depot skipped. SR Rate and TP Rate are computed live from Dealer
                Rate, SR commission %, and TP %.
              </CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search by name or category"
                />
              </div>
              <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Add product
              </Button>
              <ExportMenu filenameBase="discount-products" title="Discount Products" headers={exportHeaders} rows={exportRows} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Description of Products</TableHead>
                    <TableHead>Per Ctn/Bgs</TableHead>
                    <TableHead className="text-right">Raw M</TableHead>
                    <TableHead className="text-right">Manu R</TableHead>
                    <TableHead className="text-right">Depot P R</TableHead>
                    <TableHead className="text-right">Depot S R</TableHead>
                    <TableHead className="text-right">SR Com %</TableHead>
                    <TableHead className="text-right">SR Rate</TableHead>
                    <TableHead className="text-right">TP %</TableHead>
                    <TableHead className="text-right">TP Rate</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => {
                    const { srRate, tpRate } = computeDiscountProductRates(
                      product.dealerRate,
                      product.srCommissionPercent,
                      product.tpPercent
                    )
                    return (
                      <TableRow key={product.id}>
                        <TableCell className="min-w-56">
                          <div className="flex items-center gap-3">
                            <BadgePercent className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div>
                              <p className="font-semibold">{product.name}</p>
                              {product.category ? (
                                <p className="text-xs text-muted-foreground">{product.category}</p>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-32">{product.perCtnBgs || 'N/A'}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(product.rawRate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(product.manufRate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(product.depotRate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(product.dealerRate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{product.srCommissionPercent}%</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(srRate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{product.tpPercent}%</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(tpRate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(product.mrpRate)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => openEditDialog(product)}
                              aria-label={`Edit ${product.name}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 text-destructive hover:text-destructive"
                              onClick={() => void handleDelete(product)}
                              aria-label={`Delete ${product.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="h-28 text-center text-muted-foreground">
                        No discount products found.
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit discount product' : 'Add discount product'}</DialogTitle>
            <DialogDescription>
              Raw M → Manu R → Depot P R → Depot S R (Delar Rate) is the cost chain; SR Rate and TP Rate are then
              computed automatically from the commission and markup percentages below.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Description of product<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. ধনিয়া গুঁড়া 2.5 কেজি"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Category <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <Input
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                  placeholder="e.g. Spices"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Per Ctn/Bgs <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <Input
                  value={form.perCtnBgs}
                  onChange={(event) => setForm((current) => ({ ...current, perCtnBgs: event.target.value }))}
                  placeholder="e.g. 06 ps = 1 bg"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Raw M <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.rawRate}
                  onChange={(event) => setForm((current) => ({ ...current, rawRate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Manu R <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.manufRate}
                  onChange={(event) => setForm((current) => ({ ...current, manufRate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Depot P R <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.depotRate}
                  onChange={(event) => setForm((current) => ({ ...current, depotRate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Depot S R (Delar Rate)</p>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.dealerRate}
                  onChange={(event) => setForm((current) => ({ ...current, dealerRate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">SR Commission %</p>
                <Input
                  inputMode="numeric"
                  placeholder="8"
                  value={form.srCommissionPercent}
                  onChange={(event) => setForm((current) => ({ ...current, srCommissionPercent: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">TP %</p>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.tpPercent}
                  onChange={(event) => setForm((current) => ({ ...current, tpPercent: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">MRP</p>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.mrpRate}
                  onChange={(event) => setForm((current) => ({ ...current, mrpRate: event.target.value }))}
                />
              </div>
            </div>
            {(() => {
              const { srRate, tpRate } = computeDiscountProductRates(
                parseAmount(form.dealerRate),
                parseAmount(form.srCommissionPercent),
                parseAmount(form.tpPercent)
              )
              return (
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">SR Rate (computed)</p>
                    <p className="font-semibold tabular-nums">{formatCurrency(srRate)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">TP Rate (computed)</p>
                    <p className="font-semibold tabular-nums">{formatCurrency(tpRate)}</p>
                  </div>
                </div>
              )
            })()}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                {editingProduct ? 'Update product' : 'Save product'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

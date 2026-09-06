"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Edit, Plus, Search, Store, Trash2 } from 'lucide-react'

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
import type { TradeSalesProductInput, TradeSalesProductRecord } from '@/lib/erp/types'
import { formatCurrency, sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'

// Trade Sales Product List — for hubs where the company runs a depot but has
// no dealer under it: the company manufactures and sells retail directly
// through its own staff there. Same rate-card chain as the main Product List
// (see ProductRecord in types.ts) — Raw M → Manu R → Depot P R → Depot S R →
// TP → MRP, every rate typed in directly rather than derived as a percentage
// step the way the Discount Product List's SR Rate/TP Rate are. See
// TradeSalesProductRecord in types.ts for the field meanings.
type TradeSalesProductFormState = {
  name: string
  banglaName: string
  category: string
  perCtnBgs: string
  rawRate: string
  manufRate: string
  depotRate: string
  dealerRate: string
  tpRate: string
  mrpRate: string
}

const emptyForm: TradeSalesProductFormState = {
  name: '',
  banglaName: '',
  category: '',
  perCtnBgs: '',
  rawRate: '0',
  manufRate: '0',
  depotRate: '0',
  dealerRate: '0',
  tpRate: '0',
  mrpRate: '0',
}

function formFromProduct(product: TradeSalesProductRecord): TradeSalesProductFormState {
  return {
    name: product.name,
    banglaName: product.banglaName ?? '',
    category: product.category ?? '',
    perCtnBgs: product.perCtnBgs ?? '',
    rawRate: String(product.rawRate),
    manufRate: String(product.manufRate),
    depotRate: String(product.depotRate),
    dealerRate: String(product.dealerRate),
    tpRate: String(product.tpRate),
    mrpRate: String(product.mrpRate),
  }
}

function parseAmount(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function TradeSalesProductsPage() {
  const { data, saveTradeSalesProduct, deleteTradeSalesProduct } = useERP()
  const products = useMemo(
    () => sortByCreatedAtDesc(toArray(data?.tradeSalesProducts)),
    [data?.tradeSalesProducts]
  )
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<TradeSalesProductRecord | null>(null)
  const [form, setForm] = useState<TradeSalesProductFormState>(emptyForm)
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
    'TP Rate',
    'MRP',
  ]
  const exportRows = useMemo(
    () =>
      filteredProducts.map((product) => [
        product.name,
        product.perCtnBgs ?? '',
        product.rawRate,
        product.manufRate,
        product.depotRate,
        product.dealerRate,
        product.tpRate,
        product.mrpRate,
      ]),
    [filteredProducts]
  )

  function openCreateDialog() {
    setEditingProduct(null)
    setForm(emptyForm)
    setFeedback(null)
    setDialogOpen(true)
  }

  function openEditDialog(product: TradeSalesProductRecord) {
    setEditingProduct(product)
    setForm(formFromProduct(product))
    setFeedback(null)
    setDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const input: TradeSalesProductInput = {
      name: form.name,
      banglaName: form.banglaName,
      category: form.category,
      perCtnBgs: form.perCtnBgs,
      rawRate: parseAmount(form.rawRate),
      manufRate: parseAmount(form.manufRate),
      depotRate: parseAmount(form.depotRate),
      dealerRate: parseAmount(form.dealerRate),
      tpRate: parseAmount(form.tpRate),
      mrpRate: parseAmount(form.mrpRate),
    }

    try {
      await saveTradeSalesProduct(input, editingProduct?.id)
      setDialogOpen(false)
      setForm(emptyForm)
      setEditingProduct(null)
      setFeedback(editingProduct ? 'Trade sales product updated.' : 'New trade sales product added.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save trade sales product.')
    }
  }

  async function handleDelete(product: TradeSalesProductRecord) {
    setFeedback(null)

    try {
      await deleteTradeSalesProduct(product.id)
      setFeedback(`${product.name} removed from the trade sales product list.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete trade sales product.')
    }
  }

  return (
    <AdminShell active="Trade Sales Product List" fullWidth>
      <div className="space-y-6">
        <Card className="w-full max-w-xs border-border/70 shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Trade sales products</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{products.length.toLocaleString('en-BD')}</p>
            <p className="mt-1 text-xs text-muted-foreground">Depot-without-dealer / direct retail price list on file</p>
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
              <CardTitle>Trade sales product list</CardTitle>
              <CardDescription>
                For a depot with no dealer under it — the company manufactures and sells retail directly through its
                own staff. Same Raw M → Manu R → Depot P R → Depot S R → TP → MRP chain as the main Product List,
                every rate typed in directly.
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
              <ExportMenu
                filenameBase="trade-sales-products"
                title="Trade Sales Products"
                headers={exportHeaders}
                rows={exportRows}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40 [&>th]:whitespace-nowrap">
                    <TableHead>Description of Products</TableHead>
                    <TableHead>Per Ctn/Bgs</TableHead>
                    <TableHead className="text-right">Raw M</TableHead>
                    <TableHead className="text-right">Manu R</TableHead>
                    <TableHead className="text-right">Depot P R</TableHead>
                    <TableHead className="text-right">Depot S R</TableHead>
                    <TableHead className="text-right">TP Rate</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="min-w-56">
                        <div className="flex items-center gap-3">
                          <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
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
                      <TableCell className="text-right tabular-nums">{formatCurrency(product.tpRate)}</TableCell>
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
                  ))}
                  {filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-28 text-center text-muted-foreground">
                        No trade sales products found.
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
            <DialogTitle>{editingProduct ? 'Edit trade sales product' : 'Add trade sales product'}</DialogTitle>
            <DialogDescription>
              Raw M, Manu R, Depot P R, Depot S R, TP Rate, and MRP are all typed in directly — no percentage steps.
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
                <p className="text-sm font-medium text-foreground">Depot S R</p>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.dealerRate}
                  onChange={(event) => setForm((current) => ({ ...current, dealerRate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">TP Rate</p>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={form.tpRate}
                  onChange={(event) => setForm((current) => ({ ...current, tpRate: event.target.value }))}
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

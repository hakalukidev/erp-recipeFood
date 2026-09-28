"use client"

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Printer, Search } from 'lucide-react'

import { ExportMenu } from '@/components/admin/ExportMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { COMPANY_ADDRESS, COMPANY_EMAIL, COMPANY_HELPLINE, COMPANY_NAME } from '@/lib/erp/companyInfo'
import { useERP } from '@/lib/erp/provider'
import type { PurchaseMaterialCategory, PurchaseMaterialUnit } from '@/lib/erp/types'
import { computeFactoryStock, describePackConversion, formatDate, type FactoryStockRow } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

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

const UNIT_LABEL: Record<PurchaseMaterialUnit, string> = { kg: 'Kg', pcs: 'Pcs' }
const CATEGORY_LABEL: Record<PurchaseMaterialCategory, string> = {
  raw_material: 'Raw Material',
  packaging_material: 'Packaging',
}

type CategoryFilter = 'all' | PurchaseMaterialCategory

type Totals = { opening: number; purchased: number; sold: number; otherUsage: number; closing: number }

// Kg rows only — adding Kg and Pcs together would be meaningless.
function sumKg(rows: FactoryStockRow[]): Totals {
  return rows
    .filter((row) => row.material.unit === 'kg')
    .reduce(
      (totals, row) => ({
        opening: totals.opening + row.openingQty,
        purchased: totals.purchased + row.purchasedQty,
        sold: totals.sold + row.soldQty,
        otherUsage: totals.otherUsage + row.otherUsageQty,
        closing: totals.closing + row.closingQty,
      }),
      { opening: 0, purchased: 0, sold: 0, otherUsage: 0, closing: 0 }
    )
}

// Factory Stock (2026-09-28 client spec §7–9, §12): Vendor → Purchase →
// Factory Stock → Dealer sale, product-wise — Purchased / Sold / Current
// Stock at a glance, for all time or any date range (Opening + Purchased −
// Sold − Other usage = Closing). See computeFactoryStock in utils.ts for
// the math — this is a read-only live view, nothing here writes stock.
export function FactoryStockSection() {
  const { data } = useERP()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('raw_material')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const rows = useMemo(
    () => computeFactoryStock(data ?? null, { from: fromDate || undefined, to: toDate || undefined }),
    [data, fromDate, toDate]
  )

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return rows.filter(
      (row) =>
        (category === 'all' || row.material.category === category) &&
        (!normalized || row.material.name.toLowerCase().includes(normalized))
    )
  }, [rows, query, category])

  const totals = useMemo(() => sumKg(filteredRows), [filteredRows])
  const lowStockCount = filteredRows.filter((row) => row.currentQty <= row.material.minStock).length
  const hasRange = Boolean(fromDate || toDate)
  const closingLabel = toDate ? `Stock on ${formatDate(toDate)}` : 'Current stock'
  const rangeLabel = hasRange
    ? `${fromDate ? formatDate(fromDate) : 'Start'} — ${toDate ? formatDate(toDate) : 'Today'}`
    : 'All time'

  function toggle(materialId: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(materialId)) next.delete(materialId)
      else next.add(materialId)
      return next
    })
  }

  const exportHeaders = ['Product', 'Unit', 'Opening', 'Purchased', 'Sold', 'Other usage', closingLabel, 'Loose now', 'Packed now']
  const exportRows = [
    ...filteredRows.map((row) => [
      row.material.name,
      UNIT_LABEL[row.material.unit],
      row.openingQty,
      row.purchasedQty,
      row.soldQty,
      row.otherUsageQty,
      row.closingQty,
      row.looseQty,
      row.packedQty,
    ]),
    ['Total (Kg)', 'Kg', totals.opening, totals.purchased, totals.sold, totals.otherUsage, totals.closing, '', ''],
  ]

  function handlePrint() {
    const bodyRows = filteredRows
      .map(
        (row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(row.material.name)}</td>
          <td class="numeric">${formatQty(row.openingQty)}</td>
          <td class="numeric">${formatQty(row.purchasedQty)}</td>
          <td class="numeric">${formatQty(row.soldQty)}</td>
          <td class="numeric">${formatQty(row.otherUsageQty)}</td>
          <td class="numeric hl">${formatQty(row.closingQty)} ${UNIT_LABEL[row.material.unit]}</td>
        </tr>`
      )
      .join('')
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Factory Stock — ${escapeHtml(rangeLabel)}</title>
    <style>
      @page { margin: 12mm 16mm; size: A4; }
      body { color: #111827; font-family: Arial, sans-serif; margin: 0; }
      .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; color: #0f766e; }
      .company-meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
      .subtitle { text-align: center; color: #4b5563; font-size: 13px; margin: 10px 0 16px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #d1d5db; padding: 5px 7px; font-size: 12.5px; }
      th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
      .numeric { text-align: right; white-space: nowrap; }
      .hl { font-weight: 700; }
      tr.totals td { font-weight: 700; border-top: 2px solid #111827; }
    </style>
  </head>
  <body>
    <p class="title">${escapeHtml(COMPANY_NAME)}</p>
    <p class="company-meta">${escapeHtml(COMPANY_ADDRESS)}</p>
    <p class="company-meta">${escapeHtml(COMPANY_EMAIL)} &middot; Help Line: ${escapeHtml(COMPANY_HELPLINE)}</p>
    <p class="subtitle">Factory Stock Report — ${escapeHtml(rangeLabel)}</p>
    <table>
      <thead>
        <tr><th>SL</th><th>Product</th><th>Opening</th><th>Purchased</th><th>Sold</th><th>Other usage</th><th>${escapeHtml(closingLabel)}</th></tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tr class="totals">
        <td colspan="2">Total (Kg)</td>
        <td class="numeric">${formatQty(totals.opening)}</td>
        <td class="numeric">${formatQty(totals.purchased)}</td>
        <td class="numeric">${formatQty(totals.sold)}</td>
        <td class="numeric">${formatQty(totals.otherUsage)}</td>
        <td class="numeric">${formatQty(totals.closing)} Kg</td>
      </tr>
    </table>
    <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
  </body>
</html>`
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total purchased (Kg)</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{formatQty(totals.purchased)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{rangeLabel} · added from vendors</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total sold (Kg)</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-emerald-600">{formatQty(totals.sold)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{rangeLabel} · billed to dealers</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">{closingLabel} (Kg)</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{formatQty(totals.closing)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Loose + packed, in the factory</p>
          </CardContent>
        </Card>
        <Card className={cn('border-border/70 shadow-sm', lowStockCount > 0 && 'border-destructive/50 bg-destructive/5')}>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Low stock now</p>
            <p className={cn('mt-2 text-2xl font-semibold tracking-tight', lowStockCount > 0 && 'text-destructive')}>
              {lowStockCount.toLocaleString('en-BD')}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">At or below minimum stock</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="gap-4">
          <div>
            <CardTitle>Factory stock — product-wise</CardTitle>
            <CardDescription>
              Opening + Purchased − Sold − Other usage = {closingLabel}. A purchase adds to stock; a dealer sale of a
              pack size (e.g. 10 bags × 15 kg, or 72 × 45 g) takes its weight out. Pick dates to see any period; click
              a row for pack-size detail.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">From</p>
              <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-9 w-40" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">To</p>
              <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-9 w-40" />
            </div>
            {hasRange ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => {
                  setFromDate('')
                  setToDate('')
                }}
              >
                All time
              </Button>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {(['raw_material', 'packaging_material', 'all'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(value)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                    category === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border/70 hover:bg-muted'
                  )}
                >
                  {value === 'all' ? 'All' : CATEGORY_LABEL[value]}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 w-52 pl-9" placeholder="Search product" />
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" className="h-9 rounded-xl" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
              <ExportMenu filenameBase="factory-stock" title={`Factory Stock — ${rangeLabel}`} headers={exportHeaders} rows={exportRows} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Purchased (+)</TableHead>
                  <TableHead className="text-right">Sold (−)</TableHead>
                  <TableHead className="text-right">Other usage (−)</TableHead>
                  <TableHead className="text-right">{closingLabel}</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const unit = UNIT_LABEL[row.material.unit]
                  const isOpen = expanded.has(row.material.id)
                  const low = row.currentQty <= row.material.minStock
                  return (
                    <Fragment key={row.material.id}>
                      <TableRow className="cursor-pointer" onClick={() => toggle(row.material.id)}>
                        <TableCell className="min-w-48 font-medium">
                          <div className="flex items-center gap-2">
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div>
                              <p>{row.material.name}</p>
                              <p className="text-xs font-normal text-muted-foreground">
                                {CATEGORY_LABEL[row.material.category]} · {unit}
                                {row.packs.length ? ` · ${row.packs.length} pack size${row.packs.length > 1 ? 's' : ''}` : ''}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatQty(row.openingQty)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQty(row.purchasedQty)}
                          <p className="text-[11px] text-muted-foreground">
                            {row.purchaseCount} purchase{row.purchaseCount === 1 ? '' : 's'}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatQty(row.soldQty)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQty(row.otherUsageQty)}</TableCell>
                        <TableCell className={cn('text-right font-semibold tabular-nums', row.closingQty < 0 && 'text-destructive')}>
                          {formatQty(row.closingQty)} {unit}
                        </TableCell>
                        <TableCell>
                          <Badge variant={low ? 'destructive' : 'secondary'}>{low ? 'Low stock' : 'In stock'}</Badge>
                        </TableCell>
                      </TableRow>
                      {isOpen ? (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={7} className="py-3 pl-10">
                            <p className="mb-2 text-xs text-muted-foreground">
                              Right now: {formatQty(row.looseQty)} {unit} loose + {formatQty(row.packedQty)} {unit} packed ={' '}
                              <span className="font-semibold text-foreground">
                                {formatQty(row.currentQty)} {unit}
                              </span>
                            </p>
                            {row.packs.length ? (
                              <Table>
                                <TableHeader>
                                  <TableRow className="hover:bg-transparent">
                                    <TableHead>Pack size</TableHead>
                                    <TableHead className="text-right">Weight / unit</TableHead>
                                    <TableHead className="text-right">Sold units</TableHead>
                                    <TableHead className="text-right">Sold weight</TableHead>
                                    <TableHead className="text-right">Packed now</TableHead>
                                    <TableHead className="text-right">Packed weight</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {row.packs.map((pack) => (
                                    <TableRow key={pack.finishedGoodsId} className="hover:bg-transparent">
                                      <TableCell>
                                        {pack.name}
                                        {pack.packSize ? <span className="text-muted-foreground"> · {pack.packSize}</span> : null}
                                        {describePackConversion(pack) ? (
                                          <p className="text-[11px] text-muted-foreground">{describePackConversion(pack)}</p>
                                        ) : null}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">{formatQty(pack.unitWeightKg)} Kg</TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {formatQty(pack.soldUnits)}
                                        {pack.piecesPerUnit ? (
                                          <p className="text-[11px] text-muted-foreground">{formatQty(pack.soldUnits * pack.piecesPerUnit)} pcs</p>
                                        ) : null}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">{formatQty(pack.soldUnits * pack.unitWeightKg)} Kg</TableCell>
                                      <TableCell className={cn('text-right tabular-nums', pack.packedUnits < 0 && 'text-destructive')}>
                                        {formatQty(pack.packedUnits)}
                                        {pack.piecesPerUnit ? (
                                          <p className="text-[11px] text-muted-foreground">{formatQty(pack.packedUnits * pack.piecesPerUnit)} pcs</p>
                                        ) : null}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">{formatQty(pack.packedUnits * pack.unitWeightKg)} Kg</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                No Finished Goods pack size is linked to this product yet, so no dealer sales count against it.
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })}
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                      No products found. Purchases add their materials here automatically.
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                    <TableCell>Total (Kg products)</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQty(totals.opening)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQty(totals.purchased)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQty(totals.sold)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQty(totals.otherUsage)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQty(totals.closing)} Kg</TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Opening (all time) is stock that was already on hand before the first purchase/sale on file, e.g. typed in
            when the product was added. For a dealer sale to count here, bill a Finished Goods pack size linked to this
            product with its weight set.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

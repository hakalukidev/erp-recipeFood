"use client"

import { useMemo, useState } from 'react'
import { BadgePercent, FileBarChart, Package, Printer, Receipt, Search, Store, Tags } from 'lucide-react'

import { ExportMenu } from './ExportMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_HELPLINE,
  COMPANY_INVOICE_FOOTER_NOTE,
  COMPANY_NAME,
} from '@/lib/erp/companyInfo'
import { useERP } from '@/lib/erp/provider'
import { buildCategorySalesReportSummary, buildSalesReportSummary, formatCurrency, type CategorySalesReportRow } from '@/lib/erp/utils'
import type { SaleType } from '@/lib/erp/types'

const SALE_TYPE_LABELS: Record<SaleType, string> = {
  commission: 'Commission-based',
  others: 'Others / Direct',
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

function openPrintWindow(html: string) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(html)
  printWindow.document.close()
}

// Total Sales Invoice, grouped by Category — same layout family as the
// Company Voucher on the Invoice page (buildRateCardHtml), one row per
// category instead of per line item, with the Depot's and the Company's
// profit for that category shown the same way the Company Voucher highlights
// Usable money / Depot Net Profit.
function buildCategoryInvoiceHtml(categories: CategorySalesReportRow[]) {
  const totals = categories.reduce(
    (sum, row) => ({
      qty: sum.qty + row.qty,
      dealerRateTotal: sum.dealerRateTotal + row.dealerRateTotal,
      companyProfit: sum.companyProfit + row.companyProfit,
      depotProfit: sum.depotProfit + row.depotProfit,
    }),
    { qty: 0, dealerRateTotal: 0, companyProfit: 0, depotProfit: 0 }
  )

  const rows = categories
    .map(
      (row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(row.category)}</td>
        <td class="numeric">${row.qty.toLocaleString('en-BD')}</td>
        <td class="numeric">${formatAmount(row.dealerRateTotal)}</td>
        <td class="numeric hl">${formatAmount(row.depotProfit)}</td>
        <td class="numeric hl">${formatAmount(row.companyProfit)}</td>
      </tr>
    `
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Total Sales Invoice — by Category</title>
        <style>
          * { box-sizing: border-box; }
          @page { margin: 12mm 16mm; size: A4; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 0; }
          .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; color: #0f766e; }
          .company-meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
          .subtitle { text-align: center; color: #4b5563; font-size: 13px; margin: 10px 0 16px; }
          .hl { background: #fef9c3; font-weight: 700; }
          table.doc { border-collapse: collapse; width: 100%; }
          table.doc th, table.doc td { border: 1px solid #d1d5db; padding: 5px 7px; font-size: 12.5px; }
          table.doc th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
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
        <p class="subtitle">Total Sales Invoice — by Category</p>
        <table class="doc">
          <thead>
            <tr>
              <th>SL</th>
              <th>Category</th>
              <th>QTY (pcs)</th>
              <th>Total Sales (Depot Amount)</th>
              <th>Depot Profit</th>
              <th>Company Profit</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="totals">
              <td colspan="2">Grand Total</td>
              <td class="numeric">${totals.qty.toLocaleString('en-BD')}</td>
              <td class="numeric">${formatAmount(totals.dealerRateTotal)}</td>
              <td class="numeric">${formatAmount(totals.depotProfit)}</td>
              <td class="numeric">${formatAmount(totals.companyProfit)}</td>
            </tr>
          </tbody>
        </table>
        <p class="footnote">${escapeHtml(COMPANY_INVOICE_FOOTER_NOTE)}</p>
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

// Section — Sales Reports. Built entirely off saved Invoices (RateCardRecord,
// see the "Invoice" screen at /admin/rate-card) — the only sales document
// actually reachable from the UI today. See buildSalesReportSummary in
// utils.ts for how the dealer/product/commission-vs-others numbers below are
// derived, and the "Sale type" field on the Invoice form for how a new
// invoice gets tagged Commission-based vs Others going forward.
// Renders just the Sales tab's content — no AdminShell of its own, since
// this now lives inside the Reports Hub's own AdminShell/tab switcher (see
// ReportsHubScreen.tsx) alongside Expense/Purchase/Vendor/Loan report tabs.
export function SalesReportsContent() {
  const { data, classifyRateCardSaleType } = useERP()
  const currency = data?.settings.currency
  const summary = useMemo(() => buildSalesReportSummary(data), [data])
  const categorySummary = useMemo(() => buildCategorySalesReportSummary(data), [data])

  const [dealerQuery, setDealerQuery] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [categoryQuery, setCategoryQuery] = useState('')

  // Individual invoices behind the aggregated "Unclassified" figure above —
  // buildSalesReportSummary only rolls these up per dealer/product, so the
  // classify-in-place list below reads straight off data.rateCards instead.
  const unclassifiedCards = useMemo(() => {
    return Object.values(data?.rateCards ?? {})
      .filter((card) => card.saleType !== 'commission' && card.saleType !== 'others')
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [data?.rateCards])

  const [pendingType, setPendingType] = useState<Record<string, SaleType>>({})
  const [bulkType, setBulkType] = useState<SaleType | ''>('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [classifyFeedback, setClassifyFeedback] = useState<string | null>(null)

  async function handleClassifyOne(rateCardId: string, invoiceNo: string) {
    const saleType = pendingType[rateCardId]
    if (!saleType) return
    setClassifyFeedback(null)
    setSavingId(rateCardId)
    try {
      await classifyRateCardSaleType(rateCardId, saleType)
      setClassifyFeedback(`Invoice ${invoiceNo} classified as ${SALE_TYPE_LABELS[saleType]}.`)
    } catch (reason) {
      setClassifyFeedback(reason instanceof Error ? reason.message : 'Unable to classify invoice.')
    } finally {
      setSavingId(null)
    }
  }

  async function handleClassifyAll() {
    if (!bulkType || unclassifiedCards.length === 0) return
    if (
      !window.confirm(
        `Mark all ${unclassifiedCards.length} unclassified invoice(s) as "${SALE_TYPE_LABELS[bulkType]}"? This cannot be undone in bulk.`
      )
    ) {
      return
    }
    setClassifyFeedback(null)
    setBulkSaving(true)
    try {
      for (const card of unclassifiedCards) {
        await classifyRateCardSaleType(card.id, bulkType)
      }
      setClassifyFeedback(`${unclassifiedCards.length} invoice(s) classified as ${SALE_TYPE_LABELS[bulkType]}.`)
      setBulkType('')
    } catch (reason) {
      setClassifyFeedback(reason instanceof Error ? reason.message : 'Unable to classify all invoices.')
    } finally {
      setBulkSaving(false)
    }
  }

  const filteredDealers = useMemo(() => {
    const normalized = dealerQuery.trim().toLowerCase()
    if (!normalized) return summary.dealers
    return summary.dealers.filter((row) => row.dealerName.toLowerCase().includes(normalized))
  }, [summary.dealers, dealerQuery])

  const filteredProducts = useMemo(() => {
    const normalized = productQuery.trim().toLowerCase()
    if (!normalized) return summary.products
    return summary.products.filter((row) => row.productName.toLowerCase().includes(normalized))
  }, [summary.products, productQuery])

  const filteredCategories = useMemo(() => {
    const normalized = categoryQuery.trim().toLowerCase()
    if (!normalized) return categorySummary.categories
    return categorySummary.categories.filter((row) => row.category.toLowerCase().includes(normalized))
  }, [categorySummary.categories, categoryQuery])

  const hasUnclassified = summary.bySaleType.unclassified > 0

  return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Receipt className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Total sales</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(summary.totalAmount, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{summary.totalInvoices.toLocaleString('en-BD')} invoice(s)</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <BadgePercent className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Commission-based sales</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(summary.bySaleType.commission, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Invoices marked Commission-based</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Store className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Others / direct sales</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(summary.bySaleType.others, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Invoices marked Others / Direct</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FileBarChart className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm text-muted-foreground">Unclassified sales</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{formatCurrency(summary.bySaleType.unclassified, currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Invoices saved before Sale Type existed</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Dealer-wise sales report</CardTitle>
              <CardDescription>Search a dealer to see their total invoiced sales, split by sale type.</CardDescription>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={dealerQuery}
                  onChange={(event) => setDealerQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search dealer"
                />
              </div>
              <ExportMenu
                filenameBase="dealer-sales-report"
                title="Dealer-wise Sales Report"
                headers={['Dealer', 'Invoices', 'Commission-based', 'Others', 'Unclassified', 'Total']}
                rows={filteredDealers.map((row) => [
                  row.dealerName,
                  row.invoiceCount,
                  row.commissionAmount.toFixed(2),
                  row.othersAmount.toFixed(2),
                  row.unclassifiedAmount.toFixed(2),
                  row.totalAmount.toFixed(2),
                ])}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dealer</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Commission-based</TableHead>
                    <TableHead className="text-right">Others</TableHead>
                    {hasUnclassified ? <TableHead className="text-right">Unclassified</TableHead> : null}
                    <TableHead className="text-right">Total sale amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDealers.map((row) => (
                    <TableRow key={row.dealerId}>
                      <TableCell className="font-medium">{row.dealerName}</TableCell>
                      <TableCell className="text-right">{row.invoiceCount.toLocaleString('en-BD')}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.commissionAmount, currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.othersAmount, currency)}</TableCell>
                      {hasUnclassified ? (
                        <TableCell className="text-right">{formatCurrency(row.unclassifiedAmount, currency)}</TableCell>
                      ) : null}
                      <TableCell className="text-right font-semibold">{formatCurrency(row.totalAmount, currency)}</TableCell>
                    </TableRow>
                  ))}
                  {filteredDealers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={hasUnclassified ? 6 : 5} className="py-10 text-center text-sm text-muted-foreground">
                        <Store className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        {summary.dealers.length === 0 ? 'No invoiced sales yet.' : 'No dealer matches this search.'}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Product-wise sales report</CardTitle>
              <CardDescription>Total quantity and amount sold per product, across every invoice.</CardDescription>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search product"
                />
              </div>
              <ExportMenu
                filenameBase="product-sales-report"
                title="Product-wise Sales Report"
                headers={['Product', 'Quantity sold (pcs)', 'Total sale amount']}
                rows={filteredProducts.map((row) => [row.productName, row.qty, row.totalAmount.toFixed(2)])}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity sold (pcs)</TableHead>
                    <TableHead className="text-right">Total sale amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell className="font-medium">{row.productName}</TableCell>
                      <TableCell className="text-right">{row.qty.toLocaleString('en-BD')}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(row.totalAmount, currency)}</TableCell>
                    </TableRow>
                  ))}
                  {filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                        <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        {summary.products.length === 0 ? 'No invoiced sales yet.' : 'No product matches this search.'}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Category-wise sales report</CardTitle>
              <CardDescription>
                Total Sales Invoice by product category — Depot and Company profit shown the same way as the Company
                Voucher on the Invoice page, net of any product returns.
              </CardDescription>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={categoryQuery}
                  onChange={(event) => setCategoryQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search category"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => openPrintWindow(buildCategoryInvoiceHtml(filteredCategories))}
                disabled={filteredCategories.length === 0}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print invoice
              </Button>
              <ExportMenu
                filenameBase="category-sales-report"
                title="Category-wise Sales Report"
                headers={['Category', 'Quantity sold (pcs)', 'Total sale amount', 'Depot profit', 'Company profit']}
                rows={filteredCategories.map((row) => [
                  row.category,
                  row.qty,
                  row.dealerRateTotal.toFixed(2),
                  row.depotProfit.toFixed(2),
                  row.companyProfit.toFixed(2),
                ])}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Quantity sold (pcs)</TableHead>
                    <TableHead className="text-right">Total sale amount</TableHead>
                    <TableHead className="text-right">Depot profit</TableHead>
                    <TableHead className="text-right">Company profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCategories.map((row) => (
                    <TableRow key={row.category}>
                      <TableCell className="font-medium">{row.category}</TableCell>
                      <TableCell className="text-right">{row.qty.toLocaleString('en-BD')}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(row.dealerRateTotal, currency)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.depotProfit, currency)}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(row.companyProfit, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredCategories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        <Tags className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        {categorySummary.categories.length === 0 ? 'No invoiced sales yet.' : 'No category matches this search.'}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
                {filteredCategories.length > 0 ? (
                  <TableBody>
                    <TableRow className="border-t-2 border-border">
                      <TableCell className="font-semibold">Grand total</TableCell>
                      <TableCell className="text-right font-semibold">
                        {filteredCategories.reduce((sum, row) => sum + row.qty, 0).toLocaleString('en-BD')}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(filteredCategories.reduce((sum, row) => sum + row.dealerRateTotal, 0), currency)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(filteredCategories.reduce((sum, row) => sum + row.depotProfit, 0), currency)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(filteredCategories.reduce((sum, row) => sum + row.companyProfit, 0), currency)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                ) : null}
              </Table>
            </div>
          </CardContent>
        </Card>

        {hasUnclassified ? (
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="outline" className="font-normal">Unclassified</Badge>
                  Classify invoices
                </CardTitle>
                <CardDescription>
                  {unclassifiedCards.length} invoice(s) were saved before the Sale Type field existed. Pick a type for
                  each below, or classify all of them at once.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={bulkType || undefined} onValueChange={(value) => setBulkType(value as SaleType)}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Classify all as…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SALE_TYPE_LABELS) as SaleType[]).map((type) => (
                      <SelectItem key={type} value={type}>
                        {SALE_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleClassifyAll} disabled={!bulkType || bulkSaving}>
                  {bulkSaving ? 'Applying…' : 'Apply to all'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {classifyFeedback ? <p className="text-sm text-muted-foreground">{classifyFeedback}</p> : null}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Dealer</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Sale type</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unclassifiedCards.map((card) => (
                      <TableRow key={card.id}>
                        <TableCell className="whitespace-nowrap">{card.date}</TableCell>
                        <TableCell className="font-medium">{card.invoiceNo}</TableCell>
                        <TableCell>{card.recipientName}</TableCell>
                        <TableCell className="text-right">{formatCurrency(card.dealerRateTotal, currency)}</TableCell>
                        <TableCell>
                          <Select
                            value={pendingType[card.id] ?? undefined}
                            onValueChange={(value) =>
                              setPendingType((current) => ({ ...current, [card.id]: value as SaleType }))
                            }
                          >
                            <SelectTrigger className="w-44">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(SALE_TYPE_LABELS) as SaleType[]).map((type) => (
                                <SelectItem key={type} value={type}>
                                  {SALE_TYPE_LABELS[type]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!pendingType[card.id] || savingId === card.id}
                            onClick={() => handleClassifyOne(card.id, card.invoiceNo)}
                          >
                            {savingId === card.id ? 'Saving…' : 'Save'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
  )
}

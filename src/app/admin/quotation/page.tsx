"use client"

import { useMemo, useState, type ChangeEvent } from 'react'
import { FileDown, ImageOff, Loader2, Plus, Search, Trash2, X } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
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
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { ProductRecord } from '@/lib/erp/types'
import { createId, toArray } from '@/lib/erp/utils'

type QuotationItem = {
  productId: string
  name: string
  imageUrl?: string
  description: string
  qty: string
  rate: string
  remark: string
}

const COMPANY_PHONE = '+88 01897914480-83'
const COMPANY_PHONE_TEL = '+8801897914480'
const COMPANY_ADDRESS = '92, Wise Market, Nawabpur Road, Dhaka-1100'
const COMPANY_EMAIL = 'info@recipefood.com'
const COMPANY_WEBSITE = 'www.recipefood.com'
const COMPANY_FACEBOOK = 'www.facebook.com/recipefood'

const defaultNotes = `1. The price quotation is including:
   * Transportation
   * Warehouse loading
   * Installation & hydraulic oil
   * Basic training after installation
2. Products warranty 1 year (according to manufacturing policy).
3. This price quotation will be valid for 10 days.
4. 50% advance required for pre-order goods.
   * Pre-order goods will be delivered within 50 days.
5. Need to clear 100% payment before product delivery.`

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function nl2br(value: string) {
  return escapeHtml(value).replaceAll('\n', '<br/>')
}

function formatNumber(value: number) {
  return value.toLocaleString('en-BD')
}

function defaultQuotationNumber() {
  return Date.now().toString().slice(-4)
}

type ManualItemForm = {
  name: string
  description: string
  qty: string
  rate: string
  remark: string
}

const emptyManualItemForm: ManualItemForm = {
  name: '',
  description: '',
  qty: '1',
  rate: '0',
  remark: 'Ready Stock',
}

async function uploadQuotationImage(file: File): Promise<string> {
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

  const result = (await response.json()) as { secure_url?: string }
  if (!result.secure_url) {
    throw new Error('Cloudinary did not return a valid image response.')
  }

  return result.secure_url
}

export default function QuotationPage() {
  const { data } = useERP()
  const products = useMemo(() => toArray(data?.products), [data?.products])

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addMode, setAddMode] = useState<'catalog' | 'manual'>('catalog')
  const [productQuery, setProductQuery] = useState('')
  const [manualForm, setManualForm] = useState<ManualItemForm>(emptyManualItemForm)
  const [manualImageFile, setManualImageFile] = useState<File | null>(null)
  const [manualImagePreview, setManualImagePreview] = useState<string | null>(null)
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState<string | null>(null)
  const [items, setItems] = useState<QuotationItem[]>([])
  const [quotationNo, setQuotationNo] = useState(defaultQuotationNumber)
  const [quotationDate, setQuotationDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [recipientName, setRecipientName] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [notes, setNotes] = useState(defaultNotes)
  const [feedback, setFeedback] = useState<string | null>(null)

  const availableProducts = useMemo(() => {
    const normalizedQuery = productQuery.trim().toLowerCase()
    const selectedIds = new Set(items.map((item) => item.productId))

    return products
      .filter((product) => !selectedIds.has(product.id))
      .filter((product) => {
        if (!normalizedQuery) return true
        return [product.name, product.category, product.brand, product.sku]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      })
  }, [products, productQuery, items])

  const grandTotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.rate || 0), 0)

  function addProduct(product: ProductRecord) {
    setFeedback(null)
    setItems((current) => [
      ...current,
      {
        productId: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        description: product.description || '',
        qty: '1',
        rate: String(product.sellingPrice ?? 0),
        remark: 'Ready Stock',
      },
    ])
  }

  function updateItem(productId: string, patch: Partial<QuotationItem>) {
    setItems((current) => current.map((item) => (item.productId === productId ? { ...item, ...patch } : item)))
  }

  function removeItem(productId: string) {
    setItems((current) => current.filter((item) => item.productId !== productId))
  }

  function openAddDialog() {
    setAddMode('catalog')
    setProductQuery('')
    setManualForm(emptyManualItemForm)
    setManualImageFile(null)
    setManualImagePreview(null)
    setManualError(null)
    setAddDialogOpen(true)
  }

  function handleManualImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setManualImageFile(file)
    setManualImagePreview(URL.createObjectURL(file))
  }

  function handleRemoveManualImage() {
    setManualImageFile(null)
    setManualImagePreview(null)
  }

  async function handleAddManualItem() {
    setManualError(null)

    if (!manualForm.name.trim()) {
      setManualError('Enter a product name.')
      return
    }

    setManualSaving(true)

    try {
      let imageUrl: string | undefined

      if (manualImageFile) {
        imageUrl = await uploadQuotationImage(manualImageFile)
      }

      setItems((current) => [
        ...current,
        {
          productId: createId('manual'),
          name: manualForm.name.trim(),
          imageUrl,
          description: manualForm.description,
          qty: manualForm.qty || '1',
          rate: manualForm.rate || '0',
          remark: manualForm.remark,
        },
      ])

      setManualForm(emptyManualItemForm)
      setManualImageFile(null)
      setManualImagePreview(null)
    } catch (reason) {
      setManualError(reason instanceof Error ? reason.message : 'Unable to add this product.')
    } finally {
      setManualSaving(false)
    }
  }

  function buildQuotationHtml() {
    const rows = items
      .map((item, index) => {
        const qty = Number(item.qty || 0)
        const rate = Number(item.rate || 0)
        const total = qty * rate

        return `
          <tr>
            <td>${index + 1}</td>
            <td class="name-cell">${escapeHtml(item.name)}</td>
            <td class="desc-cell">${nl2br(item.description)}</td>
            <td class="pic-cell">${
              item.imageUrl
                ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" />`
                : '<span class="no-pic">No image</span>'
            }</td>
            <td class="numeric">${qty}</td>
            <td class="numeric">${formatNumber(rate)}</td>
            <td class="numeric">${formatNumber(total)}</td>
            <td>${escapeHtml(item.remark)}</td>
          </tr>
        `
      })
      .join('')

    const noteLines = notes
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => `<p class="${line.trim().startsWith('*') ? 'note-sub' : 'note-line'}">${escapeHtml(line)}</p>`)
      .join('')

    const logoUrl = `${window.location.origin}/recipefood_technology.png`

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Price Quotation ${escapeHtml(quotationNo)}</title>
          <style>
            * { box-sizing: border-box; }
            @page { margin: 12mm 18mm; size: A4 landscape; }
            body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 0; }
            a { color: #111827; }
            .header { align-items: flex-start; border-bottom: 2px solid #111827; display: flex; justify-content: space-between; padding-bottom: 8px; }
            .brand-top { align-items: center; display: flex; gap: 10px; }
            .brand-top img { height: 36px; object-fit: contain; width: auto; }
            .brand p, .meta p, .party p { color: #4b5563; font-size: 13px; margin: 3px 0 0; }
            .title { font-size: 23px; font-weight: 700; margin: 0 0 4px; text-align: right; text-transform: uppercase; }
            .section { margin-top: 10px; }
            .party-grid { display: flex; gap: 24px; }
            table { border-collapse: collapse; width: 100%; }
            th { background: #f3f4f6; color: #374151; font-size: 12px; text-align: left; text-transform: uppercase; }
            th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; }
            td { font-size: 13px; }
            .letterhead-cell { background: transparent; border: none; padding: 0 0 8px; }
            .letterhead-cell .party-grid { border: none; }
            tbody tr { page-break-inside: avoid; }
            .name-cell { max-width: 160px; }
            .desc-cell { font-size: 12px; line-height: 1.35; max-width: 240px; white-space: pre-wrap; }
            .pic-cell { text-align: center; width: 120px; }
            .pic-cell img { max-height: 90px; max-width: 110px; object-fit: contain; }
            .no-pic { color: #9ca3af; font-size: 11px; }
            .numeric { text-align: right; white-space: nowrap; }
            .signatures { display: flex; justify-content: space-between; margin-top: 36px; page-break-inside: avoid; }
            .signatures div { border-top: 1px solid #111827; font-size: 13px; padding-top: 5px; text-align: center; width: 200px; }
            .notes { margin-top: 14px; page-break-inside: avoid; }
            .notes h2 { color: #b91c1c; font-size: 14px; margin: 0 0 4px; text-transform: uppercase; }
            .note-line { font-size: 12px; margin: 2px 0; }
            .note-sub { font-size: 12px; margin: 1px 0 1px 16px; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <table class="doc-table" id="doc-table">
            <thead>
              <tr>
                <th colspan="8" class="letterhead-cell">
                  <div class="header">
                    <div class="brand">
                      <div class="brand-top">
                        <img src="${escapeHtml(logoUrl)}" alt="RecipeFood logo" />
                      </div>
                      <p>Phone : <a href="tel:${COMPANY_PHONE_TEL}">${escapeHtml(COMPANY_PHONE)}</a></p>
                      <p>Address : ${escapeHtml(COMPANY_ADDRESS)}</p>
                      <p>Email: <a href="mailto:${escapeHtml(COMPANY_EMAIL)}">${escapeHtml(COMPANY_EMAIL)}</a> &middot; Web: <a href="https://${escapeHtml(COMPANY_WEBSITE)}" target="_blank" rel="noopener">${escapeHtml(COMPANY_WEBSITE)}</a></p>
                      <p><a href="https://${escapeHtml(COMPANY_FACEBOOK)}" target="_blank" rel="noopener">${escapeHtml(COMPANY_FACEBOOK)}</a></p>
                    </div>
                    <div class="meta">
                      <p class="title">Price Quotation Offer</p>
                      <p><strong>No:</strong> ${escapeHtml(quotationNo)}</p>
                      <p><strong>Date:</strong> ${escapeHtml(quotationDate)}</p>
                    </div>
                  </div>

                  <div class="section party-grid">
                    <p><strong>Name:</strong> ${escapeHtml(recipientName)}</p>
                    <p><strong>Address:</strong> ${escapeHtml(recipientAddress)}</p>
                  </div>
                </th>
              </tr>
              <tr>
                <th>SN.</th>
                <th>Name &amp; Model</th>
                <th>Product Description</th>
                <th>Product Picture</th>
                <th class="numeric">Qty.</th>
                <th class="numeric">Rate</th>
                <th class="numeric">Total Amount</th>
                <th>Remark</th>
              </tr>
            </thead>
            <tbody id="doc-rows">${rows}</tbody>
          </table>

          <div id="doc-footer">
            <div class="signatures">
              <div>Receiver Signature</div>
              <div>Authorized Signature</div>
            </div>

            <div class="notes">
              <h2>Note</h2>
              ${noteLines}
            </div>
          </div>

          <script>
            function paginate() {
              var table = document.getElementById('doc-table');
              var tbody = document.getElementById('doc-rows');
              var footerEl = document.getElementById('doc-footer');
              var rows = Array.prototype.slice.call(tbody.children);
              if (rows.length === 0) return null;

              var mmToPx = function (mm) { return (mm * 96) / 25.4; };
              var MARGIN_MM = 12;
              var SAFETY_PX = 24;
              var pageHeightPx = mmToPx(210 - MARGIN_MM * 2) - SAFETY_PX;

              var theadEl = table.querySelector('thead');
              var letterheadCell = theadEl.querySelector('.letterhead-cell');
              var colRow = theadEl.querySelectorAll('tr')[1];
              var letterheadHeight = letterheadCell.getBoundingClientRect().height;
              var colHeaderHeight = colRow.getBoundingClientRect().height;
              var perPageBudget = pageHeightPx - letterheadHeight - colHeaderHeight;
              var footerHeight = footerEl ? footerEl.getBoundingClientRect().height : 0;

              var rowHeight = function (tr) { return tr.getBoundingClientRect().height; };
              var groupHeight = function (group) {
                return group.reduce(function (sum, tr) { return sum + rowHeight(tr); }, 0);
              };

              var rowHeights = rows.map(rowHeight);
              var totalHeight = rowHeights.reduce(function (a, b) { return a + b; }, 0);
              if (totalHeight + footerHeight <= perPageBudget) return null;

              var theadHtml = theadEl.outerHTML;
              var groups = [];
              var current = [];
              var currentHeight = 0;
              rows.forEach(function (tr, i) {
                var h = rowHeights[i];
                if (current.length > 0 && currentHeight + h > perPageBudget) {
                  groups.push(current);
                  current = [];
                  currentHeight = 0;
                }
                current.push(tr);
                currentHeight += h;
              });
              if (current.length > 0) groups.push(current);

              if (groups.length > 0 && footerHeight > 0) {
                var lastGroup = groups[groups.length - 1];
                var moved = [];
                while (lastGroup.length > 0 && groupHeight(lastGroup) + footerHeight > perPageBudget) {
                  moved.unshift(lastGroup.pop());
                }
                if (moved.length > 0) {
                  if (lastGroup.length === 0) {
                    groups[groups.length - 1] = moved;
                  } else {
                    groups.push(moved);
                  }
                }
              }

              var container = document.createElement('div');
              container.id = 'paginated';
              container.innerHTML = groups
                .map(function (group, idx) {
                  var rowsHtml = group.map(function (tr) { return tr.outerHTML; }).join('');
                  var breakStyle = idx < groups.length - 1 ? ' style="page-break-after: always;"' : '';
                  return '<table class="doc-table"' + breakStyle + '>' + theadHtml + '<tbody>' + rowsHtml + '</tbody></table>';
                })
                .join('');

              table.parentNode.replaceChild(container, table);
              return container;
            }

            function waitForImages(container, done) {
              if (!container) return done();
              var imgs = Array.prototype.slice.call(container.querySelectorAll('img'));
              var pending = imgs.filter(function (img) { return !img.complete; });
              if (pending.length === 0) return done();

              var remaining = pending.length;
              var finished = false;
              function finish() {
                if (finished) return;
                finished = true;
                done();
              }
              function check() {
                remaining -= 1;
                if (remaining <= 0) finish();
              }
              pending.forEach(function (img) {
                img.addEventListener('load', check);
                img.addEventListener('error', check);
              });
              setTimeout(finish, 1500);
            }

            window.addEventListener('load', function () {
              var container = paginate();
              waitForImages(container, function () {
                window.focus();
                window.print();
              });
            });
          </script>
        </body>
      </html>
    `
  }

  function handleExport() {
    setFeedback(null)

    if (items.length === 0) {
      setFeedback('Add at least one product to the quotation before exporting.')
      return
    }

    if (!recipientName.trim()) {
      setFeedback('Enter the recipient name before exporting.')
      return
    }

    const popup = window.open('', '_blank', 'width=1120,height=760')

    if (!popup) {
      setFeedback('Allow popups to export the quotation as PDF.')
      return
    }

    popup.document.open()
    popup.document.write(buildQuotationHtml())
    popup.document.close()
  }

  return (
    <AdminShell active="Price Quotation">
      <div className="space-y-6">
        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Quotation details</CardTitle>
            <CardDescription>Recipient and document details shown on the exported PDF.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Quotation No.</p>
              <Input value={quotationNo} onChange={(event) => setQuotationNo(event.target.value)} placeholder="Quotation number" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Date</p>
              <Input type="date" value={quotationDate} onChange={(event) => setQuotationDate(event.target.value)} />
            </div>
            <div className="space-y-2 lg:col-span-1">
              <p className="text-sm font-medium text-foreground">
                Recipient name<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                placeholder="Customer name"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Recipient address</p>
              <Input
                value={recipientAddress}
                onChange={(event) => setRecipientAddress(event.target.value)}
                placeholder="Address"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Selected products ({items.length})</CardTitle>
              <CardDescription>Set description, quantity, rate, and remark for each item.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="h-10 rounded-xl" onClick={openAddDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add product
              </Button>
              <Button onClick={handleExport} className="h-10 rounded-xl">
                <FileDown className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Product</TableHead>
                    <TableHead className="min-w-56">Description</TableHead>
                    <TableHead className="w-20">Qty</TableHead>
                    <TableHead className="w-28">Rate</TableHead>
                    <TableHead className="w-32">Remark</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell className="min-w-40 font-medium">
                        <div className="flex items-center gap-2">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-10 w-10 shrink-0 rounded-lg border border-border/70 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/70 text-muted-foreground">
                              <ImageOff className="h-4 w-4" />
                            </div>
                          )}
                          <span>{item.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Textarea
                          value={item.description}
                          onChange={(event) => updateItem(item.productId, { description: event.target.value })}
                          rows={3}
                          className="min-w-56 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          value={item.qty}
                          onChange={(event) => updateItem(item.productId, { qty: event.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          value={item.rate}
                          onChange={(event) => updateItem(item.productId, { rate: event.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.remark}
                          onChange={(event) => updateItem(item.productId, { remark: event.target.value })}
                          placeholder="e.g. Ready Stock"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNumber(Number(item.qty || 0) * Number(item.rate || 0))}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:text-destructive"
                          onClick={() => removeItem(item.productId)}
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                        No products added yet. Click &quot;Add product&quot; to search the catalog.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
            {items.length > 0 ? (
              <div className="flex justify-end pt-4 text-sm">
                <span>
                  Grand total <strong className="ml-2 text-base">{formatNumber(grandTotal)}</strong>
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Notes &amp; terms</CardTitle>
            <CardDescription>Printed at the bottom of the exported quotation. Edit as needed.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={8} className="font-mono text-xs" />
          </CardContent>
        </Card>
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-4rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add products</DialogTitle>
            <DialogDescription>
              {addMode === 'catalog'
                ? 'Search by name, category, brand, or SKU, then add items to the quotation.'
                : 'Type in a product that is not in the catalog — name, picture, and other details.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={addMode === 'catalog' ? 'default' : 'outline'}
              className="rounded-xl"
              onClick={() => setAddMode('catalog')}
            >
              From catalog
            </Button>
            <Button
              type="button"
              size="sm"
              variant={addMode === 'manual' ? 'default' : 'outline'}
              className="rounded-xl"
              onClick={() => setAddMode('manual')}
            >
              Type manually
            </Button>
          </div>

          {addMode === 'catalog' ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search products"
                  autoFocus
                />
              </div>
              <div className="max-h-[50vh] space-y-2 overflow-y-auto">
                {availableProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.imageUrl} alt={product.name} className="h-12 w-12 shrink-0 rounded-lg border border-border/70 object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/70 text-muted-foreground">
                          <ImageOff className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{product.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {product.brand || product.category || product.sku} · stock {product.stockQty}
                        </p>
                      </div>
                    </div>
                    <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => addProduct(product)} aria-label={`Add ${product.name}`}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {availableProducts.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">No matching products found.</p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {manualError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-500/10 p-3 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
                  {manualError}
                </p>
              ) : null}
              <div className="flex gap-4">
                <div className="shrink-0">
                  {manualImagePreview ? (
                    <div className="relative h-20 w-20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={manualImagePreview}
                        alt="Product preview"
                        className="h-20 w-20 rounded-lg border border-border/70 object-cover"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveManualImage}
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground shadow-sm"
                        aria-label="Remove image"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/70 text-muted-foreground hover:border-primary/50 hover:text-primary">
                      <ImageOff className="h-5 w-5" />
                      <span className="text-[10px] font-medium">Add photo</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleManualImageChange} />
                    </label>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Product name<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    value={manualForm.name}
                    onChange={(event) => setManualForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="e.g. Hydraulic Jack"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Description</p>
                <Textarea
                  value={manualForm.description}
                  onChange={(event) => setManualForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Short description shown on the quotation"
                  rows={2}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Qty</p>
                  <Input
                    type="number"
                    min="0"
                    value={manualForm.qty}
                    onChange={(event) => setManualForm((current) => ({ ...current, qty: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Rate</p>
                  <Input
                    type="number"
                    min="0"
                    value={manualForm.rate}
                    onChange={(event) => setManualForm((current) => ({ ...current, rate: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Remark</p>
                  <Input
                    value={manualForm.remark}
                    onChange={(event) => setManualForm((current) => ({ ...current, remark: event.target.value }))}
                    placeholder="e.g. Ready Stock"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="button" className="rounded-xl" onClick={() => void handleAddManualItem()} disabled={manualSaving}>
                  {manualSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding…
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Add to quotation
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

"use client"

import { useMemo, useState } from 'react'
import { Package, Pencil, Plus, Search, Trash2, Truck, Users, Wallet } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { ExportMenu } from '@/components/admin/ExportMenu'
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
import type { PackagingConversionRecord, PurchaseRecord, VendorPaymentRecord, VendorRecord } from '@/lib/erp/types'
import {
  computePackagingConversion,
  computeVendorPurchasedQty,
  computeVendorTotals,
  formatCurrency,
  formatDate,
  sortByCreatedAtDesc,
  toArray,
} from '@/lib/erp/utils'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

const emptyVendorForm = { name: '', address: '', phone: '' }
type VendorFormState = typeof emptyVendorForm

const emptyPurchaseForm = {
  vendorId: '',
  productId: '',
  date: todayIso(),
  quantity: '',
  rate: '',
  paid: '0',
  remarks: '',
}
type PurchaseFormState = typeof emptyPurchaseForm

const emptyPaymentForm = { vendorId: '', amount: '', date: todayIso(), method: 'cash', remarks: '' }
type PaymentFormState = typeof emptyPaymentForm

const emptyConversionForm = { productId: '', packetWeightGrams: '', unitsPerCarton: '', cartonLabel: 'Carton' }
type ConversionFormState = typeof emptyConversionForm

export default function PurchasesPage() {
  const {
    data,
    saveVendor,
    deleteVendor,
    savePurchase,
    deletePurchase,
    saveVendorPayment,
    deleteVendorPayment,
    savePackagingConversion,
    deletePackagingConversion,
  } = useERP()

  const currency = data?.settings.currency
  const vendors = useMemo(() => sortByCreatedAtDesc(toArray(data?.vendors)), [data?.vendors])
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const purchases = useMemo(() => sortByCreatedAtDesc(toArray(data?.purchases)), [data?.purchases])
  const vendorPayments = useMemo(() => sortByCreatedAtDesc(toArray(data?.vendorPayments)), [data?.vendorPayments])
  const conversions = useMemo(() => toArray(data?.packagingConversions), [data?.packagingConversions])

  const vendorOptions: ComboboxOption[] = useMemo(
    () => vendors.map((vendor) => ({ value: vendor.id, label: vendor.name, sublabel: vendor.phone })),
    [vendors]
  )
  const productOptions: ComboboxOption[] = useMemo(
    () => products.map((product) => ({ value: product.id, label: product.name, sublabel: product.unit || product.category })),
    [products]
  )

  // ---- Vendors ------------------------------------------------------------
  const [vendorQuery, setVendorQuery] = useState('')
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false)
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null)
  const [vendorForm, setVendorForm] = useState<VendorFormState>(emptyVendorForm)
  const [vendorSaving, setVendorSaving] = useState(false)
  const [vendorError, setVendorError] = useState<string | null>(null)

  const filteredVendors = useMemo(() => {
    const normalized = vendorQuery.trim().toLowerCase()
    if (!normalized) return vendors
    return vendors.filter((vendor) => [vendor.name, vendor.phone, vendor.address].join(' ').toLowerCase().includes(normalized))
  }, [vendors, vendorQuery])

  function openCreateVendor() {
    setEditingVendorId(null)
    setVendorForm(emptyVendorForm)
    setVendorError(null)
    setVendorDialogOpen(true)
  }

  function openEditVendor(vendor: VendorRecord) {
    setEditingVendorId(vendor.id)
    setVendorForm({ name: vendor.name, address: vendor.address, phone: vendor.phone })
    setVendorError(null)
    setVendorDialogOpen(true)
  }

  async function handleSaveVendor() {
    setVendorError(null)
    setVendorSaving(true)
    try {
      await saveVendor(vendorForm, editingVendorId ?? undefined)
      setVendorDialogOpen(false)
    } catch (reason) {
      setVendorError(reason instanceof Error ? reason.message : 'Unable to save vendor.')
    } finally {
      setVendorSaving(false)
    }
  }

  async function handleDeleteVendor(vendor: VendorRecord) {
    try {
      await deleteVendor(vendor.id)
    } catch (reason) {
      setVendorError(reason instanceof Error ? reason.message : 'Unable to delete vendor.')
    }
  }

  // ---- Purchase Entries -----------------------------------------------------
  const [purchaseQuery, setPurchaseQuery] = useState('')
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false)
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null)
  const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(emptyPurchaseForm)
  const [purchaseSaving, setPurchaseSaving] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)

  const filteredPurchases = useMemo(() => {
    const normalized = purchaseQuery.trim().toLowerCase()
    if (!normalized) return purchases
    return purchases.filter((purchase) =>
      [purchase.purchaseNumber, purchase.vendorName, purchase.productName].join(' ').toLowerCase().includes(normalized)
    )
  }, [purchases, purchaseQuery])

  const purchaseQuantity = Number(purchaseForm.quantity) || 0
  const purchaseRate = Number(purchaseForm.rate) || 0
  const purchaseAmount = purchaseQuantity * purchaseRate
  const purchasePaid = Math.min(Math.max(Number(purchaseForm.paid) || 0, 0), purchaseAmount)
  const purchaseDue = purchaseAmount - purchasePaid

  function openCreatePurchase() {
    setEditingPurchaseId(null)
    setPurchaseForm(emptyPurchaseForm)
    setPurchaseError(null)
    setPurchaseDialogOpen(true)
  }

  function openEditPurchase(purchase: PurchaseRecord) {
    setEditingPurchaseId(purchase.id)
    setPurchaseForm({
      vendorId: purchase.vendorId,
      productId: purchase.productId,
      date: purchase.date,
      quantity: String(purchase.quantity),
      rate: String(purchase.rate),
      paid: String(purchase.paid),
      remarks: purchase.remarks ?? '',
    })
    setPurchaseError(null)
    setPurchaseDialogOpen(true)
  }

  async function handleSavePurchase() {
    setPurchaseError(null)
    if (!purchaseForm.vendorId) {
      setPurchaseError('Pick a vendor.')
      return
    }
    if (!purchaseForm.productId) {
      setPurchaseError('Pick a product/material.')
      return
    }
    setPurchaseSaving(true)
    try {
      await savePurchase(
        {
          vendorId: purchaseForm.vendorId,
          productId: purchaseForm.productId,
          date: purchaseForm.date,
          quantity: purchaseQuantity,
          rate: purchaseRate,
          paid: purchasePaid,
          remarks: purchaseForm.remarks || undefined,
        },
        editingPurchaseId ?? undefined
      )
      setPurchaseDialogOpen(false)
    } catch (reason) {
      setPurchaseError(reason instanceof Error ? reason.message : 'Unable to save purchase.')
    } finally {
      setPurchaseSaving(false)
    }
  }

  async function handleDeletePurchase(purchase: PurchaseRecord) {
    try {
      await deletePurchase(purchase.id)
    } catch (reason) {
      setPurchaseError(reason instanceof Error ? reason.message : 'Unable to delete purchase.')
    }
  }

  // ---- Vendor Payments ------------------------------------------------------
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>(emptyPaymentForm)
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  function openCreatePayment(vendorId?: string) {
    setPaymentForm({ ...emptyPaymentForm, vendorId: vendorId ?? '' })
    setPaymentError(null)
    setPaymentDialogOpen(true)
  }

  async function handleSavePayment() {
    setPaymentError(null)
    if (!paymentForm.vendorId) {
      setPaymentError('Pick a vendor.')
      return
    }
    const amount = Number(paymentForm.amount) || 0
    if (amount <= 0) {
      setPaymentError('Payment amount must be greater than zero.')
      return
    }
    setPaymentSaving(true)
    try {
      await saveVendorPayment({
        vendorId: paymentForm.vendorId,
        amount,
        date: paymentForm.date,
        method: paymentForm.method,
        remarks: paymentForm.remarks || undefined,
      })
      setPaymentDialogOpen(false)
    } catch (reason) {
      setPaymentError(reason instanceof Error ? reason.message : 'Unable to record payment.')
    } finally {
      setPaymentSaving(false)
    }
  }

  async function handleDeletePayment(payment: VendorPaymentRecord) {
    try {
      await deleteVendorPayment(payment.id)
    } catch (reason) {
      setPaymentError(reason instanceof Error ? reason.message : 'Unable to delete payment.')
    }
  }

  // ---- Packaging / HK Conversion Report --------------------------------------
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false)
  const [editingConversionId, setEditingConversionId] = useState<string | null>(null)
  const [conversionForm, setConversionForm] = useState<ConversionFormState>(emptyConversionForm)
  const [conversionSaving, setConversionSaving] = useState(false)
  const [conversionError, setConversionError] = useState<string | null>(null)

  function openCreateConversion() {
    setEditingConversionId(null)
    setConversionForm(emptyConversionForm)
    setConversionError(null)
    setConversionDialogOpen(true)
  }

  function openEditConversion(record: PackagingConversionRecord) {
    setEditingConversionId(record.id)
    setConversionForm({
      productId: record.productId,
      packetWeightGrams: String(record.packetWeightGrams),
      unitsPerCarton: String(record.unitsPerCarton),
      cartonLabel: record.cartonLabel,
    })
    setConversionError(null)
    setConversionDialogOpen(true)
  }

  async function handleSaveConversion() {
    setConversionError(null)
    if (!conversionForm.productId) {
      setConversionError('Pick a product.')
      return
    }
    setConversionSaving(true)
    try {
      await savePackagingConversion(
        {
          productId: conversionForm.productId,
          packetWeightGrams: Number(conversionForm.packetWeightGrams) || 0,
          unitsPerCarton: Number(conversionForm.unitsPerCarton) || undefined,
          cartonLabel: conversionForm.cartonLabel || undefined,
        },
        editingConversionId ?? undefined
      )
      setConversionDialogOpen(false)
    } catch (reason) {
      setConversionError(reason instanceof Error ? reason.message : 'Unable to save packaging conversion.')
    } finally {
      setConversionSaving(false)
    }
  }

  async function handleDeleteConversion(record: PackagingConversionRecord) {
    try {
      await deletePackagingConversion(record.id)
    } catch (reason) {
      setConversionError(reason instanceof Error ? reason.message : 'Unable to delete packaging conversion.')
    }
  }

  // ---- Summary --------------------------------------------------------------
  const totalPurchaseAmount = purchases.reduce((sum, purchase) => sum + purchase.amount, 0)
  const totalPaid = purchases.reduce((sum, purchase) => sum + purchase.paid, 0) + vendorPayments.reduce((sum, payment) => sum + payment.amount, 0)
  const totalDue = totalPurchaseAmount - totalPaid

  return (
    <AdminShell active="Purchase">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Vendors</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{vendors.length.toLocaleString('en-BD')}</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Purchase entries</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{purchases.length.toLocaleString('en-BD')}</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total purchase amount</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{formatCurrency(totalPurchaseAmount, currency)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Outstanding due to vendors</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">{formatCurrency(totalDue, currency)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Vendors */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4.5 w-4.5" /> Vendors
              </CardTitle>
              <CardDescription>
                Who you buy raw material/packaging material from — how much has been purchased, paid, and what&apos;s
                still due.
              </CardDescription>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={vendorQuery}
                  onChange={(event) => setVendorQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search vendor"
                />
              </div>
              <Button onClick={openCreateVendor}>
                <Plus className="mr-2 h-4 w-4" /> Add Vendor
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {vendorError ? <p className="mb-3 text-sm text-destructive">{vendorError}</p> : null}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">Purchased Qty</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendors.map((vendor) => {
                    const totals = computeVendorTotals(data ?? null, vendor.id)
                    return (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">{vendor.name}</TableCell>
                        <TableCell>{vendor.phone}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-muted-foreground">{vendor.address}</TableCell>
                        <TableCell className="text-right tabular-nums">{totals.totalQuantity.toLocaleString('en-BD')}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(totals.totalAmount, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(totals.totalPaid, currency)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {totals.due > 0 ? (
                            <Badge variant="outline" className="border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300">
                              {formatCurrency(totals.due, currency)}
                            </Badge>
                          ) : totals.due < 0 ? (
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">
                              Credit {formatCurrency(Math.abs(totals.due), currency)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">Settled</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                Actions
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openCreatePayment(vendor.id)}>
                                <Wallet className="mr-2 h-4 w-4" /> Record payment
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditVendor(vendor)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteVendor(vendor)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {filteredVendors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                        <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        No vendors yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Purchase Entries */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-4.5 w-4.5" /> Purchase Entries
              </CardTitle>
              <CardDescription>
                How much (kg or other unit) was bought from a vendor, at what rate — after depot/factory receives it.
              </CardDescription>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={purchaseQuery}
                  onChange={(event) => setPurchaseQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search purchase no, vendor, product"
                />
              </div>
              <ExportMenu
                filenameBase="purchases"
                title="Purchase Entries"
                headers={['Purchase No', 'Vendor', 'Product', 'Date', 'Qty', 'Rate', 'Amount', 'Paid', 'Due']}
                rows={filteredPurchases.map((purchase) => [
                  purchase.purchaseNumber,
                  purchase.vendorName,
                  purchase.productName,
                  purchase.date,
                  purchase.quantity,
                  purchase.rate,
                  purchase.amount,
                  purchase.paid,
                  purchase.due,
                ])}
              />
              <Button onClick={openCreatePurchase}>
                <Plus className="mr-2 h-4 w-4" /> Record Purchase
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {purchaseError ? <p className="mb-3 text-sm text-destructive">{purchaseError}</p> : null}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Purchase No</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
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
                      <TableCell>{purchase.productName}</TableCell>
                      <TableCell>{formatDate(purchase.date)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {purchase.quantity.toLocaleString('en-BD')} {purchase.unit ?? ''}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(purchase.rate, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(purchase.amount, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(purchase.paid, currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(purchase.due, currency)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Actions
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditPurchase(purchase)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
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
                      <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
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

        {/* Vendor Payments */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-4.5 w-4.5" /> Vendor Payments
              </CardTitle>
              <CardDescription>Money handed to a vendor after the purchase, against their running due.</CardDescription>
            </div>
            <Button onClick={() => openCreatePayment()}>
              <Plus className="mr-2 h-4 w-4" /> Record Payment
            </Button>
          </CardHeader>
          <CardContent>
            {paymentError ? <p className="mb-3 text-sm text-destructive">{paymentError}</p> : null}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendorPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">{payment.vendorName}</TableCell>
                      <TableCell>{formatDate(payment.date)}</TableCell>
                      <TableCell className="capitalize">{payment.method || '—'}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground">{payment.remarks || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(payment.amount, currency)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeletePayment(payment)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {vendorPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        <Wallet className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        No vendor payments recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Packaging / HK Conversion Report */}
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4.5 w-4.5" /> Packaging / HK Conversion Report
              </CardTitle>
              <CardDescription>
                How much raw material has been purchased for a product, and how many packets/cartons that converts
                to at the packet weight below — e.g. 100kg at 3g/packet = 33,333 packets, 500 packets per sack = ~66.7
                sacks. A planning report only — it doesn&apos;t move stock.
              </CardDescription>
            </div>
            <Button onClick={openCreateConversion}>
              <Plus className="mr-2 h-4 w-4" /> Add Conversion
            </Button>
          </CardHeader>
          <CardContent>
            {conversionError ? <p className="mb-3 text-sm text-destructive">{conversionError}</p> : null}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Total Purchased (kg)</TableHead>
                    <TableHead className="text-right">Packet Weight (g)</TableHead>
                    <TableHead className="text-right">Est. Packets</TableHead>
                    <TableHead className="text-right">Units / Carton</TableHead>
                    <TableHead className="text-right">Est. Cartons</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conversions.map((record) => {
                    const purchasedQty = computeVendorPurchasedQty(data ?? null, record.productId)
                    const { pieces, cartons } = computePackagingConversion(purchasedQty, record)
                    return (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.productName}</TableCell>
                        <TableCell className="text-right tabular-nums">{purchasedQty.toLocaleString('en-BD')}</TableCell>
                        <TableCell className="text-right tabular-nums">{record.packetWeightGrams}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pieces.toLocaleString('en-BD', { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {record.unitsPerCarton} / {record.cartonLabel}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {cartons.toLocaleString('en-BD', { maximumFractionDigits: 1 })}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                Actions
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditConversion(record)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteConversion(record)}>
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {conversions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        No packaging conversions set up yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Vendor dialog */}
      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingVendorId ? 'Edit vendor' : 'Add vendor'}</DialogTitle>
            <DialogDescription>Name, address and phone number — nothing more.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {vendorError ? <p className="text-sm text-destructive">{vendorError}</p> : null}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Vendor name</label>
              <Input value={vendorForm.name} onChange={(event) => setVendorForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input value={vendorForm.phone} onChange={(event) => setVendorForm((current) => ({ ...current, phone: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Address</label>
              <Textarea
                value={vendorForm.address}
                onChange={(event) => setVendorForm((current) => ({ ...current, address: event.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveVendor} disabled={vendorSaving}>
              {vendorSaving ? 'Saving…' : 'Save vendor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase dialog */}
      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPurchaseId ? 'Edit purchase' : 'Record purchase'}</DialogTitle>
            <DialogDescription>Quantity bought from a vendor at a given rate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {purchaseError ? <p className="text-sm text-destructive">{purchaseError}</p> : null}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Vendor</label>
              <Combobox
                options={vendorOptions}
                value={purchaseForm.vendorId}
                onChange={(value) => setPurchaseForm((current) => ({ ...current, vendorId: value }))}
                placeholder="Select vendor"
                searchPlaceholder="Search vendor"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Product / material</label>
              <Combobox
                options={productOptions}
                value={purchaseForm.productId}
                onChange={(value) => setPurchaseForm((current) => ({ ...current, productId: value }))}
                placeholder="Select product"
                searchPlaceholder="Search product"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input type="date" value={purchaseForm.date} onChange={(event) => setPurchaseForm((current) => ({ ...current, date: event.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Quantity (kg)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchaseForm.quantity}
                  onChange={(event) => setPurchaseForm((current) => ({ ...current, quantity: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Rate (per unit)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchaseForm.rate}
                  onChange={(event) => setPurchaseForm((current) => ({ ...current, rate: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Paid now</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchaseForm.paid}
                  onChange={(event) => setPurchaseForm((current) => ({ ...current, paid: event.target.value }))}
                />
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">{formatCurrency(purchaseAmount, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due</span>
                <span className="font-medium">{formatCurrency(purchaseDue, currency)}</span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Remarks</label>
              <Textarea
                value={purchaseForm.remarks}
                onChange={(event) => setPurchaseForm((current) => ({ ...current, remarks: event.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurchaseDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePurchase} disabled={purchaseSaving}>
              {purchaseSaving ? 'Saving…' : 'Save purchase'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record vendor payment</DialogTitle>
            <DialogDescription>Reduces the vendor&apos;s running due.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {paymentError ? <p className="text-sm text-destructive">{paymentError}</p> : null}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Vendor</label>
              <Combobox
                options={vendorOptions}
                value={paymentForm.vendorId}
                onChange={(value) => setPaymentForm((current) => ({ ...current, vendorId: value }))}
                placeholder="Select vendor"
                searchPlaceholder="Search vendor"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Amount</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input type="date" value={paymentForm.date} onChange={(event) => setPaymentForm((current) => ({ ...current, date: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Method</label>
              <Input
                value={paymentForm.method}
                onChange={(event) => setPaymentForm((current) => ({ ...current, method: event.target.value }))}
                placeholder="cash / bank / mfs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Remarks</label>
              <Textarea
                value={paymentForm.remarks}
                onChange={(event) => setPaymentForm((current) => ({ ...current, remarks: event.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePayment} disabled={paymentSaving}>
              {paymentSaving ? 'Saving…' : 'Save payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conversion dialog */}
      <Dialog open={conversionDialogOpen} onOpenChange={setConversionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingConversionId ? 'Edit packaging conversion' : 'Add packaging conversion'}</DialogTitle>
            <DialogDescription>How a purchased kg quantity converts into packets and cartons/sacks.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {conversionError ? <p className="text-sm text-destructive">{conversionError}</p> : null}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Product</label>
              <Combobox
                options={productOptions}
                value={conversionForm.productId}
                onChange={(value) => setConversionForm((current) => ({ ...current, productId: value }))}
                placeholder="Select product"
                searchPlaceholder="Search product"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Packet weight (g)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={conversionForm.packetWeightGrams}
                  onChange={(event) => setConversionForm((current) => ({ ...current, packetWeightGrams: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Units per carton/sack</label>
                <Input
                  type="number"
                  min="1"
                  value={conversionForm.unitsPerCarton}
                  onChange={(event) => setConversionForm((current) => ({ ...current, unitsPerCarton: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Bigger-unit label</label>
              <Input
                value={conversionForm.cartonLabel}
                onChange={(event) => setConversionForm((current) => ({ ...current, cartonLabel: event.target.value }))}
                placeholder="Carton / Sack / Bottle case"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConversionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConversion} disabled={conversionSaving}>
              {conversionSaving ? 'Saving…' : 'Save conversion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

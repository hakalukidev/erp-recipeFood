"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Edit, Eye, MapPin, Phone, Plus, Search, Trash2 } from 'lucide-react'

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
import type { SellerInput, SellerRecord, SellerTransactionInput } from '@/lib/erp/types'
import { exportPdf, exportXlsx, formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type SellerFormState = {
  name: string
  phone: string
  location: string
  notes: string
}

const emptySellerForm: SellerFormState = { name: '', phone: '', location: '', notes: '' }

type TransactionFormState = {
  sellerId: string
  date: string
  productName: string
  quantity: string
  takenValue: string
  cashGiven: string
  givenValue: string
  cashReceived: string
  goodsBroughtDescription: string
}

function emptyTransactionForm(sellerId: string): TransactionFormState {
  return {
    sellerId,
    date: new Date().toISOString().slice(0, 10),
    productName: '',
    quantity: '',
    takenValue: '0',
    cashGiven: '0',
    givenValue: '0',
    cashReceived: '0',
    goodsBroughtDescription: '',
  }
}

function formFromSeller(seller: SellerRecord): SellerFormState {
  return {
    name: seller.name,
    phone: seller.phone,
    location: seller.location,
    notes: seller.notes,
  }
}

export default function SellerListPage() {
  const { data, saveSeller, deleteSeller, recordSellerTransaction, deleteSellerTransaction } = useERP()
  const currency = data?.settings.currency
  const sellers = useMemo(() => toArray(data?.sellers), [data?.sellers])
  const transactions = useMemo(() => toArray(data?.sellerTransactions), [data?.sellerTransactions])

  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSeller, setEditingSeller] = useState<SellerRecord | null>(null)
  const [sellerForm, setSellerForm] = useState<SellerFormState>(emptySellerForm)
  const [txnDialogOpen, setTxnDialogOpen] = useState(false)
  const [txnForm, setTxnForm] = useState<TransactionFormState>(emptyTransactionForm(''))
  const [feedback, setFeedback] = useState<string | null>(null)
  const [detailsSeller, setDetailsSeller] = useState<SellerRecord | null>(null)
  const [historyRange, setHistoryRange] = useState<'30d' | 'all'>('30d')

  const sellerRows = useMemo(() => {
    return sellers
      .map((seller) => {
        const sellerTransactions = transactions
          .filter((txn) => txn.sellerId === seller.id)
          .sort((left, right) => right.date.localeCompare(left.date))
        // Net taken-vs-given across every entry first, then split into a single
        // receivable/payable figure so entries can't inflate both sides at once.
        const netBalance = sellerTransactions.reduce(
          (sum, txn) => sum + txn.theyReceiveAmount - txn.iReceiveAmount,
          0
        )
        const owedToMe = netBalance < 0 ? Math.abs(netBalance) : 0
        const owedByMe = netBalance > 0 ? netBalance : 0

        return { seller, sellerTransactions, owedToMe, owedByMe, hasTransactions: sellerTransactions.length > 0 }
      })
      .sort((left, right) => left.seller.name.localeCompare(right.seller.name))
  }, [sellers, transactions])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return sellerRows

    return sellerRows.filter(({ seller }) =>
      [seller.name, seller.phone, seller.location].join(' ').toLowerCase().includes(normalizedQuery)
    )
  }, [sellerRows, query])

  const metrics = useMemo(() => {
    return {
      totalSellers: sellers.length,
      owedToMe: sellerRows.reduce((sum, row) => sum + row.owedToMe, 0),
      owedByMe: sellerRows.reduce((sum, row) => sum + row.owedByMe, 0),
      totalTransactions: transactions.length,
    }
  }, [sellerRows, sellers.length, transactions.length])

  const filteredSellerIds = useMemo(() => new Set(filteredRows.map((row) => row.seller.id)), [filteredRows])

  const ledgerRows = useMemo(() => {
    return transactions
      .slice()
      .sort((left, right) => right.date.localeCompare(left.date))
      .map((txn, index) => ({ serial: transactions.length - index, txn }))
      .filter(({ txn }) => filteredSellerIds.has(txn.sellerId))
  }, [transactions, filteredSellerIds])

  const detailsTransactions = useMemo(() => {
    if (!detailsSeller) return []

    const sellerTxns = transactions
      .filter((txn) => txn.sellerId === detailsSeller.id)
      .sort((left, right) => right.date.localeCompare(left.date))

    if (historyRange === 'all') return sellerTxns

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    return sellerTxns.filter((txn) => new Date(txn.date) >= cutoff)
  }, [transactions, detailsSeller, historyRange])

  const detailsProductSummary = useMemo(() => {
    const totals = new Map<string, { productName: string; quantity: number; amount: number }>()

    detailsTransactions.forEach((txn) => {
      if (!txn.productName) return
      const existing = totals.get(txn.productName) ?? { productName: txn.productName, quantity: 0, amount: 0 }
      existing.quantity += txn.quantity
      existing.amount += txn.takenValue || txn.givenValue
      totals.set(txn.productName, existing)
    })

    return Array.from(totals.values()).sort((left, right) => right.amount - left.amount)
  }, [detailsTransactions])

  function openCreateDialog() {
    setEditingSeller(null)
    setSellerForm(emptySellerForm)
    setFeedback(null)
    setDialogOpen(true)
  }

  function openEditDialog(seller: SellerRecord) {
    setEditingSeller(seller)
    setSellerForm(formFromSeller(seller))
    setFeedback(null)
    setDialogOpen(true)
  }

  function openTransactionDialog(sellerId: string) {
    setTxnForm(emptyTransactionForm(sellerId))
    setFeedback(null)
    setTxnDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const input: SellerInput = {
      name: sellerForm.name,
      phone: sellerForm.phone,
      location: sellerForm.location,
      notes: sellerForm.notes,
    }

    try {
      await saveSeller(input, editingSeller?.id)
      setDialogOpen(false)
      setSellerForm(emptySellerForm)
      setEditingSeller(null)
      setFeedback(editingSeller ? 'Seller details updated.' : 'New seller added.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save seller.')
    }
  }

  async function handleDelete(seller: SellerRecord) {
    setFeedback(null)

    try {
      await deleteSeller(seller.id)
      setFeedback(`${seller.name} removed from seller list.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete seller.')
    }
  }

  async function handleTransactionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    // Net effect (positive = we owe them, negative = they owe us): goods we
    // took from them or cash they paid us push it toward "we owe them"; cash
    // we paid them or goods we gave them pull it toward "they owe us".
    const net =
      Number(txnForm.takenValue || 0) -
      Number(txnForm.cashGiven || 0) -
      Number(txnForm.givenValue || 0) +
      Number(txnForm.cashReceived || 0)

    const input: SellerTransactionInput = {
      sellerId: txnForm.sellerId,
      date: txnForm.date,
      productName: txnForm.productName,
      quantity: Number(txnForm.quantity || 0),
      takenValue: Number(txnForm.takenValue),
      cashGiven: Number(txnForm.cashGiven),
      givenValue: Number(txnForm.givenValue),
      cashReceived: Number(txnForm.cashReceived),
      goodsBroughtDescription: txnForm.goodsBroughtDescription,
      iReceiveAmount: net < 0 ? Math.abs(net) : 0,
      theyReceiveAmount: net > 0 ? net : 0,
    }

    try {
      await recordSellerTransaction(input)
      setTxnDialogOpen(false)
      setFeedback('Ledger entry recorded.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record ledger entry.')
    }
  }

  async function handleDeleteTransaction(transactionId: string) {
    setFeedback(null)

    try {
      await deleteSellerTransaction(transactionId)
      setFeedback('Ledger entry removed.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to remove ledger entry.')
    }
  }

  function handleExportXlsx() {
    void exportXlsx(
      'seller-ledger.xlsx',
      'Seller Ledger',
      [
        'Serial',
        'Date',
        'Seller',
        'Phone',
        'Product',
        'Quantity',
        'Taken',
        'Cash given',
        'Goods given',
        'Cash received',
        'I receive',
        'They receive',
      ],
      ledgerRows.map(({ serial, txn }) => [
        serial,
        formatDate(txn.date),
        txn.sellerName,
        sellers.find((seller) => seller.id === txn.sellerId)?.phone ?? '',
        txn.productName,
        txn.quantity,
        txn.takenValue,
        txn.cashGiven,
        txn.givenValue,
        txn.cashReceived,
        txn.iReceiveAmount,
        txn.theyReceiveAmount,
      ])
    )
  }

  function handleExportPdf() {
    void exportPdf(
      'seller-ledger.pdf',
      'Seller Ledger',
      [
        'Serial',
        'Date',
        'Seller',
        'Product',
        'Quantity',
        'Taken',
        'Cash given',
        'Goods given',
        'Cash received',
        'I receive',
        'They receive',
      ],
      ledgerRows.map(({ serial, txn }) => [
        serial,
        formatDate(txn.date),
        txn.sellerName,
        txn.productName,
        txn.quantity,
        txn.takenValue,
        txn.cashGiven,
        txn.givenValue,
        txn.cashReceived,
        txn.iReceiveAmount,
        txn.theyReceiveAmount,
      ])
    )
  }

  return (
    <AdminShell active="Seller List">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Sellers', metrics.totalSellers.toLocaleString('en-BD'), 'Sub-dealer / consignment partners'],
            ['I receive', formatCurrency(metrics.owedToMe, currency), 'Owed to us across sellers'],
            ['They receive', formatCurrency(metrics.owedByMe, currency), 'We owe sellers'],
            ['Ledger entries', metrics.totalTransactions.toLocaleString('en-BD'), 'Recorded transactions'],
          ].map(([label, value, note]) => (
            <Card key={label} className="border-border/70 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Sellers</CardTitle>
              <CardDescription>Search by name, phone, or location.</CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search sellers"
                />
              </div>
              <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Add seller
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Seller</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>I receive</TableHead>
                    <TableHead>They receive</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map(({ seller, owedToMe, owedByMe, hasTransactions }) => (
                    <TableRow
                      key={seller.id}
                      className={cn(owedToMe > 0 || owedByMe > 0 ? 'bg-rose-500/5 dark:bg-rose-500/10' : '')}
                    >
                      <TableCell className="min-w-48">
                        <p className="font-semibold">{seller.name}</p>
                        <p className="text-xs text-muted-foreground">{seller.notes || 'No notes'}</p>
                      </TableCell>
                      <TableCell className="min-w-40">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{seller.phone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-40">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{seller.location || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell className={cn(owedToMe > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : '')}>
                        {formatCurrency(owedToMe, currency)}
                      </TableCell>
                      <TableCell className={cn(owedByMe > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : '')}>
                        {formatCurrency(owedByMe, currency)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" className="h-9 rounded-lg px-3 text-xs" onClick={() => openTransactionDialog(seller.id)}>
                            Add entry
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => {
                              setDetailsSeller(seller)
                              setHistoryRange('30d')
                            }}
                            aria-label={`View transaction history for ${seller.name}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditDialog(seller)} aria-label={`Edit ${seller.name}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(seller)}
                            disabled={hasTransactions}
                            aria-label={`Delete ${seller.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                        No sellers found.
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
              <CardTitle>Ledger</CardTitle>
              <CardDescription>Serial, date, seller, taken, given, receivable and payable.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-xl" onClick={handleExportXlsx}>
                Export Excel
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={handleExportPdf}>
                Export PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Serial</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Seller</TableHead>
                    <TableHead>Taken (I taken)</TableHead>
                    <TableHead>Cash given (I given)</TableHead>
                    <TableHead>Goods given</TableHead>
                    <TableHead>Cash received</TableHead>
                    <TableHead>I receive</TableHead>
                    <TableHead>They receive</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerRows.map(({ serial, txn }) => (
                    <TableRow
                      key={txn.id}
                      className={cn(
                        txn.iReceiveAmount > 0 || txn.theyReceiveAmount > 0 ? 'bg-rose-500/5 dark:bg-rose-500/10' : ''
                      )}
                    >
                      <TableCell>{serial}</TableCell>
                      <TableCell>{formatDate(txn.date)}</TableCell>
                      <TableCell className="min-w-40">{txn.sellerName}</TableCell>
                      <TableCell className="min-w-48 text-xs text-muted-foreground">
                        {txn.productName ? `${txn.quantity ? `${txn.quantity} x ` : ''}${txn.productName}` : '-'}
                        {txn.takenValue ? <p className="font-medium text-foreground">{formatCurrency(txn.takenValue, currency)}</p> : null}
                      </TableCell>
                      <TableCell>{formatCurrency(txn.cashGiven, currency)}</TableCell>
                      <TableCell>{formatCurrency(txn.givenValue, currency)}</TableCell>
                      <TableCell>{formatCurrency(txn.cashReceived, currency)}</TableCell>
                      <TableCell>{formatCurrency(txn.iReceiveAmount, currency)}</TableCell>
                      <TableCell>{formatCurrency(txn.theyReceiveAmount, currency)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => void handleDeleteTransaction(txn.id)}
                            aria-label="Delete entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {ledgerRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                        No ledger entries yet.
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSeller ? 'Edit seller' : 'Add new seller'}</DialogTitle>
            <DialogDescription>Sub-dealers and consignment partners who both buy from and sell to us.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Seller name<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Input
                  value={sellerForm.name}
                  onChange={(event) => setSellerForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Rahim Enterprise"
                  required
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Phone number<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Input
                  value={sellerForm.phone}
                  onChange={(event) => setSellerForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="e.g. 01711-000000"
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <p className="text-sm font-medium text-foreground">
                  Location <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <Input
                  value={sellerForm.location}
                  onChange={(event) => setSellerForm((current) => ({ ...current, location: event.target.value }))}
                  placeholder="e.g. Chattogram"
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Textarea
                value={sellerForm.notes}
                onChange={(event) => setSellerForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Anything worth remembering about this seller"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                {editingSeller ? 'Update seller' : 'Save seller'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={txnDialogOpen} onOpenChange={setTxnDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add ledger entry</DialogTitle>
            <DialogDescription>
              Works both ways — record what you took from them or gave them, in goods or cash, and the balance
              updates itself.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleTransactionSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Date<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Input
                  type="date"
                  value={txnForm.date}
                  onChange={(event) => setTxnForm((current) => ({ ...current, date: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Product name <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <Input
                  value={txnForm.productName}
                  onChange={(event) => setTxnForm((current) => ({ ...current, productName: event.target.value }))}
                  placeholder="e.g. Polo Shirt"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Quantity <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <Input
                  type="number"
                  min="0"
                  value={txnForm.quantity}
                  onChange={(event) => setTxnForm((current) => ({ ...current, quantity: event.target.value }))}
                  placeholder="e.g. 10"
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Goods returned by seller <span className="font-normal text-muted-foreground">(optional)</span>
                </p>
                <Input
                  value={txnForm.goodsBroughtDescription}
                  onChange={(event) =>
                    setTxnForm((current) => ({ ...current, goodsBroughtDescription: event.target.value }))
                  }
                  placeholder="e.g. 2 x Polo Shirt returned unsold"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-4 rounded-2xl border border-border/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  From them to us (they&apos;re the supplier)
                </p>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Value of goods taken — I taken ({currency ?? 'BDT'})</p>
                  <Input
                    type="number"
                    min="0"
                    value={txnForm.takenValue}
                    onChange={(event) => setTxnForm((current) => ({ ...current, takenValue: event.target.value }))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">Adds to the balance you owe the seller.</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Cash given to seller — I given ({currency ?? 'BDT'})</p>
                  <Input
                    type="number"
                    min="0"
                    value={txnForm.cashGiven}
                    onChange={(event) => setTxnForm((current) => ({ ...current, cashGiven: event.target.value }))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">Pays down the balance you owe the seller.</p>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-border/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  From us to them (they&apos;re our dealer)
                </p>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Value of goods given ({currency ?? 'BDT'})</p>
                  <Input
                    type="number"
                    min="0"
                    value={txnForm.givenValue}
                    onChange={(event) => setTxnForm((current) => ({ ...current, givenValue: event.target.value }))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">Adds to the balance the seller owes you.</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Cash received from seller ({currency ?? 'BDT'})</p>
                  <Input
                    type="number"
                    min="0"
                    value={txnForm.cashReceived}
                    onChange={(event) => setTxnForm((current) => ({ ...current, cashReceived: event.target.value }))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">Pays down the balance the seller owes you.</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
              <span className="text-muted-foreground">Net effect of this entry: </span>
              {(() => {
                const net =
                  Number(txnForm.takenValue || 0) -
                  Number(txnForm.cashGiven || 0) -
                  Number(txnForm.givenValue || 0) +
                  Number(txnForm.cashReceived || 0)
                if (net === 0) return <span className="font-medium">No change to balance</span>
                return (
                  <span className="font-medium">
                    {net > 0
                      ? `You will owe the seller ${formatCurrency(net, currency)} more`
                      : `Seller will owe you ${formatCurrency(Math.abs(net), currency)} more`}
                  </span>
                )
              })()}
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setTxnDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                Save entry
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsSeller !== null} onOpenChange={(open) => !open && setDetailsSeller(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader>
            <DialogTitle>{detailsSeller?.name}&apos;s transaction history</DialogTitle>
            <DialogDescription>
              {detailsSeller?.phone} · {detailsSeller?.location || 'N/A'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={historyRange === '30d' ? 'default' : 'outline'}
              className="rounded-xl"
              onClick={() => setHistoryRange('30d')}
            >
              Last 30 days
            </Button>
            <Button
              type="button"
              size="sm"
              variant={historyRange === 'all' ? 'default' : 'outline'}
              className="rounded-xl"
              onClick={() => setHistoryRange('all')}
            >
              All time
            </Button>
          </div>

          {detailsProductSummary.length > 0 ? (
            <div className="space-y-2 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Products moved {historyRange === '30d' ? 'in the last 30 days' : 'all time'}
              </p>
              <div className="flex flex-wrap gap-2">
                {detailsProductSummary.map((item) => (
                  <span
                    key={item.productName}
                    className="rounded-full border border-border/70 px-3 py-1 text-xs font-normal"
                  >
                    {item.productName} × {item.quantity}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            {detailsTransactions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
                No transactions {historyRange === '30d' ? 'in the last 30 days' : 'on record'}.
              </div>
            ) : (
              detailsTransactions.map((txn) => (
                <div key={txn.id} className="space-y-3 rounded-2xl border border-border/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {txn.productName ? `${txn.quantity ? `${txn.quantity} x ` : ''}${txn.productName}` : 'Ledger entry'}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(txn.date)}</p>
                    </div>
                    {txn.goodsBroughtDescription ? (
                      <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-normal text-muted-foreground">
                        {txn.goodsBroughtDescription}
                      </span>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
                    <span className="text-muted-foreground">
                      Taken <strong className="text-foreground">{formatCurrency(txn.takenValue, currency)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Cash given <strong className="text-foreground">{formatCurrency(txn.cashGiven, currency)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Goods given <strong className="text-foreground">{formatCurrency(txn.givenValue, currency)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                      Cash received <strong className="text-foreground">{formatCurrency(txn.cashReceived, currency)}</strong>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-4 border-t border-border/70 pt-3 text-sm">
                    <span className={cn(txn.iReceiveAmount > 0 ? 'text-rose-600 dark:text-rose-400' : '')}>
                      I receive <strong>{formatCurrency(txn.iReceiveAmount, currency)}</strong>
                    </span>
                    <span className={cn(txn.theyReceiveAmount > 0 ? 'text-rose-600 dark:text-rose-400' : '')}>
                      They receive <strong>{formatCurrency(txn.theyReceiveAmount, currency)}</strong>
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

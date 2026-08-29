"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { BellRing, Check, Crown, Edit, Eye, MapPin, Phone, Plus, Search, Trash2, Wrench } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useERP } from '@/lib/erp/provider'
import type { CustomerInput, CustomerRecord } from '@/lib/erp/types'
import { formatCurrency, formatDate, getReadableOrderState, isPremiumCustomer, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type CustomerFormState = {
  name: string
  company: string
  phone: string
  location: string
  due: string
  supportStatus: CustomerRecord['supportStatus']
  supportNote: string
  leadSource: NonNullable<CustomerRecord['leadSource']>
  reminderCustomer: boolean
  previousBillNumber: string
  previousPurchaseDetails: string
  previousPurchaseAmount: string
}

const emptyCustomerForm: CustomerFormState = {
  name: '',
  company: '',
  phone: '',
  location: '',
  due: '0',
  supportStatus: 'none',
  supportNote: '',
  leadSource: 'facebook',
  reminderCustomer: false,
  previousBillNumber: '',
  previousPurchaseDetails: '',
  previousPurchaseAmount: '',
}

const supportLabels: Record<CustomerRecord['supportStatus'], string> = {
  none: 'No support',
  needed: 'Support needed',
  'in-progress': 'In service',
  resolved: 'Resolved',
}

const leadSourceLabels: Record<NonNullable<CustomerRecord['leadSource']>, string> = {
  facebook: 'From Facebook',
  'local-marketing': 'From Local Marketing',
  'visiting-customer': 'From Visiting Customer',
}

function supportToneClass(status: CustomerRecord['supportStatus']) {
  if (status === 'needed') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
  }

  if (status === 'in-progress') {
    return 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300'
  }

  if (status === 'resolved') {
    return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
  }

  return 'border-border bg-muted text-muted-foreground'
}

function formFromCustomer(customer: CustomerRecord): CustomerFormState {
  return {
    name: customer.name,
    company: customer.company,
    phone: customer.phone,
    location: customer.location,
    due: String(customer.due),
    supportStatus: customer.supportStatus,
    supportNote: customer.supportNote,
    leadSource: customer.leadSource ?? 'local-marketing',
    reminderCustomer: customer.reminderCustomer ?? false,
    previousBillNumber: customer.previousBillNumber ?? '',
    previousPurchaseDetails: customer.previousPurchaseDetails ?? '',
    previousPurchaseAmount: customer.previousPurchaseAmount ? String(customer.previousPurchaseAmount) : '',
  }
}

export default function CustomersPage() {
  const { data, saveCustomer, deleteCustomer } = useERP()
  const currency = data?.settings.currency
  const customers = useMemo(() => toArray(data?.customers), [data?.customers])
  const orders = useMemo(() => toArray(data?.orders), [data?.orders])
  const [query, setQuery] = useState('')
  const [supportFilter, setSupportFilter] = useState<CustomerRecord['supportStatus'] | 'all'>('all')
  const [tierFilter, setTierFilter] = useState<'all' | 'premium' | 'normal'>('all')
  const [reminderOnly, setReminderOnly] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null)
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(emptyCustomerForm)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [detailsCustomer, setDetailsCustomer] = useState<CustomerRecord | null>(null)
  const [historyRange, setHistoryRange] = useState<'30d' | 'all'>('30d')

  const customerRows = useMemo(() => {
    return customers
      .map((customer) => {
        const customerOrders = orders.filter((order) => order.customerId === customer.id)
        const purchaseTotal = customerOrders.reduce((sum, order) => sum + order.total, 0)
        const hasOrders = customerOrders.length > 0
        // Backfilled customers have no live orders yet — their manually recorded previous
        // purchase amount is the only figure we have, so it counts toward the premium tier too.
        const effectivePurchaseTotal = hasOrders ? purchaseTotal : customer.previousPurchaseAmount ?? 0
        const lastOrder = [...customerOrders].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]

        const searchBlob = [
          customer.previousBillNumber,
          customer.previousPurchaseDetails,
          ...customerOrders.flatMap((order) => [order.billNumber, ...order.items.map((item) => item.productName)]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return {
          customer,
          orderCount: customerOrders.length,
          purchaseTotal,
          effectivePurchaseTotal,
          dueTotal: customerOrders.reduce((sum, order) => sum + order.due, 0),
          lastPurchaseDate: lastOrder?.createdAt ?? customer.updatedAt,
          hasOrders,
          isPremium: isPremiumCustomer(effectivePurchaseTotal),
          searchBlob,
        }
      })
      .sort((left, right) => right.effectivePurchaseTotal - left.effectivePurchaseTotal)
  }, [customers, orders])

  const detailsOrders = useMemo(() => {
    if (!detailsCustomer) return []

    const customerOrders = orders
      .filter((order) => order.customerId === detailsCustomer.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))

    if (historyRange === 'all') return customerOrders

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    return customerOrders.filter((order) => new Date(order.createdAt) >= cutoff)
  }, [orders, detailsCustomer, historyRange])

  const detailsProductSummary = useMemo(() => {
    const totals = new Map<string, { productName: string; quantity: number; amount: number }>()

    detailsOrders.forEach((order) => {
      order.items.forEach((item) => {
        const existing = totals.get(item.productId) ?? { productName: item.productName, quantity: 0, amount: 0 }
        existing.quantity += item.quantity
        existing.amount += item.quantity * item.unitPrice
        totals.set(item.productId, existing)
      })
    })

    return Array.from(totals.values()).sort((left, right) => right.amount - left.amount)
  }, [detailsOrders])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return customerRows.filter(({ customer, isPremium, hasOrders, searchBlob }) => {
      const matchesSearch =
        !normalizedQuery ||
        [customer.name, customer.company, customer.phone, customer.location, customer.supportNote, searchBlob]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      const matchesSupport = supportFilter === 'all' || customer.supportStatus === supportFilter
      // "Normal" means they've actually bought something (even one item) but stayed under
      // the premium threshold — a prospect with zero purchases is neither tier yet.
      const matchesTier =
        tierFilter === 'all' || (tierFilter === 'premium' ? isPremium : !isPremium && hasOrders)
      const matchesReminder = !reminderOnly || (customer.reminderCustomer && !hasOrders)

      return matchesSearch && matchesSupport && matchesTier && matchesReminder
    })
  }, [customerRows, query, supportFilter, tierFilter, reminderOnly])

  const metrics = useMemo(() => {
    return {
      totalCustomers: customers.length,
      purchaseTotal: customerRows.reduce((sum, row) => sum + row.purchaseTotal, 0),
      dueTotal: customers.reduce((sum, customer) => sum + customer.due, 0),
      supportOpen: customers.filter((customer) => ['needed', 'in-progress'].includes(customer.supportStatus)).length,
      premiumCount: customerRows.filter((row) => row.isPremium).length,
    }
  }, [customerRows, customers])

  function openCreateDialog() {
    setEditingCustomer(null)
    setCustomerForm(emptyCustomerForm)
    setFeedback(null)
    setDialogOpen(true)
  }

  function openEditDialog(customer: CustomerRecord) {
    setEditingCustomer(customer)
    setCustomerForm(formFromCustomer(customer))
    setFeedback(null)
    setDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const input: CustomerInput = {
      name: customerForm.name,
      company: customerForm.company,
      phone: customerForm.phone,
      location: customerForm.location,
      due: Number(customerForm.due),
      supportStatus: customerForm.supportStatus,
      supportNote: customerForm.supportNote,
      leadSource: customerForm.leadSource,
      reminderCustomer: customerForm.reminderCustomer,
      previousBillNumber: customerForm.previousBillNumber,
      previousPurchaseDetails: customerForm.previousPurchaseDetails,
      previousPurchaseAmount: Number(customerForm.previousPurchaseAmount) || 0,
    }

    try {
      await saveCustomer(input, editingCustomer?.id)
      setDialogOpen(false)
      setCustomerForm(emptyCustomerForm)
      setEditingCustomer(null)
      setFeedback(editingCustomer ? 'Customer details updated.' : 'New customer added.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save customer.')
    }
  }

  async function handleDelete(customer: CustomerRecord) {
    setFeedback(null)

    try {
      await deleteCustomer(customer.id)
      setFeedback(`${customer.name} removed from customer list.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete customer.')
    }
  }

  async function handleSupportStatusChange(
    customer: CustomerRecord,
    supportStatus: CustomerRecord['supportStatus']
  ) {
    if (customer.supportStatus === supportStatus) {
      return
    }

    setFeedback(null)

    try {
      await saveCustomer(
        {
          name: customer.name,
          company: customer.company,
          phone: customer.phone,
          location: customer.location,
          due: customer.due,
          supportStatus,
          supportNote: customer.supportNote,
        },
        customer.id
      )
      setFeedback(`${customer.name} support status changed to ${supportLabels[supportStatus]}.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to update support status.')
    }
  }

  return (
    <AdminShell active="Customers (CRM)">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Customers', metrics.totalCustomers.toLocaleString('en-BD'), 'Active CRM records'],
            ['Total purchase', formatCurrency(metrics.purchaseTotal, currency), 'From sales history'],
            ['Due balance', formatCurrency(metrics.dueTotal, currency), 'Customer ledger due'],
            ['Support open', metrics.supportOpen.toLocaleString('en-BD'), 'Needs servicing follow-up'],
            ['Premium customers', metrics.premiumCount.toLocaleString('en-BD'), 'Lifetime spend over 2,00,000'],
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
              <CardTitle>Customer data table</CardTitle>
              <CardDescription>Search by name, phone, company, location, support note, bill number, or product.</CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_190px_auto_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search by name, phone, bill number, or product"
                />
              </div>
              <Select value={supportFilter} onValueChange={(value) => setSupportFilter(value as typeof supportFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All support</SelectItem>
                  <SelectItem value="needed">Support needed</SelectItem>
                  <SelectItem value="in-progress">In service</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="none">No support</SelectItem>
                </SelectContent>
              </Select>
              <Select value={tierFilter} onValueChange={(value) => setTierFilter(value as typeof tierFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  <SelectItem value="premium">Premium only</SelectItem>
                  <SelectItem value="normal">Normal only</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant={reminderOnly ? 'default' : 'outline'}
                className="h-10 rounded-xl"
                onClick={() => setReminderOnly((current) => !current)}
              >
                <BellRing className="mr-2 h-4 w-4" />
                Reminder customers
              </Button>
              <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Add customer
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Customer</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Purchase</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Support</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map(({ customer, orderCount, purchaseTotal, dueTotal, lastPurchaseDate, hasOrders, isPremium }) => {
                    const hasManualRecord = !hasOrders && Boolean(customer.previousBillNumber || customer.previousPurchaseAmount)
                    return (
                    <TableRow key={customer.id}>
                      <TableCell className="min-w-56">
                        <div className="flex items-center gap-3">
                          <div
                            className="relative shrink-0 rounded-full"
                            title={isPremium ? 'Premium customer — lifetime spend over 2,00,000' : undefined}
                          >
                            <Avatar
                              className={cn(
                                'h-10 w-10 ring-2 transition-colors',
                                isPremium ? 'ring-amber-400' : 'ring-transparent'
                              )}
                            >
                              <AvatarFallback
                                className={cn(
                                  isPremium
                                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    : 'bg-muted text-muted-foreground'
                                )}
                              >
                                {customer.name
                                  .split(' ')
                                  .map((part) => part[0])
                                  .slice(0, 2)
                                  .join('')
                                  .toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {isPremium ? (
                              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white ring-2 ring-background">
                                <Crown className="h-2.5 w-2.5" />
                              </span>
                            ) : null}
                          </div>
                          <div>
                            <p className="font-semibold">{customer.name}</p>
                            <p className="text-sm text-muted-foreground">{customer.company || 'Retail'}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <Badge variant="outline" className="text-xs font-normal">
                                {leadSourceLabels[customer.leadSource ?? 'local-marketing']}
                              </Badge>
                              {customer.reminderCustomer && !hasOrders ? (
                                <Badge className="bg-sky-500/15 text-sky-700 hover:bg-sky-500/15 dark:text-sky-300">
                                  Reminder
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-44">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{customer.phone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-48">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{customer.location || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-44">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {formatCurrency(hasManualRecord ? customer.previousPurchaseAmount ?? 0 : purchaseTotal, currency)}
                          </p>
                          {isPremium ? (
                            <Badge className="rounded-full bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
                              Premium
                            </Badge>
                          ) : null}
                        </div>
                        {hasManualRecord ? (
                          <p className="text-xs text-muted-foreground">
                            {customer.previousBillNumber ? `Bill #${customer.previousBillNumber} · ` : ''}
                            recorded manually
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {orderCount} orders, last {formatDate(lastPurchaseDate)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{formatCurrency(customer.due || dueTotal, currency)}</TableCell>
                      <TableCell className="min-w-64">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                'h-8 rounded-full px-3 text-sm font-medium',
                                supportToneClass(customer.supportStatus)
                              )}
                            >
                              <Wrench className="mr-1 h-3.5 w-3.5" />
                              {supportLabels[customer.supportStatus]}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-48">
                            {(Object.keys(supportLabels) as CustomerRecord['supportStatus'][]).map((status) => (
                              <DropdownMenuItem
                                key={status}
                                onClick={() => void handleSupportStatusChange(customer, status)}
                              >
                                {customer.supportStatus === status ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <span className="h-4 w-4" />
                                )}
                                {supportLabels[status]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <p className="mt-2 max-w-72 text-xs leading-5 text-muted-foreground">
                          {customer.supportNote || 'No service note added.'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => {
                              setDetailsCustomer(customer)
                              setHistoryRange('30d')
                            }}
                            aria-label={`View purchase history for ${customer.name}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditDialog(customer)} aria-label={`Edit ${customer.name}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(customer)}
                            disabled={hasOrders}
                            aria-label={`Delete ${customer.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )})}
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                        No customers found.
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
            <DialogTitle>{editingCustomer ? 'Edit customer' : 'Add new customer'}</DialogTitle>
            <DialogDescription>
              {editingCustomer
                ? 'Update contact details, due balance, and service status.'
                : 'Just the essentials — you can add due balance or service notes later from the customer list.'}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact details</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Customer name<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    value={customerForm.name}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="e.g. Md. Karim Uddin"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Phone number<span className="ml-0.5 text-rose-500">*</span>
                  </p>
                  <Input
                    value={customerForm.phone}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="e.g. 01711-000000"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Company <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={customerForm.company}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, company: event.target.value }))}
                    placeholder="e.g. Karim Traders"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Location <span className="font-normal text-muted-foreground">(optional)</span>
                  </p>
                  <Input
                    value={customerForm.location}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, location: event.target.value }))}
                    placeholder="e.g. Mirpur, Dhaka"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Customer source</p>
                  <Select value={customerForm.leadSource} onValueChange={(value) => setCustomerForm((current) => ({ ...current, leadSource: value as CustomerFormState['leadSource'] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="facebook">From Facebook</SelectItem>
                      <SelectItem value="local-marketing">From Local Marketing</SelectItem>
                      <SelectItem value="visiting-customer">From Visiting Customer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Follow-up category</p>
                  <button
                    type="button"
                    onClick={() => setCustomerForm((current) => ({ ...current, reminderCustomer: !current.reminderCustomer }))}
                    className={cn(
                      'flex h-10 w-full items-center rounded-md border px-3 text-left text-sm transition-colors',
                      customerForm.reminderCustomer ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background'
                    )}
                    aria-pressed={customerForm.reminderCustomer}
                  >
                    <span className={cn('mr-2 flex h-4 w-4 items-center justify-center rounded border', customerForm.reminderCustomer && 'border-primary bg-primary text-primary-foreground')}>
                      {customerForm.reminderCustomer ? <Check className="h-3 w-3" /> : null}
                    </span>
                    Add as reminder customer
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Previous purchase record (optional)
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  For old customers you&apos;re backfilling — note their earlier bill number, what they bought, and how
                  much, so it&apos;s easy to find later.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Bill number</p>
                  <Input
                    value={customerForm.previousBillNumber}
                    onChange={(event) =>
                      setCustomerForm((current) => ({ ...current, previousBillNumber: event.target.value }))
                    }
                    placeholder="e.g. INV-00219"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Amount ({currency ?? 'BDT'})</p>
                  <Input
                    type="number"
                    min="0"
                    value={customerForm.previousPurchaseAmount}
                    onChange={(event) =>
                      setCustomerForm((current) => ({ ...current, previousPurchaseAmount: event.target.value }))
                    }
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Products purchased</p>
                <Textarea
                  value={customerForm.previousPurchaseDetails}
                  onChange={(event) =>
                    setCustomerForm((current) => ({ ...current, previousPurchaseDetails: event.target.value }))
                  }
                  placeholder="e.g. LG Fridge 1x, Walton TV 1x"
                  rows={2}
                />
              </div>
            </div>

            {editingCustomer ? (
              <div className="space-y-4 rounded-2xl border border-border/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Due balance &amp; service status
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Due balance ({currency ?? 'BDT'})</p>
                    <Input
                      type="number"
                      min="0"
                      value={customerForm.due}
                      onChange={(event) => setCustomerForm((current) => ({ ...current, due: event.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Support status</p>
                    <Select
                      value={customerForm.supportStatus}
                      onValueChange={(value) =>
                        setCustomerForm((current) => ({
                          ...current,
                          supportStatus: value as CustomerRecord['supportStatus'],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No support</SelectItem>
                        <SelectItem value="needed">Support needed</SelectItem>
                        <SelectItem value="in-progress">In service</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Service note</p>
                  <Textarea
                    value={customerForm.supportNote}
                    onChange={(event) => setCustomerForm((current) => ({ ...current, supportNote: event.target.value }))}
                    placeholder="Technical support or servicing note"
                    rows={4}
                  />
                </div>
              </div>
            ) : null}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                {editingCustomer ? 'Update customer' : 'Save customer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsCustomer !== null} onOpenChange={(open) => !open && setDetailsCustomer(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto sm:max-h-[calc(100dvh-3rem)]">
          <DialogHeader>
            <DialogTitle>{detailsCustomer?.name}&apos;s purchase history</DialogTitle>
            <DialogDescription>
              {detailsCustomer?.phone} · {detailsCustomer?.location || 'N/A'} · Customer since {detailsCustomer ? formatDate(detailsCustomer.createdAt) : ''}
            </DialogDescription>
          </DialogHeader>

          {detailsCustomer && (detailsCustomer.previousBillNumber || detailsCustomer.previousPurchaseDetails || detailsCustomer.previousPurchaseAmount) ? (
            <div className="space-y-2 rounded-2xl border border-dashed border-border/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Previous purchase (recorded manually)
                </p>
                {detailsCustomer.previousBillNumber ? (
                  <Badge variant="outline" className="font-normal">
                    Bill #{detailsCustomer.previousBillNumber}
                  </Badge>
                ) : null}
              </div>
              {detailsCustomer.previousPurchaseDetails ? (
                <p className="text-sm">{detailsCustomer.previousPurchaseDetails}</p>
              ) : null}
              {detailsCustomer.previousPurchaseAmount ? (
                <p className="text-sm text-muted-foreground">
                  Amount <strong className="text-foreground">{formatCurrency(detailsCustomer.previousPurchaseAmount, currency)}</strong>
                </p>
              ) : null}
            </div>
          ) : null}

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
                Products taken {historyRange === '30d' ? 'in the last 30 days' : 'all time'}
              </p>
              <div className="flex flex-wrap gap-2">
                {detailsProductSummary.map((item) => (
                  <Badge key={item.productName} variant="outline" className="font-normal">
                    {item.productName} × {item.quantity}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            {detailsOrders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
                No purchases {historyRange === '30d' ? 'in the last 30 days' : 'on record'}.
              </div>
            ) : (
              detailsOrders.map((order) => (
                <div key={order.id} className="space-y-3 rounded-2xl border border-border/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{order.billNumber}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{getReadableOrderState(order)}</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {order.items.map((item, index) => (
                      <div key={`${order.id}-${item.productId}-${index}`} className="flex items-center justify-between text-sm">
                        <span>{item.productName} × {item.quantity}</span>
                        <span className="text-muted-foreground">{formatCurrency(item.quantity * item.unitPrice, currency)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-4 border-t border-border/70 pt-3 text-sm">
                    <span>Total <strong>{formatCurrency(order.total, currency)}</strong></span>
                    <span>Paid <strong>{formatCurrency(order.paid, currency)}</strong></span>
                    <span className={cn(order.due > 0 ? 'text-rose-600 dark:text-rose-400' : '')}>
                      Due <strong>{formatCurrency(order.due, currency)}</strong>
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

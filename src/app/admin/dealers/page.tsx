"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Edit, MapPin, Phone, Plus, Search, Trash2 } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { ExportMenu } from '@/components/admin/ExportMenu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import type { DealerInput, DealerRecord } from '@/lib/erp/types'
import { toArray } from '@/lib/erp/utils'

type DealerFormState = {
  name: string
  proprietorName: string
  phone: string
  address: string
}

const emptyDealerForm: DealerFormState = { name: '', proprietorName: '', phone: '', address: '' }

function formFromDealer(dealer: DealerRecord): DealerFormState {
  return { name: dealer.name, proprietorName: dealer.proprietorName, phone: dealer.phone, address: dealer.address }
}

export default function DealersPage() {
  const { data, saveDealer, deleteDealer } = useERP()
  const dealers = useMemo(() => toArray(data?.dealers), [data?.dealers])
  const orders = useMemo(() => toArray(data?.orders), [data?.orders])
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDealer, setEditingDealer] = useState<DealerRecord | null>(null)
  const [dealerForm, setDealerForm] = useState<DealerFormState>(emptyDealerForm)
  const [feedback, setFeedback] = useState<string | null>(null)

  const dealerHasOrders = useMemo(() => {
    const ids = new Set(orders.map((order) => order.dealerId))
    return (dealerId: string) => ids.has(dealerId)
  }, [orders])

  const filteredDealers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return dealers

    return dealers.filter((dealer) =>
      [dealer.name, dealer.proprietorName, dealer.phone, dealer.address].join(' ').toLowerCase().includes(normalizedQuery)
    )
  }, [dealers, query])

  const exportHeaders = ['Business Name', 'Proprietor Name', 'Phone', 'Address']
  const exportRows = useMemo(
    () => filteredDealers.map((dealer) => [dealer.name, dealer.proprietorName, dealer.phone, dealer.address]),
    [filteredDealers]
  )

  function openCreateDialog() {
    setEditingDealer(null)
    setDealerForm(emptyDealerForm)
    setFeedback(null)
    setDialogOpen(true)
  }

  function openEditDialog(dealer: DealerRecord) {
    setEditingDealer(dealer)
    setDealerForm(formFromDealer(dealer))
    setFeedback(null)
    setDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const input: DealerInput = {
      name: dealerForm.name,
      proprietorName: dealerForm.proprietorName,
      phone: dealerForm.phone,
      address: dealerForm.address,
    }

    try {
      await saveDealer(input, editingDealer?.id)
      setDialogOpen(false)
      setDealerForm(emptyDealerForm)
      setEditingDealer(null)
      setFeedback(editingDealer ? 'Dealer details updated.' : 'New dealer added.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save dealer.')
    }
  }

  async function handleDelete(dealer: DealerRecord) {
    setFeedback(null)

    try {
      await deleteDealer(dealer.id)
      setFeedback(`${dealer.name} removed from the dealer list.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete dealer.')
    }
  }

  return (
    <AdminShell active="Dealer List">
      <div className="space-y-6">
        <Card className="w-full max-w-xs border-border/70 shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Dealers</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{dealers.length.toLocaleString('en-BD')}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total dealers on file</p>
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
              <CardTitle>Dealer list</CardTitle>
              <CardDescription>Search by business name, proprietor name, phone, or address.</CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search by business/proprietor name, phone, or address"
                />
              </div>
              <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Add dealer
              </Button>
              <ExportMenu filenameBase="dealers" title="Dealers" headers={exportHeaders} rows={exportRows} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Business name</TableHead>
                    <TableHead>Proprietor</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDealers.map((dealer) => (
                    <TableRow key={dealer.id}>
                      <TableCell className="min-w-56">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-muted text-muted-foreground">
                              {dealer.name
                                .split(' ')
                                .map((part) => part[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <p className="font-semibold">{dealer.name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-40">{dealer.proprietorName || 'N/A'}</TableCell>
                      <TableCell className="min-w-44">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{dealer.phone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-48">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{dealer.address || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditDialog(dealer)} aria-label={`Edit ${dealer.name}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(dealer)}
                            disabled={dealerHasOrders(dealer.id)}
                            aria-label={`Delete ${dealer.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredDealers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                        No dealers found.
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDealer ? 'Edit dealer' : 'Add new dealer'}</DialogTitle>
            <DialogDescription>Business name and mobile number are required; proprietor name and address are optional.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Business name<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input
                value={dealerForm.name}
                onChange={(event) => setDealerForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Karim Traders"
                required
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Proprietor name <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Input
                value={dealerForm.proprietorName}
                onChange={(event) => setDealerForm((current) => ({ ...current, proprietorName: event.target.value }))}
                placeholder="e.g. Md. Karim Uddin"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Mobile number<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input
                value={dealerForm.phone}
                onChange={(event) => setDealerForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="e.g. 01711-000000"
                required
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Address <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Input
                value={dealerForm.address}
                onChange={(event) => setDealerForm((current) => ({ ...current, address: event.target.value }))}
                placeholder="e.g. Mirpur, Dhaka"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                {editingDealer ? 'Update dealer' : 'Save dealer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

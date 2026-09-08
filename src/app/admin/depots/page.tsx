"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Edit, MapPin, Phone, Plus, Search, Trash2, Warehouse } from 'lucide-react'

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
import type { DepotInput, DepotRecord } from '@/lib/erp/types'
import { sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'

// Depot List — the middle party in the Company → Depot → Dealer chain. A
// dealer links to one of these via DealerRecord.depotId (see the Depot field
// on the dealers page) so the Dealer voucher's "From" party box can print
// this depot's own name/address/phone instead of the generic "Depot" label.
type DepotFormState = {
  name: string
  proprietorName: string
  phone: string
  address: string
}

const emptyDepotForm: DepotFormState = { name: '', proprietorName: '', phone: '', address: '' }

function formFromDepot(depot: DepotRecord): DepotFormState {
  return {
    name: depot.name,
    proprietorName: depot.proprietorName,
    phone: depot.phone,
    address: depot.address,
  }
}

export default function DepotsPage() {
  const { data, saveDepot, deleteDepot } = useERP()
  const depots = useMemo(() => sortByCreatedAtDesc(toArray(data?.depots)), [data?.depots])
  const dealers = useMemo(() => toArray(data?.dealers), [data?.dealers])
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDepot, setEditingDepot] = useState<DepotRecord | null>(null)
  const [depotForm, setDepotForm] = useState<DepotFormState>(emptyDepotForm)
  const [feedback, setFeedback] = useState<string | null>(null)

  const dealerCountByDepot = useMemo(() => {
    const counts = new Map<string, number>()
    dealers.forEach((dealer) => {
      if (!dealer.depotId) return
      counts.set(dealer.depotId, (counts.get(dealer.depotId) ?? 0) + 1)
    })
    return counts
  }, [dealers])

  const filteredDepots = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return depots

    return depots.filter((depot) =>
      [depot.name, depot.proprietorName, depot.phone, depot.address]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    )
  }, [depots, query])

  const exportHeaders = ['Depot Name', 'Proprietor Name', 'Phone', 'Address']
  const exportRows = useMemo(
    () => filteredDepots.map((depot) => [depot.name, depot.proprietorName, depot.phone, depot.address]),
    [filteredDepots]
  )

  function openCreateDialog() {
    setEditingDepot(null)
    setDepotForm(emptyDepotForm)
    setFeedback(null)
    setDialogOpen(true)
  }

  function openEditDialog(depot: DepotRecord) {
    setEditingDepot(depot)
    setDepotForm(formFromDepot(depot))
    setFeedback(null)
    setDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const input: DepotInput = {
      name: depotForm.name,
      proprietorName: depotForm.proprietorName,
      phone: depotForm.phone,
      address: depotForm.address,
    }

    try {
      await saveDepot(input, editingDepot?.id)
      setDialogOpen(false)
      setDepotForm(emptyDepotForm)
      setEditingDepot(null)
      setFeedback(editingDepot ? 'Depot details updated.' : 'New depot added.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save depot.')
    }
  }

  async function handleDelete(depot: DepotRecord) {
    setFeedback(null)

    try {
      await deleteDepot(depot.id)
      setFeedback(`${depot.name} removed from the depot list.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete depot.')
    }
  }

  return (
    <AdminShell active="Depot List">
      <div className="space-y-6">
        <Card className="w-full max-w-xs border-border/70 shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Depots</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{depots.length.toLocaleString('en-BD')}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total depots on file</p>
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
              <CardTitle>Depot list</CardTitle>
              <CardDescription>
                Search by depot name, proprietor name, phone, or address. Link a dealer to a depot from the
                Dealer List so invoices print the right depot.
              </CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search by depot/proprietor name, phone, or address"
                />
              </div>
              <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Add depot
              </Button>
              <ExportMenu filenameBase="depots" title="Depots" headers={exportHeaders} rows={exportRows} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Depot name</TableHead>
                    <TableHead>Proprietor</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Dealers</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDepots.map((depot) => (
                    <TableRow key={depot.id}>
                      <TableCell className="min-w-56">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-muted text-muted-foreground">
                              <Warehouse className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <p className="font-semibold">{depot.name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-40">{depot.proprietorName || 'N/A'}</TableCell>
                      <TableCell className="min-w-44">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{depot.phone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-48">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{depot.address || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-24">{dealerCountByDepot.get(depot.id) ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditDialog(depot)} aria-label={`Edit ${depot.name}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(depot)}
                            disabled={(dealerCountByDepot.get(depot.id) ?? 0) > 0}
                            aria-label={`Delete ${depot.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredDepots.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                        No depots found.
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
            <DialogTitle>{editingDepot ? 'Edit depot' : 'Add new depot'}</DialogTitle>
            <DialogDescription>Depot name is required; proprietor name, mobile number, and address are optional.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Depot name<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input
                value={depotForm.name}
                onChange={(event) => setDepotForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. M/S. Protedhoni Traders"
                required
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Proprietor name <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Input
                value={depotForm.proprietorName}
                onChange={(event) => setDepotForm((current) => ({ ...current, proprietorName: event.target.value }))}
                placeholder="e.g. Mr. Dulal Chandra Roy"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Mobile number <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Input
                value={depotForm.phone}
                onChange={(event) => setDepotForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="e.g. 01711-000000"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Address <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Input
                value={depotForm.address}
                onChange={(event) => setDepotForm((current) => ({ ...current, address: event.target.value }))}
                placeholder="e.g. Mymensingh Sadar, Mymensingh"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                {editingDepot ? 'Update depot' : 'Save depot'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

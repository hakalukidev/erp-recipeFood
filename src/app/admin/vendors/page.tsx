"use client"

import { useMemo, useState } from 'react'
import { Edit, MapPin, Phone, Plus, Search, Trash2, Truck } from 'lucide-react'

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
import type { VendorRecord } from '@/lib/erp/types'
import { computeVendorDue, sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

function formatAmount(value: number) {
  return value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ---- Vendor dialog ---------------------------------------------------------
type VendorFormState = {
  name: string
  proprietorName: string
  phone: string
  address: string
}

const emptyVendorForm: VendorFormState = { name: '', proprietorName: '', phone: '', address: '' }

function formFromVendor(vendor: VendorRecord): VendorFormState {
  return {
    name: vendor.name,
    proprietorName: vendor.proprietorName ?? '',
    phone: vendor.phone,
    address: vendor.address,
  }
}

// Split out of the Purchase page into its own top-level section (2026-09-12
// client request) — a fully independent department, not linked to anything
// else, that only carries vendor identity + their running due (see
// computeVendorDue in utils.ts). Recording a purchase or a vendor payment
// still happens from the Purchase page (/admin/purchase), which keeps its
// own vendor picker/voucher lookups — this page is purely the vendor
// directory (add/edit/delete + due at a glance).
export default function VendorsPage() {
  const { data, saveVendor, deleteVendor } = useERP()
  const [query, setQuery] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<VendorRecord | null>(null)
  const [vendorForm, setVendorForm] = useState<VendorFormState>(emptyVendorForm)

  const vendors = useMemo(() => sortByCreatedAtDesc(toArray(data?.vendors)), [data?.vendors])

  const vendorDueById = useMemo(() => {
    const map = new Map<string, number>()
    vendors.forEach((vendor) => map.set(vendor.id, computeVendorDue(data ?? null, vendor.id)))
    return map
  }, [data, vendors])

  const filteredVendors = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return vendors
    return vendors.filter((vendor) =>
      [vendor.name, vendor.proprietorName ?? '', vendor.phone, vendor.address].join(' ').toLowerCase().includes(normalized)
    )
  }, [vendors, query])

  function openCreateVendorDialog() {
    setEditingVendor(null)
    setVendorForm(emptyVendorForm)
    setFeedback(null)
    setVendorDialogOpen(true)
  }

  function openEditVendorDialog(vendor: VendorRecord) {
    setEditingVendor(vendor)
    setVendorForm(formFromVendor(vendor))
    setFeedback(null)
    setVendorDialogOpen(true)
  }

  async function handleSaveVendor() {
    setFeedback(null)
    try {
      await saveVendor(
        {
          name: vendorForm.name,
          proprietorName: vendorForm.proprietorName,
          phone: vendorForm.phone,
          address: vendorForm.address,
        },
        editingVendor?.id
      )
      setVendorDialogOpen(false)
      setFeedback(editingVendor ? 'Vendor details updated.' : 'New vendor added.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save vendor.')
    }
  }

  async function handleDeleteVendor(vendor: VendorRecord) {
    setFeedback(null)
    try {
      await deleteVendor(vendor.id)
      setFeedback(`${vendor.name} removed from the vendor list.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete vendor.')
    }
  }

  const vendorExportHeaders = ['Vendor Name', 'Proprietor', 'Phone', 'Address', 'Current Due']
  const vendorExportRows = useMemo(
    () =>
      filteredVendors.map((vendor) => [
        vendor.name,
        vendor.proprietorName ?? '',
        vendor.phone,
        vendor.address,
        (vendorDueById.get(vendor.id) ?? 0).toFixed(2),
      ]),
    [filteredVendors, vendorDueById]
  )

  return (
    <AdminShell active="Vendor">
      <div className="space-y-6">
        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card className="w-full max-w-xs border-border/70 shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Vendors</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{vendors.length.toLocaleString('en-BD')}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total vendors on file</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Vendor list</CardTitle>
              <CardDescription>
                Search by vendor/proprietor name, phone, or address. Current due is the live sum of every unpaid
                purchase against them — record a purchase or a payment from the Purchase page.
              </CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search by vendor/proprietor name, phone, or address"
                />
              </div>
              <Button onClick={openCreateVendorDialog} className="h-10 rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Add vendor
              </Button>
              <ExportMenu filenameBase="vendors" title="Vendors" headers={vendorExportHeaders} rows={vendorExportRows} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Vendor name</TableHead>
                    <TableHead>Proprietor</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="text-right">Current Due</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendors.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell className="min-w-56">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-muted text-muted-foreground">
                              <Truck className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <p className="font-semibold">{vendor.name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-40">{vendor.proprietorName || 'N/A'}</TableCell>
                      <TableCell className="min-w-44">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{vendor.phone || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-48">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{vendor.address || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn((vendorDueById.get(vendor.id) ?? 0) > 0 && 'font-semibold text-destructive')}>
                          {formatAmount(vendorDueById.get(vendor.id) ?? 0)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => openEditVendorDialog(vendor)} aria-label={`Edit ${vendor.name}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteVendor(vendor)}
                            aria-label={`Delete ${vendor.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredVendors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                        No vendors found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- Vendor dialog ---- */}
      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingVendor ? 'Edit vendor' : 'Add new vendor'}</DialogTitle>
            <DialogDescription>Vendor name is required; proprietor name, mobile number, and address are optional.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Vendor name<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input
                value={vendorForm.name}
                onChange={(event) => setVendorForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. M/S. Karim Traders"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Proprietor name <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Input
                value={vendorForm.proprietorName}
                onChange={(event) => setVendorForm((current) => ({ ...current, proprietorName: event.target.value }))}
                placeholder="e.g. Mr. Karim Hossain"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Mobile number <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Input
                value={vendorForm.phone}
                onChange={(event) => setVendorForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="e.g. 01711-000000"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Address <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Input
                value={vendorForm.address}
                onChange={(event) => setVendorForm((current) => ({ ...current, address: event.target.value }))}
                placeholder="e.g. Karwan Bazar, Dhaka"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setVendorDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className="rounded-xl" onClick={() => void handleSaveVendor()}>
                {editingVendor ? 'Update vendor' : 'Save vendor'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

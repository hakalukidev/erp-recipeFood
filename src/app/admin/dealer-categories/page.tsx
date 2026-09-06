"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Edit, Plus, Search, Tags, Trash2 } from 'lucide-react'

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
import type { DealerCategoryInput, DealerCategoryRecord } from '@/lib/erp/types'
import { sortByCreatedAtDesc, toArray } from '@/lib/erp/utils'

// Dealer Category — a simple named grouping for dealers (e.g. Wholesaler,
// Retailer, Distributor). Just a name; managed the same way as the Dealer
// List (see DealersPage) but with a single field.
type DealerCategoryFormState = {
  name: string
}

const emptyForm: DealerCategoryFormState = { name: '' }

function formFromCategory(category: DealerCategoryRecord): DealerCategoryFormState {
  return { name: category.name }
}

export default function DealerCategoriesPage() {
  const { data, saveDealerCategory, deleteDealerCategory } = useERP()
  const categories = useMemo(
    () => sortByCreatedAtDesc(toArray(data?.dealerCategories)),
    [data?.dealerCategories]
  )
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<DealerCategoryRecord | null>(null)
  const [form, setForm] = useState<DealerCategoryFormState>(emptyForm)
  const [feedback, setFeedback] = useState<string | null>(null)

  const filteredCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return categories

    return categories.filter((category) => category.name.toLowerCase().includes(normalizedQuery))
  }, [categories, query])

  const exportHeaders = ['Category Name']
  const exportRows = useMemo(() => filteredCategories.map((category) => [category.name]), [filteredCategories])

  function openCreateDialog() {
    setEditingCategory(null)
    setForm(emptyForm)
    setFeedback(null)
    setDialogOpen(true)
  }

  function openEditDialog(category: DealerCategoryRecord) {
    setEditingCategory(category)
    setForm(formFromCategory(category))
    setFeedback(null)
    setDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    const input: DealerCategoryInput = { name: form.name }

    try {
      await saveDealerCategory(input, editingCategory?.id)
      setDialogOpen(false)
      setForm(emptyForm)
      setEditingCategory(null)
      setFeedback(editingCategory ? 'Dealer category updated.' : 'New dealer category added.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save dealer category.')
    }
  }

  async function handleDelete(category: DealerCategoryRecord) {
    setFeedback(null)

    try {
      await deleteDealerCategory(category.id)
      setFeedback(`${category.name} removed from the dealer category list.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete dealer category.')
    }
  }

  return (
    <AdminShell active="Dealer Category">
      <div className="space-y-6">
        <Card className="w-full max-w-xs border-border/70 shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Dealer categories</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{categories.length.toLocaleString('en-BD')}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total categories on file</p>
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
              <CardTitle>Dealer category list</CardTitle>
              <CardDescription>Group dealers by category — e.g. Wholesaler, Retailer, Distributor.</CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search by category name"
                />
              </div>
              <Button onClick={openCreateDialog} className="h-10 rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Add category
              </Button>
              <ExportMenu
                filenameBase="dealer-categories"
                title="Dealer Categories"
                headers={exportHeaders}
                rows={exportRows}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Category name</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCategories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="min-w-56">
                        <div className="flex items-center gap-3">
                          <Tags className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <p className="font-semibold">{category.name}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => openEditDialog(category)}
                            aria-label={`Edit ${category.name}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(category)}
                            aria-label={`Delete ${category.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredCategories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="h-28 text-center text-muted-foreground">
                        No dealer categories found.
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
            <DialogTitle>{editingCategory ? 'Edit dealer category' : 'Add new dealer category'}</DialogTitle>
            <DialogDescription>Give the category a short, recognizable name.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Category name<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input
                value={form.name}
                onChange={(event) => setForm({ name: event.target.value })}
                placeholder="e.g. Wholesaler"
                required
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="rounded-xl">
                {editingCategory ? 'Update category' : 'Save category'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

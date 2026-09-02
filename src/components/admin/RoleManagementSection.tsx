"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import { ACTION_LABELS, MODULE_DEFINITIONS } from '@/lib/erp/defaultData'
import type { RoleRecord } from '@/lib/erp/types'

const initialForm = { name: '', description: '', permissions: new Set<string>() }

// Section 63 — User Role & Permission: Role-based Access Control is
// mandatory. Every role's View/Create/Edit/Delete/Approve/Export
// permissions are set independently here, one checkbox per module x action
// (see MODULE_DEFINITIONS in defaultData.ts) — the same grid the 15 example
// roles were seeded from.
export function RoleManagementSection() {
  const { data, users, currentUser, saveRole, deleteRole, hasPermission } = useERP()
  const [open, setOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null)
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [deletingRole, setDeletingRole] = useState<RoleRecord | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const roles = useMemo(() => Object.values(data?.roles ?? {}).sort((a, b) => a.name.localeCompare(b.name)), [data?.roles])
  const userCountByRole = useMemo(() => {
    const counts = new Map<string, number>()
    users.forEach((user) => counts.set(user.roleId, (counts.get(user.roleId) ?? 0) + 1))
    return counts
  }, [users])

  const canView = hasPermission('users:view')
  const canCreate = hasPermission('users:create')
  const canEdit = hasPermission('users:edit')
  const canDelete = hasPermission('users:delete')

  function handleAddClick() {
    setEditingRole(null)
    setForm(initialForm)
    setError(null)
  }

  function handleEditClick(role: RoleRecord) {
    setEditingRole(role)
    setForm({ name: role.name, description: role.description, permissions: new Set(Object.keys(role.permissions)) })
    setError(null)
    setOpen(true)
  }

  function togglePermission(id: string) {
    setForm((current) => {
      const permissions = new Set(current.permissions)
      if (permissions.has(id)) permissions.delete(id)
      else permissions.add(id)
      return { ...current, permissions }
    })
  }

  function toggleModuleAll(moduleActions: string[], checked: boolean) {
    setForm((current) => {
      const permissions = new Set(current.permissions)
      moduleActions.forEach((id) => (checked ? permissions.add(id) : permissions.delete(id)))
      return { ...current, permissions }
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await saveRole(
        { name: form.name, description: form.description, permissions: Array.from(form.permissions) },
        editingRole?.id
      )
      setMessage(editingRole ? 'Role updated successfully.' : 'Role created successfully.')
      setOpen(false)
      setEditingRole(null)
      setForm(initialForm)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save role.')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deletingRole) return
    setDeleteError(null)
    try {
      await deleteRole(deletingRole.id)
      setDeletingRole(null)
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Unable to delete role.')
    }
  }

  if (!canView) {
    return null
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <Badge variant="outline" className="rounded-full">Section 63</Badge>
          <CardTitle>Role & permission matrix</CardTitle>
          <CardDescription>Role-based access control — View / Create / Edit / Delete / Approve / Export permission, set independently per role.</CardDescription>
        </div>
        {canCreate ? (
          <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setEditingRole(null); setForm(initialForm) } }}>
            <DialogTrigger asChild>
              <Button className="rounded-xl" onClick={handleAddClick}>
                <Plus className="mr-2 h-4 w-4" /> Add role
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingRole ? `Edit ${editingRole.name}` : 'Create a new role'}</DialogTitle>
                <DialogDescription>Name the role and choose which module actions it can perform.</DialogDescription>
              </DialogHeader>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Role name<span className="ml-0.5 text-rose-500">*</span></p>
                    <Input
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="e.g. Store Officer"
                      disabled={editingRole?.id === 'super_admin'}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Description</p>
                    <Textarea
                      value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                      rows={1}
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Permissions</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="p-2">Module</th>
                          {Object.entries(ACTION_LABELS).map(([action, label]) => (
                            <th key={action} className="p-2 text-center">{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {MODULE_DEFINITIONS.map((moduleDef) => {
                          const moduleIds = moduleDef.actions.map((action) => `${moduleDef.module}:${action}`)
                          const allChecked = moduleIds.every((id) => form.permissions.has(id))
                          return (
                            <tr key={moduleDef.module} className="border-t border-border/60">
                              <td className="p-2 font-medium">
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded border-border"
                                    checked={allChecked}
                                    disabled={editingRole?.id === 'super_admin'}
                                    onChange={(event) => toggleModuleAll(moduleIds, event.target.checked)}
                                  />
                                  {moduleDef.label}
                                </label>
                              </td>
                              {(Object.keys(ACTION_LABELS) as Array<keyof typeof ACTION_LABELS>).map((action) => {
                                const id = `${moduleDef.module}:${action}`
                                const applicable = moduleDef.actions.includes(action)
                                return (
                                  <td key={action} className="p-2 text-center">
                                    {applicable ? (
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-border"
                                        checked={form.permissions.has(id)}
                                        disabled={editingRole?.id === 'super_admin'}
                                        onChange={() => togglePermission(id)}
                                      />
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {editingRole?.id === 'super_admin' ? (
                    <p className="text-xs text-muted-foreground">Super Admin always keeps every permission.</p>
                  ) : null}
                </div>

                {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

                <DialogFooter>
                  <Button type="submit" className="rounded-xl" disabled={saving}>
                    {saving ? 'Saving...' : editingRole ? 'Save changes' : 'Create role'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </CardHeader>
      <CardContent>
        {message ? <p className="mb-4 text-sm text-emerald-600 dark:text-emerald-400">{message}</p> : null}
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Role</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Permissions</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">{role.name}</TableCell>
                    <TableCell className="max-w-sm text-sm text-muted-foreground">{role.description || '—'}</TableCell>
                    <TableCell className="text-right">{Object.keys(role.permissions).length}</TableCell>
                    <TableCell className="text-right">{userCountByRole.get(role.id) ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canEdit ? (
                          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => handleEditClick(role)}>
                            <Pencil className="h-4 w-4" />
                            <span className="sr-only">Edit {role.name}</span>
                          </Button>
                        ) : null}
                        {canDelete && role.id !== 'super_admin' && role.id !== currentUser?.roleId ? (
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-rose-600 hover:text-rose-600 dark:text-rose-400"
                            onClick={() => { setDeleteError(null); setDeletingRole(role) }}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete {role.name}</span>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>

      <Dialog open={Boolean(deletingRole)} onOpenChange={(next) => { if (!next) { setDeletingRole(null); setDeleteError(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete role</DialogTitle>
            <DialogDescription>Are you sure you want to delete {deletingRole?.name}? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          {deleteError ? <p className="text-sm text-rose-600 dark:text-rose-400">{deleteError}</p> : null}
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setDeletingRole(null)}>Cancel</Button>
            <Button variant="destructive" className="rounded-xl" onClick={() => void handleConfirmDelete()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

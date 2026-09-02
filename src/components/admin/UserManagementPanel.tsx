"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'

import { ExportMenu } from '@/components/admin/ExportMenu'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isStrongPassword, useERP } from '@/lib/erp/provider'
import type { UserRecord } from '@/lib/erp/types'
import { formatDateTime } from '@/lib/erp/utils'

const initialForm = {
  name: '',
  loginId: '',
  phone: '',
  password: '',
  roleId: 'viewer',
  title: '',
}

export function UserManagementPanel() {
  const { data, currentUser, createUser, updateUser, deleteUser, sendPasswordReset, hasPermission } = useERP()
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [deletingUser, setDeletingUser] = useState<UserRecord | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [resetSending, setResetSending] = useState(false)
  const [resetMessage, setResetMessage] = useState<string | null>(null)

  const roles = useMemo(() => Object.values(data?.roles ?? {}), [data?.roles])
  const users = useMemo(() => Object.values(data?.users ?? {}), [data?.users])
  const userExportHeaders = ['Name', 'Login ID', 'Phone', 'Title', 'Role', 'Status']
  const userExportRows = useMemo(
    () =>
      users.map((user) => [
        user.name,
        user.loginId,
        user.phone,
        user.title,
        data?.roles[user.roleId]?.name ?? user.roleId,
        user.status,
      ]),
    [data?.roles, users]
  )
  const loginHistory = useMemo(
    () =>
      Object.values(data?.loginHistory ?? {})
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 100),
    [data?.loginHistory]
  )

  const canView = hasPermission('users:view')
  const canCreate = hasPermission('users:create')
  const canEdit = hasPermission('users:edit')
  const canDelete = hasPermission('users:delete')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setError(null)
    setSaving(true)

    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          name: form.name,
          loginId: form.loginId,
          phone: form.phone,
          roleId: form.roleId,
          title: form.title,
        })
        setMessage('User updated successfully.')
      } else {
        await createUser(form)
        setMessage('User created successfully.')
      }
      setForm(initialForm)
      setEditingUser(null)
      setOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save user.')
    } finally {
      setSaving(false)
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setMessage(null)
      setError(null)
      setResetMessage(null)
    } else {
      setEditingUser(null)
      setForm(initialForm)
    }
  }

  function handleEditClick(user: UserRecord) {
    setEditingUser(user)
    setForm({
      name: user.name,
      loginId: user.loginId,
      phone: user.phone,
      password: '',
      roleId: user.roleId,
      title: user.title,
    })
    setMessage(null)
    setError(null)
    setResetMessage(null)
    setOpen(true)
  }

  function handleAddClick() {
    setEditingUser(null)
    setForm(initialForm)
  }

  async function handleSendPasswordReset() {
    if (!editingUser) {
      return
    }

    setResetMessage(null)
    setResetSending(true)

    try {
      await sendPasswordReset(editingUser.email)
      setResetMessage(`Password reset email sent to ${editingUser.email}.`)
    } catch (reason) {
      setResetMessage(reason instanceof Error ? reason.message : 'Unable to send the reset email.')
    } finally {
      setResetSending(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deletingUser) {
      return
    }

    setDeleteError(null)

    try {
      await deleteUser(deletingUser.id)
      setDeletingUser(null)
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : 'Unable to delete user.')
    }
  }

  if (!canView) {
    return (
      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>User access</CardTitle>
          <CardDescription>Your role doesn&apos;t have permission to view team access.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Contact an admin if you need access to user management.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="rounded-full">User setup</Badge>
            </div>
            <CardTitle>Current users</CardTitle>
            <CardDescription>Login ID and role map for the team already stored in Firebase.</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu filenameBase="users" title="Users" headers={userExportHeaders} rows={userExportRows} />
            {canCreate ? (
            <Dialog open={open} onOpenChange={handleOpenChange}>
              <DialogTrigger asChild>
                <Button className="rounded-xl" onClick={handleAddClick}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add user
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingUser ? 'Edit user' : 'Create a new user'}</DialogTitle>
                  <DialogDescription>
                    {editingUser
                      ? 'Update the login ID, phone number, and role for this team member.'
                      : 'Set the login ID, password, phone number, and role for a new team member.'}
                  </DialogDescription>
                </DialogHeader>
                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div className="space-y-4 rounded-2xl border border-border/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">
                          Full name<span className="ml-0.5 text-rose-500">*</span>
                        </p>
                        <Input
                          value={form.name}
                          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                          placeholder="e.g. Rahim Ahmed"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">
                          Job title<span className="ml-0.5 text-rose-500">*</span>
                        </p>
                        <Input
                          value={form.title}
                          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                          placeholder="e.g. Sales Executive"
                          required
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <p className="text-sm font-medium text-foreground">
                          Phone number<span className="ml-0.5 text-rose-500">*</span>
                        </p>
                        <Input
                          value={form.phone}
                          onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                          placeholder="e.g. 01711-000000"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-2xl border border-border/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Login credentials</p>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Login ID<span className="ml-0.5 text-rose-500">*</span>
                      </p>
                      <Input
                        value={form.loginId}
                        onChange={(event) => setForm((current) => ({ ...current, loginId: event.target.value }))}
                        placeholder="e.g. rahim.ahmed"
                        required
                      />
                    </div>
                    {editingUser ? (
                      <div className="space-y-2 rounded-xl bg-muted/40 p-3">
                        <p className="text-sm font-medium text-foreground">Password</p>
                        <p className="text-xs text-muted-foreground">
                          Passwords can&apos;t be overwritten directly. Send {editingUser.name} a reset link instead.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-lg"
                          disabled={resetSending}
                          onClick={() => void handleSendPasswordReset()}
                        >
                          <KeyRound className="mr-2 h-4 w-4" />
                          {resetSending ? 'Sending...' : 'Send password reset email'}
                        </Button>
                        {resetMessage ? <p className="text-xs text-muted-foreground">{resetMessage}</p> : null}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">
                          Password<span className="ml-0.5 text-rose-500">*</span>
                        </p>
                        <Input
                          value={form.password}
                          onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                          placeholder="Set a password"
                          type="password"
                          required
                        />
                        {/* Section 66 (Security — Strong Password): same rule the provider enforces on submit. */}
                        <p className={`text-xs ${form.password && !isStrongPassword(form.password) ? 'text-rose-500' : 'text-muted-foreground'}`}>
                          At least 8 characters, with a letter and a number.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-2xl border border-border/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Access</p>
                    <p className="text-sm font-medium text-foreground">
                      Role<span className="ml-0.5 text-rose-500">*</span>
                    </p>
                    <Select
                      value={form.roleId}
                      onValueChange={(value) => setForm((current) => ({ ...current, roleId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.roleId ? (
                      <p className="text-xs text-muted-foreground">
                        {roles.find((role) => role.id === form.roleId)?.description ?? 'Controls what this user can see and do.'}
                      </p>
                    ) : null}
                  </div>

                  {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}

                  <DialogFooter>
                    <Button type="submit" className="rounded-xl" disabled={saving || (Boolean(editingUser) && !canEdit)}>
                      {saving ? 'Saving...' : editingUser ? 'Save changes' : 'Create user'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {message ? <p className="mb-4 text-sm text-emerald-600 dark:text-emerald-400">{message}</p> : null}
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Name</TableHead>
                    <TableHead>Login ID</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        No users yet. Click &quot;Add user&quot; to create one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.loginId}</TableCell>
                        <TableCell>{user.phone}</TableCell>
                        <TableCell>{data?.roles[user.roleId]?.name ?? user.roleId}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canEdit ? (
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                onClick={() => handleEditClick(user)}
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Edit {user.name}</span>
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-rose-600 hover:text-rose-600 dark:text-rose-400"
                                disabled={user.id === currentUser?.id}
                                onClick={() => {
                                  setDeleteError(null)
                                  setDeletingUser(user)
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete {user.name}</span>
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>

        <Dialog
          open={Boolean(deletingUser)}
          onOpenChange={(next) => {
            if (!next) {
              setDeletingUser(null)
              setDeleteError(null)
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete user</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {deletingUser?.name}? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>

            {deleteError ? <p className="text-sm text-rose-600 dark:text-rose-400">{deleteError}</p> : null}

            <DialogFooter>
              <Button variant="outline" className="rounded-xl" onClick={() => setDeletingUser(null)}>
                Cancel
              </Button>
              <Button variant="destructive" className="rounded-xl" onClick={() => void handleConfirmDelete()}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>Login history</CardTitle>
          <CardDescription>Most recent successful logins, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>IP address</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loginHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                        No logins recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    loginHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.userName}</TableCell>
                        <TableCell>{entry.roleName}</TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground" title={entry.userAgent}>
                          {entry.userAgent || 'Unknown device'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.ipAddress || '—'}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {formatDateTime(entry.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

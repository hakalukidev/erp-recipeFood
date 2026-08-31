"use client"

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useERP } from '@/lib/erp/provider'
import type { RefundPolicy } from '@/lib/erp/types'
import { toArray } from '@/lib/erp/utils'

type SettingsFormState = {
  companyName: string
  currency: string
  timezone: string
  returnWindowDays: string
  refundPolicy: RefundPolicy
  restockOnReturn: boolean
}

const currencyOptions = ['BDT', 'USD', 'CNY', 'EUR']

const refundPolicyLabels: Record<RefundPolicy, string> = {
  cash: 'Cash refund',
  'store-credit': 'Store credit',
  exchange: 'Exchange only',
}

const refundPolicyHints: Record<RefundPolicy, string> = {
  cash: 'Refund the amount paid back to the customer directly.',
  'store-credit': 'Issue a store credit the customer can use on a future order.',
  exchange: 'Only allow swapping for another product, no cash or credit.',
}

function formFromSettings(settings: SettingsFormState | null): SettingsFormState {
  if (!settings) {
    return {
      companyName: '',
      currency: 'BDT',
      timezone: 'Asia/Dhaka',
      returnWindowDays: '7',
      refundPolicy: 'store-credit',
      restockOnReturn: true,
    }
  }

  return settings
}

export function SettingsScreen() {
  const { data, saveSettings, hasPermission } = useERP()
  const warehouses = useMemo(() => toArray(data?.warehouses), [data?.warehouses])
  const canEdit = hasPermission('users:edit')

  const [form, setForm] = useState<SettingsFormState>(() => formFromSettings(null))
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!data?.settings) {
      return
    }

    setForm({
      companyName: data.settings.companyName,
      currency: data.settings.currency,
      timezone: data.settings.timezone,
      returnWindowDays: String(data.settings.returnWindowDays),
      refundPolicy: data.settings.refundPolicy,
      restockOnReturn: data.settings.restockOnReturn,
    })
  }, [data?.settings])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setIsSaving(true)

    try {
      await saveSettings({
        companyName: form.companyName,
        currency: form.currency,
        timezone: form.timezone,
        returnWindowDays: Number(form.returnWindowDays || 0),
        refundPolicy: form.refundPolicy,
        restockOnReturn: form.restockOnReturn,
      })
      setFeedback('Settings saved.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save settings.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AdminShell active="Settings">
      <div className="space-y-6">
        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        {!canEdit ? (
          <Card className="border-border/70 bg-muted/30 shadow-sm">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Your current role can view these settings but cannot change them.
            </CardContent>
          </Card>
        ) : null}

        <form className="space-y-6" onSubmit={handleSubmit}>
          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Business profile</CardTitle>
              <CardDescription>Company identity, base currency, and timezone used across invoices and reports.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Company name<span className="ml-0.5 text-rose-500">*</span>
                </p>
                <Input
                  value={form.companyName}
                  onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                  placeholder="RecipeFood"
                  disabled={!canEdit}
                  required
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Timezone</p>
                <Input
                  value={form.timezone}
                  onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                  placeholder="Asia/Dhaka"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Base currency</p>
                <Select value={form.currency} onValueChange={(value) => setForm((current) => ({ ...current, currency: value }))} disabled={!canEdit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Used to format every price, invoice, and report across the ERP.</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Warehouses</p>
                <div className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                  {warehouses.length} warehouse{warehouses.length === 1 ? '' : 's'} configured
                </div>
                <Button asChild variant="outline" size="sm" className="rounded-lg">
                  <Link href="/admin/stock/overview">
                    Manage warehouses
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle>Return &amp; refund policy</CardTitle>
              <CardDescription>These defaults apply across Sales &amp; Billing until overridden on an individual order.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Return window (days)</p>
                <Input
                  type="number"
                  min="0"
                  value={form.returnWindowDays}
                  onChange={(event) => setForm((current) => ({ ...current, returnWindowDays: event.target.value }))}
                  placeholder="7"
                  disabled={!canEdit}
                />
                <p className="text-xs text-muted-foreground">Number of days after delivery a customer may request a return.</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Refund method</p>
                <Select
                  value={form.refundPolicy}
                  onValueChange={(value) => setForm((current) => ({ ...current, refundPolicy: value as RefundPolicy }))}
                  disabled={!canEdit}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(refundPolicyLabels) as RefundPolicy[]).map((policy) => (
                      <SelectItem key={policy} value={policy}>{refundPolicyLabels[policy]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{refundPolicyHints[form.refundPolicy]}</p>
              </div>
              <div className="sm:col-span-2 flex items-center justify-between gap-4 rounded-xl border border-border/70 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Restock returned items automatically</p>
                  <p className="text-xs text-muted-foreground">
                    On, returned stock goes back to its warehouse. Off, returns are held aside for manual inspection before restocking.
                  </p>
                </div>
                <Switch
                  checked={form.restockOnReturn}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, restockOnReturn: checked }))}
                  disabled={!canEdit}
                />
              </div>
            </CardContent>
          </Card>

          {canEdit ? (
            <div className="flex justify-end">
              <Button type="submit" className="rounded-xl" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save settings'}
              </Button>
            </div>
          ) : null}
        </form>
      </div>
    </AdminShell>
  )
}

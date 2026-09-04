"use client"

import { useEffect, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useERP } from '@/lib/erp/provider'

type QuickCreateDealerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName?: string
  onCreated: (dealerId: string) => void
}

export function QuickCreateDealerDialog({
  open,
  onOpenChange,
  initialName = '',
  onCreated,
}: QuickCreateDealerDialogProps) {
  const { saveDealer } = useERP()
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initialName)
      setPhone('')
      setAddress('')
      setFeedback(null)
    }
  }, [open, initialName])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setSaving(true)

    try {
      const dealerId = await saveDealer({ name, phone, address })
      onCreated(dealerId)
      onOpenChange(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save dealer.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create new dealer</DialogTitle>
          <DialogDescription>Name and phone number, plus an address if you have it.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Dealer name<span className="ml-0.5 text-rose-500">*</span>
            </p>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Md. Karim Uddin"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Phone number<span className="ml-0.5 text-rose-500">*</span>
            </p>
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="e.g. 01711-000000"
              required
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              Address <span className="font-normal text-muted-foreground">(optional)</span>
            </p>
            <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="e.g. Mirpur, Dhaka" />
          </div>
          {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Create dealer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

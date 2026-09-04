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

type QuickCreateProductDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName?: string
  onCreated: (productId: string) => void
}

export function QuickCreateProductDialog({
  open,
  onOpenChange,
  initialName = '',
  onCreated,
}: QuickCreateProductDialogProps) {
  const { saveProduct } = useERP()

  const [name, setName] = useState(initialName)
  const [sku, setSku] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('0')
  const [sellingPrice, setSellingPrice] = useState('')
  const [stockQty, setStockQty] = useState('0')
  const [minStock, setMinStock] = useState('0')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initialName)
      setSku('')
      setPurchasePrice('0')
      setSellingPrice('')
      setStockQty('0')
      setMinStock('0')
      setFeedback(null)
    }
  }, [open, initialName])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setSaving(true)

    try {
      const productId = await saveProduct({
        name,
        sku,
        category: '',
        purchasePrice: Number(purchasePrice || 0),
        sellingPrice: Number(sellingPrice || 0),
        stockQty: Number(stockQty || 0),
        minStock: Number(minStock || 0),
      })
      onCreated(productId)
      onOpenChange(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save product.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create new product</DialogTitle>
          <DialogDescription>
            Use the essential fields only. Category, serial number, and images can be added later from Inventory.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Product name<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Two Post Service Lift" autoFocus required />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Model / SKU<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input value={sku} onChange={(event) => setSku(event.target.value)} placeholder="TLT240SB" required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Purchase cost</p>
              <Input inputMode="numeric" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="330000" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Selling price<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input inputMode="numeric" value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value)} placeholder="350000" required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Opening stock</p>
              <Input type="number" min="0" value={stockQty} onChange={(event) => setStockQty(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Minimum stock</p>
              <Input type="number" min="0" value={minStock} onChange={(event) => setMinStock(event.target.value)} required />
            </div>
          </div>
          {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Create product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

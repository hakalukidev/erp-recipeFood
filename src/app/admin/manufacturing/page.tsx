"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { Ban, CheckCircle2, ClipboardList, Factory, Plus, Trash2, Truck } from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
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
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { BillOfMaterialRecord, ProductionOrderRecord, ProductionQualityStatus } from '@/lib/erp/types'
import { formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type BomComponentForm = { productId: string; quantityPerBatch: string; percentage: string }

const emptyBomForm = {
  finishedProductId: '',
  outputQuantity: '1',
  expectedYieldPercentage: '100',
  processingLossPercentage: '0',
  packagingRequirement: '',
  components: [{ productId: '', quantityPerBatch: '', percentage: '' }] as BomComponentForm[],
}

const emptyPlanForm = {
  bomId: '',
  plannedBatches: '1',
}

const statusTone: Record<ProductionOrderRecord['status'], string> = {
  planned: 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300',
  'material-issued': 'border-sky-200 bg-sky-500/10 text-sky-700 dark:border-sky-900 dark:text-sky-300',
  completed: 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
  cancelled: 'border-border bg-muted text-muted-foreground',
}

const approvalTone: Record<BillOfMaterialRecord['approvalStatus'], string> = {
  draft: 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300',
  approved: 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
  rejected: 'border-rose-500/40 text-rose-600 dark:text-rose-400',
}

const qcTone: Record<ProductionQualityStatus, string> = {
  pending: 'border-border bg-muted text-muted-foreground',
  passed: 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300',
  failed: 'border-rose-500/40 text-rose-600 dark:text-rose-400',
}

export default function ManufacturingPage() {
  const {
    data,
    saveBillOfMaterial,
    approveBillOfMaterial,
    rejectBillOfMaterial,
    deleteBillOfMaterial,
    createProductionOrder,
    issueMaterialsForProduction,
    completeProduction,
    cancelProductionOrder,
  } = useERP()

  const products = useMemo(() => toArray(data?.products), [data?.products])
  const boms = useMemo(
    () =>
      toArray(data?.billOfMaterials).sort((left, right) => {
        if (left.finishedProductName !== right.finishedProductName) {
          return left.finishedProductName.localeCompare(right.finishedProductName)
        }
        return right.version - left.version
      }),
    [data?.billOfMaterials]
  )
  const usableBoms = useMemo(
    () => boms.filter((bom) => bom.isActive && bom.approvalStatus === 'approved'),
    [boms]
  )
  const productionOrders = useMemo(
    () => toArray(data?.productionOrders).sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.productionOrders]
  )
  const currency = data?.settings.currency

  const [feedback, setFeedback] = useState<string | null>(null)

  const [bomDialogOpen, setBomDialogOpen] = useState(false)
  const [editingBom, setEditingBom] = useState<BillOfMaterialRecord | null>(null)
  const [bomForm, setBomForm] = useState(emptyBomForm)

  const [planDialogOpen, setPlanDialogOpen] = useState(false)
  const [planForm, setPlanForm] = useState(emptyPlanForm)

  const [completeTarget, setCompleteTarget] = useState<ProductionOrderRecord | null>(null)
  const [finishedGoodsQty, setFinishedGoodsQty] = useState('0')
  const [qualityCheckStatus, setQualityCheckStatus] = useState<ProductionQualityStatus>('passed')
  const [qualityCheckNote, setQualityCheckNote] = useState('')
  const [directLabourCost, setDirectLabourCost] = useState('0')
  const [electricityCost, setElectricityCost] = useState('0')
  const [gasFuelCost, setGasFuelCost] = useState('0')
  const [factoryOverheadCost, setFactoryOverheadCost] = useState('0')
  const [processingCost, setProcessingCost] = useState('0')
  const [otherCost, setOtherCost] = useState('0')
  const [qcBatchNumber, setQcBatchNumber] = useState('')
  const [qcMoisture, setQcMoisture] = useState('')
  const [qcColour, setQcColour] = useState('')
  const [qcAroma, setQcAroma] = useState('')
  const [qcWeight, setQcWeight] = useState('')
  const [qcGrade, setQcGrade] = useState('')
  const [qcOfficerName, setQcOfficerName] = useState('')
  const [qcRemarks, setQcRemarks] = useState('')

  function openBomDialog(bom?: BillOfMaterialRecord) {
    setFeedback(null)
    setEditingBom(bom ?? null)
    setBomForm(
      bom
        ? {
            finishedProductId: bom.finishedProductId,
            outputQuantity: String(bom.outputQuantity),
            expectedYieldPercentage: String(bom.expectedYieldPercentage),
            processingLossPercentage: String(bom.processingLossPercentage),
            packagingRequirement: bom.packagingRequirement,
            components: bom.components.map((component) => ({
              productId: component.productId,
              quantityPerBatch: String(component.quantityPerBatch),
              percentage: component.percentage ? String(component.percentage) : '',
            })),
          }
        : emptyBomForm
    )
    setBomDialogOpen(true)
  }

  async function handleSaveBom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    try {
      await saveBillOfMaterial(
        {
          finishedProductId: bomForm.finishedProductId,
          outputQuantity: Number(bomForm.outputQuantity),
          expectedYieldPercentage: Number(bomForm.expectedYieldPercentage),
          processingLossPercentage: Number(bomForm.processingLossPercentage),
          packagingRequirement: bomForm.packagingRequirement,
          components: bomForm.components.map((component) => ({
            productId: component.productId,
            quantityPerBatch: Number(component.quantityPerBatch),
            percentage: component.percentage ? Number(component.percentage) : undefined,
          })),
        },
        editingBom?.id
      )
      setFeedback(
        editingBom
          ? `New version of the ${editingBom.finishedProductName} formula created — pending approval.`
          : 'Recipe/formula created — pending approval.'
      )
      setBomDialogOpen(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save recipe/formula.')
    }
  }

  async function handleDeleteBom(bom: BillOfMaterialRecord) {
    if (!window.confirm(`Delete this draft version of the ${bom.finishedProductName} formula?`)) return
    setFeedback(null)
    try {
      await deleteBillOfMaterial(bom.id)
      setFeedback('Draft formula deleted.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete recipe/formula.')
    }
  }

  async function handleApproveBom(bom: BillOfMaterialRecord) {
    setFeedback(null)
    try {
      await approveBillOfMaterial(bom.id)
      setFeedback(`Version ${bom.version} of the ${bom.finishedProductName} formula approved.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to approve formula.')
    }
  }

  async function handleRejectBom(bom: BillOfMaterialRecord) {
    setFeedback(null)
    try {
      await rejectBillOfMaterial(bom.id)
      setFeedback(`Version ${bom.version} of the ${bom.finishedProductName} formula rejected.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to reject formula.')
    }
  }

  function openPlanDialog() {
    setFeedback(null)
    setPlanForm(emptyPlanForm)
    setPlanDialogOpen(true)
  }

  const planBom = usableBoms.find((bom) => bom.id === planForm.bomId)
  const planBatches = Math.max(Number(planForm.plannedBatches || 0), 0)
  const planRequirement = planBom
    ? planBom.components.map((component) => ({
        ...component,
        requiredQty: component.quantityPerBatch * planBatches,
      }))
    : []

  async function handleCreatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    try {
      const id = await createProductionOrder({
        bomId: planForm.bomId,
        plannedBatches: Number(planForm.plannedBatches),
      })
      setFeedback(`Production plan created (${id}).`)
      setPlanDialogOpen(false)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to create production plan.')
    }
  }

  async function handleIssueMaterials(order: ProductionOrderRecord) {
    setFeedback(null)
    try {
      await issueMaterialsForProduction(order.id)
      setFeedback(`Materials issued for ${order.productionNumber}.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to issue materials.')
    }
  }

  function openCompleteDialog(order: ProductionOrderRecord) {
    setFeedback(null)
    setCompleteTarget(order)
    setFinishedGoodsQty(String(order.plannedOutputQty))
    setQualityCheckStatus('passed')
    setQualityCheckNote('')
    setDirectLabourCost('0')
    setElectricityCost('0')
    setGasFuelCost('0')
    setFactoryOverheadCost('0')
    setProcessingCost('0')
    setOtherCost('0')
    setQcBatchNumber('')
    setQcMoisture('')
    setQcColour('')
    setQcAroma('')
    setQcWeight('')
    setQcGrade('')
    setQcOfficerName('')
    setQcRemarks('')
  }

  const previewMaterialCost = completeTarget ? completeTarget.rawMaterialCost + completeTarget.packagingCost : 0
  const previewConversionCost =
    Number(directLabourCost || 0) +
    Number(electricityCost || 0) +
    Number(gasFuelCost || 0) +
    Number(factoryOverheadCost || 0) +
    Number(processingCost || 0) +
    Number(otherCost || 0)
  const previewTotalCost = previewMaterialCost + previewConversionCost
  const previewUnitCost = Number(finishedGoodsQty || 0) > 0 ? previewTotalCost / Number(finishedGoodsQty) : 0

  async function handleCompleteProduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!completeTarget) return
    setFeedback(null)

    try {
      await completeProduction(completeTarget.id, {
        finishedGoodsQty: Number(finishedGoodsQty),
        qualityCheckStatus,
        qualityCheckNote,
        directLabourCost: Number(directLabourCost),
        electricityCost: Number(electricityCost),
        gasFuelCost: Number(gasFuelCost),
        factoryOverheadCost: Number(factoryOverheadCost),
        processingCost: Number(processingCost),
        otherCost: Number(otherCost),
        qc: {
          batchNumber: qcBatchNumber,
          moisture: qcMoisture,
          colour: qcColour,
          aroma: qcAroma,
          weight: qcWeight,
          qualityGrade: qcGrade,
          qcOfficerName,
          remarks: qcRemarks,
        },
      })
      setFeedback(
        qualityCheckStatus === 'failed'
          ? `Production ${completeTarget.productionNumber} failed QC — ${finishedGoodsQty} units are on hold and not available for sale.`
          : `Production ${completeTarget.productionNumber} completed — unit cost ${formatCurrency(previewUnitCost, currency)}.`
      )
      setCompleteTarget(null)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to complete production.')
    }
  }

  async function handleCancelOrder(order: ProductionOrderRecord) {
    if (!window.confirm(`Cancel production order ${order.productionNumber}?`)) return
    setFeedback(null)
    try {
      await cancelProductionOrder(order.id)
      setFeedback(`Production order ${order.productionNumber} cancelled.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to cancel production order.')
    }
  }

  return (
    <AdminShell active="Manufacturing">
      <div className="space-y-6">
        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ClipboardList className="h-4.5 w-4.5" />
              </div>
              <div>
                <CardTitle>Recipes / Bill of Materials</CardTitle>
                <CardDescription>How much of each raw material one batch of a finished product needs.</CardDescription>
              </div>
            </div>
            <Button onClick={() => openBomDialog()} className="h-10 rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              New recipe
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Finished product</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Yield / Loss</TableHead>
                    <TableHead>Components</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boms.map((bom) => (
                    <TableRow key={bom.id}>
                      <TableCell className="font-medium">
                        {bom.finishedProductName}
                        <p className="text-xs font-normal text-muted-foreground">{bom.formulaCode} · output {bom.outputQuantity}/batch</p>
                      </TableCell>
                      <TableCell>
                        v{bom.version}
                        {bom.isActive ? (
                          <Badge variant="outline" className="ml-1.5 rounded-full border-sky-200 bg-sky-500/10 text-[10px] text-sky-700 dark:border-sky-900 dark:text-sky-300">Current</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{bom.expectedYieldPercentage}% / {bom.processingLossPercentage}%</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {bom.components.map((component) => `${component.productName} x${component.quantityPerBatch}`).join(', ')}
                        {bom.packagingRequirement ? <p className="mt-1 text-xs">Packaging: {bom.packagingRequirement}</p> : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('rounded-full', approvalTone[bom.approvalStatus])}>{bom.approvalStatus}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {bom.approvalStatus === 'draft' ? (
                            <>
                              <Button size="sm" className="h-8 rounded-full" onClick={() => void handleApproveBom(bom)}>Approve</Button>
                              <Button size="sm" variant="outline" className="h-8 rounded-full text-rose-600 hover:text-rose-600 dark:text-rose-400" onClick={() => void handleRejectBom(bom)}>Reject</Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 text-rose-600 hover:text-rose-600 dark:text-rose-400"
                                onClick={() => void handleDeleteBom(bom)}
                                aria-label={`Delete draft recipe for ${bom.finishedProductName}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : null}
                          {bom.isActive ? (
                            <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={() => openBomDialog(bom)}>New version</Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {boms.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                        No recipes yet — create one to start planning production.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                <Factory className="h-4.5 w-4.5" />
              </div>
              <div>
                <CardTitle>Production orders</CardTitle>
                <CardDescription>Production Plan → Material Issue → Production/QC → Finished Goods → Cost Calculation.</CardDescription>
              </div>
            </div>
            <Button onClick={openPlanDialog} className="h-10 rounded-xl" disabled={usableBoms.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              New production plan
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Production</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Planned / Actual</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productionOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="min-w-32">
                        <p className="font-semibold">{order.productionNumber}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                      </TableCell>
                      <TableCell>{order.finishedProductName}</TableCell>
                      <TableCell>
                        {order.plannedOutputQty}
                        {order.status === 'completed' ? ` / ${order.finishedGoodsQty}` : ''}
                        {order.status === 'completed' && order.productionLossQty > 0 ? (
                          <p className={cn('text-xs', order.varianceAlert ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                            Loss: {order.productionLossQty} ({order.productionLossPercentage.toFixed(1)}%)
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className={cn('rounded-full', statusTone[order.status])}>{order.status}</Badge>
                          {order.status === 'completed' ? (
                            <Badge variant="outline" className={cn('rounded-full', qcTone[order.qualityCheckStatus])}>
                              QC: {order.qualityCheckStatus}
                            </Badge>
                          ) : null}
                          {order.varianceAlert ? (
                            <Badge variant="outline" className="rounded-full border-rose-500/40 text-rose-600 dark:text-rose-400">Variance alert</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {order.status === 'completed' ? (
                          <>
                            <p>{formatCurrency(order.totalCost, currency)}</p>
                            <p className="text-xs text-muted-foreground">Unit: {formatCurrency(order.unitCost, currency)}</p>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {order.status === 'planned' ? (
                            <>
                              <Button size="sm" className="h-8 rounded-full" onClick={() => void handleIssueMaterials(order)}>
                                <Truck className="mr-1 h-3.5 w-3.5" /> Issue materials
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 rounded-full p-0 text-rose-600 hover:text-rose-600 dark:text-rose-400"
                                onClick={() => void handleCancelOrder(order)}
                                aria-label={`Cancel ${order.productionNumber}`}
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : null}
                          {order.status === 'material-issued' ? (
                            <>
                              <Button size="sm" className="h-8 rounded-full" onClick={() => openCompleteDialog(order)}>
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Complete
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 rounded-full p-0 text-rose-600 hover:text-rose-600 dark:text-rose-400"
                                onClick={() => void handleCancelOrder(order)}
                                aria-label={`Cancel ${order.productionNumber}`}
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {productionOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                        No production orders yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={bomDialogOpen} onOpenChange={setBomDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBom ? `New version of the ${editingBom.finishedProductName} formula` : 'New recipe/formula'}</DialogTitle>
            <DialogDescription>
              {editingBom
                ? `Saving creates version ${editingBom.version + 1} for approval — version ${editingBom.version} is kept exactly as it was.`
                : 'Defines the raw materials needed for one batch of the finished product. Starts as a draft awaiting approval.'}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSaveBom}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Finished product<span className="ml-0.5 text-rose-500">*</span></p>
                <Select value={bomForm.finishedProductId} onValueChange={(value) => setBomForm((current) => ({ ...current, finishedProductId: value }))} required>
                  <SelectTrigger><SelectValue placeholder="Select a product" /></SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Output per batch<span className="ml-0.5 text-rose-500">*</span></p>
                <Input type="number" min="1" value={bomForm.outputQuantity} onChange={(event) => setBomForm((current) => ({ ...current, outputQuantity: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Expected yield (%)</p>
                <Input type="number" min="0" max="100" value={bomForm.expectedYieldPercentage} onChange={(event) => setBomForm((current) => ({ ...current, expectedYieldPercentage: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Processing loss (%)</p>
                <Input type="number" min="0" max="100" value={bomForm.processingLossPercentage} onChange={(event) => setBomForm((current) => ({ ...current, processingLossPercentage: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Packaging requirement <span className="font-normal text-muted-foreground">(optional)</span></p>
              <Input value={bomForm.packagingRequirement} onChange={(event) => setBomForm((current) => ({ ...current, packagingRequirement: event.target.value }))} placeholder="e.g. 100g pouch with label, 24 pouches per carton" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">Raw material components<span className="ml-0.5 text-rose-500">*</span></p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setBomForm((current) => ({ ...current, components: [...current.components, { productId: '', quantityPerBatch: '', percentage: '' }] }))}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Add component
                </Button>
              </div>
              {bomForm.components.map((component, index) => (
                <div key={index} className="grid grid-cols-[1fr_100px_90px_auto] items-end gap-2 rounded-xl border border-border/70 p-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Raw material</p>
                    <Select
                      value={component.productId}
                      onValueChange={(value) =>
                        setBomForm((current) => ({
                          ...current,
                          components: current.components.map((entry, entryIndex) => (entryIndex === index ? { ...entry, productId: value } : entry)),
                        }))
                      }
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Qty / batch</p>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="h-9"
                      value={component.quantityPerBatch}
                      onChange={(event) =>
                        setBomForm((current) => ({
                          ...current,
                          components: current.components.map((entry, entryIndex) => (entryIndex === index ? { ...entry, quantityPerBatch: event.target.value } : entry)),
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">% <span className="font-normal">(optional)</span></p>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      className="h-9"
                      value={component.percentage}
                      onChange={(event) =>
                        setBomForm((current) => ({
                          ...current,
                          components: current.components.map((entry, entryIndex) => (entryIndex === index ? { ...entry, percentage: event.target.value } : entry)),
                        }))
                      }
                    />
                  </div>
                  {bomForm.components.length > 1 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => setBomForm((current) => ({ ...current, components: current.components.filter((_, entryIndex) => entryIndex !== index) }))}
                      aria-label={`Remove component ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setBomDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-xl">{editingBom ? 'Save new version' : 'Save recipe'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New production plan</DialogTitle>
            <DialogDescription>Raw material requirement is calculated automatically from the recipe.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreatePlan}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Recipe<span className="ml-0.5 text-rose-500">*</span></p>
              <Select value={planForm.bomId} onValueChange={(value) => setPlanForm((current) => ({ ...current, bomId: value }))} required>
                <SelectTrigger><SelectValue placeholder="Select a recipe" /></SelectTrigger>
                <SelectContent>
                  {usableBoms.map((bom) => (
                    <SelectItem key={bom.id} value={bom.id}>{bom.finishedProductName} (v{bom.version})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Planned batches<span className="ml-0.5 text-rose-500">*</span></p>
              <Input type="number" min="1" value={planForm.plannedBatches} onChange={(event) => setPlanForm((current) => ({ ...current, plannedBatches: event.target.value }))} required />
            </div>
            {planBom ? (
              <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raw material requirement (auto-calculated)</p>
                <p className="text-sm">Output: {planBom.outputQuantity * planBatches} units</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {planRequirement.map((line) => (
                    <li key={line.productId}>{line.productName}: {line.requiredQty}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setPlanDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-xl">Create plan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(completeTarget)} onOpenChange={(open) => !open && setCompleteTarget(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete production — {completeTarget?.productionNumber}</DialogTitle>
            <DialogDescription>Production + Quality Check + Finished Goods + Stock Receive + Cost Calculation, in one step.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCompleteProduction}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Finished goods quantity<span className="ml-0.5 text-rose-500">*</span></p>
                <Input type="number" min="0" value={finishedGoodsQty} onChange={(event) => setFinishedGoodsQty(event.target.value)} required />
                <p className="text-xs text-muted-foreground">Planned: {completeTarget?.plannedOutputQty} (actual yield can differ)</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Quality check result</p>
                <Select value={qualityCheckStatus} onValueChange={(value) => setQualityCheckStatus(value as ProductionQualityStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passed">Passed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                {qualityCheckStatus === 'failed' ? (
                  <p className="text-xs text-rose-600 dark:text-rose-400">Failed output goes to QC Hold — it will not be added to sellable stock.</p>
                ) : null}
              </div>
            </div>

            <details className="group space-y-3 rounded-xl border border-border/70 p-3" open>
              <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-muted-foreground">QC parameters (Section 26)</summary>
              <div className="grid gap-3 pt-3 sm:grid-cols-3">
                <Input placeholder="Batch number" value={qcBatchNumber} onChange={(event) => setQcBatchNumber(event.target.value)} />
                <Input placeholder="Moisture" value={qcMoisture} onChange={(event) => setQcMoisture(event.target.value)} />
                <Input placeholder="Colour" value={qcColour} onChange={(event) => setQcColour(event.target.value)} />
                <Input placeholder="Aroma" value={qcAroma} onChange={(event) => setQcAroma(event.target.value)} />
                <Input placeholder="Weight" value={qcWeight} onChange={(event) => setQcWeight(event.target.value)} />
                <Input placeholder="Quality grade" value={qcGrade} onChange={(event) => setQcGrade(event.target.value)} />
                <Input placeholder="QC officer" value={qcOfficerName} onChange={(event) => setQcOfficerName(event.target.value)} />
              </div>
              <Textarea placeholder="Remarks" value={qcRemarks} onChange={(event) => setQcRemarks(event.target.value)} rows={2} />
            </details>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Quality check note <span className="font-normal text-muted-foreground">(optional)</span></p>
              <Textarea value={qualityCheckNote} onChange={(event) => setQualityCheckNote(event.target.value)} rows={2} />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Production cost components (Section 24)</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Direct labour</p>
                  <Input type="number" min="0" value={directLabourCost} onChange={(event) => setDirectLabourCost(event.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Electricity</p>
                  <Input type="number" min="0" value={electricityCost} onChange={(event) => setElectricityCost(event.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Gas / fuel</p>
                  <Input type="number" min="0" value={gasFuelCost} onChange={(event) => setGasFuelCost(event.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Factory overhead</p>
                  <Input type="number" min="0" value={factoryOverheadCost} onChange={(event) => setFactoryOverheadCost(event.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Processing cost</p>
                  <Input type="number" min="0" value={processingCost} onChange={(event) => setProcessingCost(event.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Other cost</p>
                  <Input type="number" min="0" value={otherCost} onChange={(event) => setOtherCost(event.target.value)} placeholder="0" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
              <p>Raw material: {formatCurrency(completeTarget?.rawMaterialCost ?? 0, currency)}</p>
              <p>Packaging: {formatCurrency(completeTarget?.packagingCost ?? 0, currency)}</p>
              <p>Conversion cost (labour/utilities/overhead): {formatCurrency(previewConversionCost, currency)}</p>
              <p className="mt-1 font-medium text-foreground">Total production cost: {formatCurrency(previewTotalCost, currency)}</p>
              <p className="mt-1 text-xl font-semibold text-foreground">Unit production cost: {formatCurrency(previewUnitCost, currency)}</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCompleteTarget(null)}>Cancel</Button>
              <Button type="submit" className="rounded-xl">Complete production</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

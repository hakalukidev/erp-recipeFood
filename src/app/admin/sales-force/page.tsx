"use client"

import { useMemo, useState, type FormEvent } from 'react'
import {
  Award,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  MapPinned,
  Percent,
  Plus,
  Route as RouteIcon,
  Target as TargetIcon,
  Trash2,
  Users,
} from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useERP, VISIT_OUTCOME_LABEL } from '@/lib/erp/provider'
import type {
  CommissionAppliesTo,
  CommissionRuleRecord,
  CommissionRuleType,
  CommissionSlab,
  OrderRecord,
  RouteRecord,
  RouteVisitScheduleRecord,
  SalesTargetEntityType,
  SalesTargetRecord,
  VisitOutcome,
  Weekday,
} from '@/lib/erp/types'
import { WEEKDAYS } from '@/lib/erp/types'
import { formatCurrency, formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type Section = 'officers' | 'routes' | 'schedule' | 'visits' | 'targets' | 'commission'

const SECTIONS: Array<{ id: Section; label: string; icon: typeof RouteIcon }> = [
  { id: 'officers', label: 'Sales Officer Dashboard', icon: Users },
  { id: 'routes', label: 'Routes', icon: RouteIcon },
  { id: 'schedule', label: 'Visit Schedule', icon: CalendarClock },
  { id: 'visits', label: 'Customer Visits', icon: ClipboardCheck },
  { id: 'targets', label: 'Sales Target', icon: TargetIcon },
  { id: 'commission', label: 'Commission Management', icon: Percent },
]

const VISIT_OUTCOMES: VisitOutcome[] = ['order-placed', 'collection-made', 'order-and-collection', 'no-order', 'store-closed']

const WEEKDAY_LABEL: Record<Weekday, string> = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
}

const ENTITY_TYPE_LABEL: Record<SalesTargetEntityType, string> = {
  'sales-officer': 'Sales Officer',
  territory: 'Territory',
  'sales-area': 'Sales Area',
  distributor: 'Distributor',
}

function monthInputValue(date = new Date()) {
  return date.toISOString().slice(0, 7)
}

function dateInputValue(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

// order.total includes VAT (not revenue) — mirrors getOrderNetSales in the
// Finance/Accounting pages so Achievement and Commission are computed on
// the same net-sales figure the rest of the books use.
function getOrderNetSales(order: OrderRecord) {
  return order.total - (order.vat ?? 0)
}

function findMatchingSlab(slabs: CommissionSlab[], salesAmount: number) {
  const candidates = slabs.filter(
    (slab) => salesAmount >= slab.minSales && (slab.maxSales === null || salesAmount <= slab.maxSales)
  )
  if (!candidates.length) return null
  return candidates.reduce((best, slab) => (slab.minSales > best.minSales ? slab : best))
}

function computeProductCommission(rule: CommissionRuleRecord, matchingOrders: OrderRecord[]) {
  let total = 0
  for (const order of matchingOrders) {
    for (const item of order.items) {
      const rate = rule.productRates.find((entry) => entry.productId === item.productId)
      if (rate) total += item.unitPrice * item.quantity * (rate.percentage / 100)
    }
  }
  return total
}

const emptyRouteForm = {
  routeCode: '',
  routeName: '',
  territory: '',
  salesArea: '',
  salesOfficerId: '',
  customerIds: [] as string[],
  status: 'active' as 'active' | 'inactive',
  notes: '',
}

const emptyScheduleForm = {
  routeId: '',
  dayOfWeek: 'sunday' as Weekday,
  customerIds: [] as string[],
  status: 'active' as 'active' | 'inactive',
  notes: '',
}

const emptyVisitForm = {
  salesOfficerId: '',
  customerId: '',
  routeId: '',
  visitDate: dateInputValue(),
  outcome: 'no-order' as VisitOutcome,
  orderId: '',
  collectionId: '',
  remarks: '',
}

const emptyTargetForm = {
  period: monthInputValue(),
  entityType: 'sales-officer' as SalesTargetEntityType,
  entityId: '',
  targetAmount: '0',
}

type SlabForm = { minSales: string; maxSales: string; percentage: string }
type ProductRateForm = { productId: string; percentage: string }

const emptyRuleForm = {
  name: '',
  appliesTo: 'sales-officer' as CommissionAppliesTo,
  ruleType: 'slab' as CommissionRuleType,
  slabs: [{ minSales: '', maxSales: '', percentage: '' }] as SlabForm[],
  productRates: [{ productId: '', percentage: '' }] as ProductRateForm[],
  status: 'active' as 'active' | 'inactive',
}

export default function SalesForcePage() {
  const {
    data,
    hasPermission,
    saveRoute,
    deleteRoute,
    recordCustomerVisit,
    deleteCustomerVisit,
    saveRouteVisitSchedule,
    deleteRouteVisitSchedule,
    saveSalesTarget,
    deleteSalesTarget,
    saveCommissionRule,
    deleteCommissionRule,
    recordCommissionPayout,
  } = useERP()

  const canEditRoutes = hasPermission('orders:edit')
  const canLogVisits = hasPermission('orders:create')
  const canEditFinance = hasPermission('finance:edit')
  const currency = data?.settings.currency

  const [section, setSection] = useState<Section>('officers')
  const [feedback, setFeedback] = useState<string | null>(null)

  const customers = useMemo(() => toArray(data?.customers), [data?.customers])
  const products = useMemo(() => toArray(data?.products), [data?.products])
  const orders = useMemo(() => toArray(data?.orders).filter((order) => order.status !== 'cancelled'), [data?.orders])
  const collections = useMemo(() => toArray(data?.collections), [data?.collections])
  const routes = useMemo(() => toArray(data?.routes).sort((a, b) => a.routeName.localeCompare(b.routeName)), [data?.routes])
  const visits = useMemo(() => toArray(data?.customerVisits).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data?.customerVisits])
  const schedules = useMemo(
    () =>
      toArray(data?.routeVisitSchedules).sort((a, b) =>
        a.dayOfWeek === b.dayOfWeek ? a.routeName.localeCompare(b.routeName) : WEEKDAYS.indexOf(a.dayOfWeek) - WEEKDAYS.indexOf(b.dayOfWeek)
      ),
    [data?.routeVisitSchedules]
  )
  const targets = useMemo(
    () => toArray(data?.salesTargets).sort((a, b) => (a.period === b.period ? a.entityName.localeCompare(b.entityName) : b.period.localeCompare(a.period))),
    [data?.salesTargets]
  )
  const rules = useMemo(() => toArray(data?.commissionRules).sort((a, b) => a.name.localeCompare(b.name)), [data?.commissionRules])
  const activeRules = useMemo(() => rules.filter((rule) => rule.status === 'active'), [rules])
  const payouts = useMemo(() => toArray(data?.commissionPayouts).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data?.commissionPayouts])

  const salesOfficers = useMemo(() => {
    const roles = data?.roles ?? {}
    return toArray(data?.users).filter((user) => roles[user.roleId]?.permissions?.['orders:create'])
  }, [data?.roles, data?.users])
  const territories = useMemo(
    () => Array.from(new Set(customers.map((customer) => customer.territory).filter((value): value is string => Boolean(value)))).sort(),
    [customers]
  )
  const salesAreas = useMemo(
    () => Array.from(new Set(customers.map((customer) => customer.salesArea).filter((value): value is string => Boolean(value)))).sort(),
    [customers]
  )
  const distributors = useMemo(() => customers.filter((customer) => customer.customerType === 'distributor'), [customers])
  const dealers = useMemo(() => customers.filter((customer) => customer.customerType === 'dealer'), [customers])

  // ---- Sales Officer Dashboard (Section 40) -------------------------------
  const [officerPeriod, setOfficerPeriod] = useState(monthInputValue())

  const officerSummaries = useMemo(
    () =>
      salesOfficers.map((officer) => {
        const officerRoutes = routes.filter((route) => route.salesOfficerId === officer.id)
        const officerTerritories = Array.from(new Set(officerRoutes.map((route) => route.territory).filter(Boolean)))
        const periodVisits = visits.filter((visit) => visit.salesOfficerId === officer.id && visit.visitDate.slice(0, 7) === officerPeriod)
        const periodOrders = orders.filter((order) => order.salesPersonId === officer.id && order.createdAt.slice(0, 7) === officerPeriod)
        const orderAmount = periodOrders.reduce((sum, order) => sum + getOrderNetSales(order), 0)
        const periodCollections = collections.filter((collection) => collection.collectedBy === officer.id && collection.collectionDate.slice(0, 7) === officerPeriod)
        const collectionAmount = periodCollections.reduce((sum, collection) => sum + collection.amount, 0)
        const target = targets.find((entry) => entry.entityType === 'sales-officer' && entry.entityId === officer.id && entry.period === officerPeriod)
        const achievement = target && target.targetAmount > 0 ? (orderAmount / target.targetAmount) * 100 : null
        return {
          officer,
          territories: officerTerritories as string[],
          routeCount: officerRoutes.length,
          visitCount: periodVisits.length,
          orderCount: periodOrders.length,
          orderAmount,
          collectionAmount,
          target,
          achievement,
        }
      }),
    [salesOfficers, routes, visits, orders, collections, targets, officerPeriod]
  )

  // ---- Routes --------------------------------------------------------------
  const [routeDialogOpen, setRouteDialogOpen] = useState(false)
  const [editingRouteId, setEditingRouteId] = useState<string | undefined>(undefined)
  const [routeForm, setRouteForm] = useState(emptyRouteForm)

  const routeFormCustomers = useMemo(
    () => customers.filter((customer) => !routeForm.territory || customer.territory === routeForm.territory),
    [customers, routeForm.territory]
  )

  function openRouteDialog(route?: RouteRecord) {
    setFeedback(null)
    setEditingRouteId(route?.id)
    setRouteForm(
      route
        ? {
            routeCode: route.routeCode ?? '',
            routeName: route.routeName,
            territory: route.territory ?? '',
            salesArea: route.salesArea ?? '',
            salesOfficerId: route.salesOfficerId,
            customerIds: route.customerIds,
            status: route.status,
            notes: route.notes,
          }
        : emptyRouteForm
    )
    setRouteDialogOpen(true)
  }

  function toggleRouteCustomer(customerId: string) {
    setRouteForm((current) => ({
      ...current,
      customerIds: current.customerIds.includes(customerId)
        ? current.customerIds.filter((id) => id !== customerId)
        : [...current.customerIds, customerId],
    }))
  }

  async function handleRouteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    try {
      await saveRoute(
        {
          routeCode: routeForm.routeCode || undefined,
          routeName: routeForm.routeName,
          territory: routeForm.territory || undefined,
          salesArea: routeForm.salesArea || undefined,
          salesOfficerId: routeForm.salesOfficerId,
          customerIds: routeForm.customerIds,
          status: routeForm.status,
          notes: routeForm.notes || undefined,
        },
        editingRouteId
      )
      setRouteDialogOpen(false)
      setFeedback('Route saved.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save route.')
    }
  }

  async function handleDeleteRoute(routeId: string) {
    setFeedback(null)
    try {
      await deleteRoute(routeId)
      setFeedback('Route deleted.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete route.')
    }
  }

  // ---- Visit Schedule / "Beat Plan" (Section 45) ---------------------------
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [editingScheduleId, setEditingScheduleId] = useState<string | undefined>(undefined)
  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm)
  const [scheduleOfficerFilter, setScheduleOfficerFilter] = useState('all')

  const scheduleFormRoute = useMemo(() => routes.find((route) => route.id === scheduleForm.routeId), [routes, scheduleForm.routeId])
  const scheduleFormCustomers = useMemo(() => {
    if (!scheduleFormRoute) return []
    return customers.filter((customer) => scheduleFormRoute.customerIds.includes(customer.id))
  }, [scheduleFormRoute, customers])

  const filteredSchedules = useMemo(
    () => (scheduleOfficerFilter === 'all' ? schedules : schedules.filter((schedule) => schedule.salesOfficerId === scheduleOfficerFilter)),
    [schedules, scheduleOfficerFilter]
  )

  function openScheduleDialog(schedule?: RouteVisitScheduleRecord) {
    setFeedback(null)
    setEditingScheduleId(schedule?.id)
    setScheduleForm(
      schedule
        ? {
            routeId: schedule.routeId,
            dayOfWeek: schedule.dayOfWeek,
            customerIds: schedule.customerIds,
            status: schedule.status,
            notes: schedule.notes,
          }
        : emptyScheduleForm
    )
    setScheduleDialogOpen(true)
  }

  function toggleScheduleCustomer(customerId: string) {
    setScheduleForm((current) => ({
      ...current,
      customerIds: current.customerIds.includes(customerId)
        ? current.customerIds.filter((id) => id !== customerId)
        : [...current.customerIds, customerId],
    }))
  }

  async function handleScheduleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    try {
      await saveRouteVisitSchedule(
        {
          routeId: scheduleForm.routeId,
          dayOfWeek: scheduleForm.dayOfWeek,
          customerIds: scheduleForm.customerIds,
          status: scheduleForm.status,
          notes: scheduleForm.notes || undefined,
        },
        editingScheduleId
      )
      setScheduleDialogOpen(false)
      setFeedback('Visit schedule saved.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save visit schedule.')
    }
  }

  async function handleDeleteSchedule(scheduleId: string) {
    setFeedback(null)
    try {
      await deleteRouteVisitSchedule(scheduleId)
      setFeedback('Visit schedule removed.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to remove visit schedule.')
    }
  }

  // ---- Customer Visits -------------------------------------------------
  const [visitDialogOpen, setVisitDialogOpen] = useState(false)
  const [visitForm, setVisitForm] = useState(emptyVisitForm)
  const [visitOfficerFilter, setVisitOfficerFilter] = useState('all')

  const visitFormRoutes = useMemo(
    () => routes.filter((route) => !visitForm.salesOfficerId || route.salesOfficerId === visitForm.salesOfficerId),
    [routes, visitForm.salesOfficerId]
  )
  const visitFormCustomers = useMemo(() => {
    const route = routes.find((entry) => entry.id === visitForm.routeId)
    if (route && route.customerIds.length) {
      return customers.filter((customer) => route.customerIds.includes(customer.id))
    }
    return customers
  }, [routes, visitForm.routeId, customers])
  const visitFormOrders = useMemo(
    () =>
      orders
        .filter((order) => order.customerId === visitForm.customerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10),
    [orders, visitForm.customerId]
  )
  const visitFormCollections = useMemo(
    () =>
      collections
        .filter((collection) => collection.customerId === visitForm.customerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10),
    [collections, visitForm.customerId]
  )

  const filteredVisits = useMemo(
    () => (visitOfficerFilter === 'all' ? visits : visits.filter((visit) => visit.salesOfficerId === visitOfficerFilter)),
    [visits, visitOfficerFilter]
  )

  function openVisitDialog() {
    setFeedback(null)
    setVisitForm(emptyVisitForm)
    setVisitDialogOpen(true)
  }

  async function handleVisitSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    try {
      await recordCustomerVisit({
        visitDate: visitForm.visitDate,
        salesOfficerId: visitForm.salesOfficerId,
        customerId: visitForm.customerId,
        routeId: visitForm.routeId || undefined,
        outcome: visitForm.outcome,
        orderId: visitForm.orderId || undefined,
        collectionId: visitForm.collectionId || undefined,
        remarks: visitForm.remarks || undefined,
      })
      setVisitDialogOpen(false)
      setFeedback('Visit logged.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to log visit.')
    }
  }

  async function handleDeleteVisit(visitId: string) {
    setFeedback(null)
    try {
      await deleteCustomerVisit(visitId)
      setFeedback('Visit removed.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to remove visit.')
    }
  }

  // ---- Sales Target (Section 41) ------------------------------------------
  const [targetDialogOpen, setTargetDialogOpen] = useState(false)
  const [editingTargetId, setEditingTargetId] = useState<string | undefined>(undefined)
  const [targetForm, setTargetForm] = useState(emptyTargetForm)

  function targetEntityOptions(entityType: SalesTargetEntityType) {
    if (entityType === 'sales-officer') return salesOfficers.map((officer) => ({ id: officer.id, label: officer.name }))
    if (entityType === 'distributor') return distributors.map((customer) => ({ id: customer.id, label: customer.name }))
    if (entityType === 'territory') return territories.map((territory) => ({ id: territory, label: territory }))
    return salesAreas.map((area) => ({ id: area, label: area }))
  }

  function resolveEntityName(entityType: SalesTargetEntityType, entityId: string) {
    if (entityType === 'sales-officer') return salesOfficers.find((officer) => officer.id === entityId)?.name ?? entityId
    if (entityType === 'distributor') return distributors.find((customer) => customer.id === entityId)?.name ?? entityId
    return entityId
  }

  function computeEntitySales(entityType: SalesTargetEntityType, entityId: string, entityName: string, period: string) {
    return orders.reduce((sum, order) => {
      if (order.createdAt.slice(0, 7) !== period) return sum
      const customer = data?.customers[order.customerId]
      if (entityType === 'sales-officer' && order.salesPersonId !== entityId) return sum
      if (entityType === 'distributor' && order.customerId !== entityId) return sum
      if (entityType === 'territory' && customer?.territory !== entityName) return sum
      if (entityType === 'sales-area' && customer?.salesArea !== entityName) return sum
      return sum + getOrderNetSales(order)
    }, 0)
  }

  const targetRows = useMemo(
    () =>
      targets.map((target) => {
        const achieved = computeEntitySales(target.entityType, target.entityId, target.entityName, target.period)
        const achievement = target.targetAmount > 0 ? (achieved / target.targetAmount) * 100 : 0
        return { target, achieved, achievement }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets, orders, data?.customers]
  )

  function openTargetDialog(target?: SalesTargetRecord) {
    setFeedback(null)
    setEditingTargetId(target?.id)
    setTargetForm(
      target
        ? {
            period: target.period,
            entityType: target.entityType,
            entityId: target.entityId,
            targetAmount: String(target.targetAmount),
          }
        : emptyTargetForm
    )
    setTargetDialogOpen(true)
  }

  async function handleTargetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    try {
      await saveSalesTarget(
        {
          period: targetForm.period,
          entityType: targetForm.entityType,
          entityId: targetForm.entityId,
          entityName: resolveEntityName(targetForm.entityType, targetForm.entityId),
          targetAmount: Number(targetForm.targetAmount) || 0,
        },
        editingTargetId
      )
      setTargetDialogOpen(false)
      setFeedback('Sales target saved.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save sales target.')
    }
  }

  async function handleDeleteTarget(targetId: string) {
    setFeedback(null)
    try {
      await deleteSalesTarget(targetId)
      setFeedback('Sales target deleted.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete sales target.')
    }
  }

  // ---- Commission Management (Section 42) ---------------------------------
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | undefined>(undefined)
  const [ruleForm, setRuleForm] = useState(emptyRuleForm)
  const [commissionPeriod, setCommissionPeriod] = useState(monthInputValue())

  function openRuleDialog(rule?: CommissionRuleRecord) {
    setFeedback(null)
    setEditingRuleId(rule?.id)
    setRuleForm(
      rule
        ? {
            name: rule.name,
            appliesTo: rule.appliesTo,
            ruleType: rule.ruleType,
            slabs: rule.slabs.length
              ? rule.slabs.map((slab) => ({ minSales: String(slab.minSales), maxSales: slab.maxSales === null ? '' : String(slab.maxSales), percentage: String(slab.percentage) }))
              : emptyRuleForm.slabs,
            productRates: rule.productRates.length
              ? rule.productRates.map((rate) => ({ productId: rate.productId, percentage: String(rate.percentage) }))
              : emptyRuleForm.productRates,
            status: rule.status,
          }
        : emptyRuleForm
    )
    setRuleDialogOpen(true)
  }

  async function handleRuleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    try {
      await saveCommissionRule(
        {
          name: ruleForm.name,
          appliesTo: ruleForm.appliesTo,
          ruleType: ruleForm.ruleType,
          slabs:
            ruleForm.ruleType === 'slab'
              ? ruleForm.slabs.map((slab) => ({
                  minSales: Number(slab.minSales) || 0,
                  maxSales: slab.maxSales.trim() === '' ? null : Number(slab.maxSales),
                  percentage: Number(slab.percentage) || 0,
                }))
              : [],
          productRates:
            ruleForm.ruleType === 'product'
              ? ruleForm.productRates
                  .filter((rate) => rate.productId)
                  .map((rate) => ({
                    productId: rate.productId,
                    productName: products.find((product) => product.id === rate.productId)?.name ?? '',
                    percentage: Number(rate.percentage) || 0,
                  }))
              : [],
          status: ruleForm.status,
        },
        editingRuleId
      )
      setRuleDialogOpen(false)
      setFeedback('Commission rule saved.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to save commission rule.')
    }
  }

  async function handleDeleteRule(ruleId: string) {
    setFeedback(null)
    try {
      await deleteCommissionRule(ruleId)
      setFeedback('Commission rule deleted.')
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to delete commission rule.')
    }
  }

  function calcCommissionRow(appliesTo: CommissionAppliesTo, entityId: string, entityName: string, period: string) {
    const applicable = activeRules.filter((rule) => rule.appliesTo === appliesTo)
    const matchingOrders = orders.filter(
      (order) => order.createdAt.slice(0, 7) === period && (appliesTo === 'sales-officer' ? order.salesPersonId === entityId : order.customerId === entityId)
    )
    const salesAmount = matchingOrders.reduce((sum, order) => sum + getOrderNetSales(order), 0)
    let commissionAmount = 0
    const appliedLabels: string[] = []
    let ruleId = ''
    for (const rule of applicable) {
      if (rule.ruleType === 'slab') {
        const slab = findMatchingSlab(rule.slabs, salesAmount)
        if (slab) {
          commissionAmount += salesAmount * (slab.percentage / 100)
          appliedLabels.push(`${rule.name} (${slab.percentage}%)`)
          if (!ruleId) ruleId = rule.id
        }
      } else {
        const productCommission = computeProductCommission(rule, matchingOrders)
        if (productCommission > 0) {
          commissionAmount += productCommission
          appliedLabels.push(rule.name)
          if (!ruleId) ruleId = rule.id
        }
      }
    }
    const alreadyPaid = payouts.some((payout) => payout.appliesTo === appliesTo && payout.entityId === entityId && payout.period === period)
    return { entityId, entityName, salesAmount, commissionAmount, ruleId, ruleLabel: appliedLabels.join(', ') || '—', alreadyPaid }
  }

  const officerCommissionRows = useMemo(
    () => salesOfficers.map((officer) => calcCommissionRow('sales-officer', officer.id, officer.name, commissionPeriod)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [salesOfficers, activeRules, orders, payouts, commissionPeriod]
  )
  const dealerCommissionRows = useMemo(
    () => dealers.map((dealer) => calcCommissionRow('dealer', dealer.id, dealer.name, commissionPeriod)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dealers, activeRules, orders, payouts, commissionPeriod]
  )

  async function handleMarkPaid(appliesTo: CommissionAppliesTo, row: ReturnType<typeof calcCommissionRow>) {
    setFeedback(null)
    try {
      await recordCommissionPayout({
        period: commissionPeriod,
        appliesTo,
        entityId: row.entityId,
        entityName: row.entityName,
        ruleId: row.ruleId,
        salesAmount: row.salesAmount,
        commissionAmount: row.commissionAmount,
        paymentMethod: 'cash',
      })
      setFeedback(`Commission paid to ${row.entityName}.`)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to record commission payout.')
    }
  }

  return (
    <AdminShell active="Sales Force Management">
      <div className="space-y-8">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Sales Force Management</p>
            <p className="text-xs text-muted-foreground">
              Sales Officer, Territory, Route, Visit Schedule, Customer Visit, Order, Collection, Target, and Achievement —
              tracked in one place (Sections 40-42, 45).
            </p>
          </div>
        </div>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={section === id ? 'default' : 'outline'}
              className="rounded-xl"
              onClick={() => setSection(id)}
            >
              <Icon className="mr-2 h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>

        <Separator />

        {section === 'officers' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader icon={Users} title="Sales officer dashboard" description="One row per Sales Officer — Territory, Route, Visit, Order, Collection, Target, and Achievement for the selected month." />
              <Input type="month" className="w-40" value={officerPeriod} onChange={(event) => setOfficerPeriod(event.target.value)} />
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Sales Officer</TableHead>
                        <TableHead>Territory</TableHead>
                        <TableHead className="text-right">Routes</TableHead>
                        <TableHead className="text-right">Visits</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                        <TableHead className="text-right">Collection</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead className="text-right">Achievement</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {officerSummaries.map((summary) => (
                        <TableRow key={summary.officer.id}>
                          <TableCell className="font-medium">{summary.officer.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{summary.territories.join(', ') || '—'}</TableCell>
                          <TableCell className="text-right">{summary.routeCount}</TableCell>
                          <TableCell className="text-right">{summary.visitCount}</TableCell>
                          <TableCell className="text-right">{summary.orderCount}</TableCell>
                          <TableCell className="text-right">{formatCurrency(summary.orderAmount, currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(summary.collectionAmount, currency)}</TableCell>
                          <TableCell className="text-right">{summary.target ? formatCurrency(summary.target.targetAmount, currency) : '—'}</TableCell>
                          <TableCell className="text-right">
                            {summary.achievement === null ? (
                              '—'
                            ) : (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'rounded-full',
                                  summary.achievement >= 100
                                    ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                                    : 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
                                )}
                              >
                                {summary.achievement.toFixed(1)}%
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {officerSummaries.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                            No sales officers found — assign the Sales Officer role (or any role with Create sales &amp; orders) to a user first.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {section === 'routes' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader icon={RouteIcon} title="Routes" description="Group a territory's customers under one Sales Officer for visit planning (Section 40)." />
              <Button type="button" className="rounded-xl" onClick={() => openRouteDialog()} disabled={!canEditRoutes}>
                <Plus className="mr-2 h-4 w-4" />
                New route
              </Button>
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Route</TableHead>
                        <TableHead>Territory / Area</TableHead>
                        <TableHead>Sales Officer</TableHead>
                        <TableHead className="text-right">Customers</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {routes.map((route) => (
                        <TableRow key={route.id}>
                          <TableCell>
                            <p className="font-medium">{route.routeName}</p>
                            <p className="text-xs text-muted-foreground">{route.routeCode}</p>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {[route.territory, route.salesArea].filter(Boolean).join(' / ') || '—'}
                          </TableCell>
                          <TableCell>{route.salesOfficerName}</TableCell>
                          <TableCell className="text-right">{route.customerIds.length}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('rounded-full', route.status === 'active' ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300' : 'border-border bg-muted text-muted-foreground')}>
                              {route.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openRouteDialog(route)} disabled={!canEditRoutes}>
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                onClick={() => void handleDeleteRoute(route.id)}
                                disabled={!canEditRoutes}
                                aria-label="Delete route"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {routes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                            No routes yet — add one to group customers under a Sales Officer.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Dialog open={routeDialogOpen} onOpenChange={setRouteDialogOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingRouteId ? 'Edit route' : 'New route'}</DialogTitle>
                  <DialogDescription>Assign a Sales Officer to a territory and the customers on this route.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleRouteSubmit}>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Route name<span className="ml-0.5 text-rose-500">*</span></p>
                    <Input value={routeForm.routeName} onChange={(event) => setRouteForm((current) => ({ ...current, routeName: event.target.value }))} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Territory</p>
                      <Input value={routeForm.territory} onChange={(event) => setRouteForm((current) => ({ ...current, territory: event.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Sales area</p>
                      <Input value={routeForm.salesArea} onChange={(event) => setRouteForm((current) => ({ ...current, salesArea: event.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Sales Officer<span className="ml-0.5 text-rose-500">*</span></p>
                    <Select value={routeForm.salesOfficerId} onValueChange={(value) => setRouteForm((current) => ({ ...current, salesOfficerId: value }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {salesOfficers.map((officer) => (
                          <SelectItem key={officer.id} value={officer.id}>{officer.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Status</p>
                    <Select value={routeForm.status} onValueChange={(value) => setRouteForm((current) => ({ ...current, status: value as 'active' | 'inactive' }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Customers on this route</p>
                    <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-border/70 p-2">
                      {routeFormCustomers.map((customer) => (
                        <label key={customer.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50">
                          <input type="checkbox" checked={routeForm.customerIds.includes(customer.id)} onChange={() => toggleRouteCustomer(customer.id)} />
                          <span className="flex-1">{customer.name}</span>
                          <span className="text-xs text-muted-foreground">{customer.territory}</span>
                        </label>
                      ))}
                      {routeFormCustomers.length === 0 ? <p className="p-2 text-xs text-muted-foreground">No customers match this territory.</p> : null}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Notes <span className="font-normal text-muted-foreground">(optional)</span></p>
                    <Textarea rows={2} value={routeForm.notes} onChange={(event) => setRouteForm((current) => ({ ...current, notes: event.target.value }))} />
                  </div>
                  <Button type="submit" className="w-full rounded-xl">Save route</Button>
                </form>
              </DialogContent>
            </Dialog>
          </section>
        ) : null}

        {section === 'schedule' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader
                icon={CalendarClock}
                title="Visit schedule"
                description="A weekly beat plan — which customers on a route a Sales Officer is due to call on each day (Section 45)."
              />
              <div className="flex flex-wrap items-center gap-2">
                <Select value={scheduleOfficerFilter} onValueChange={setScheduleOfficerFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All officers</SelectItem>
                    {salesOfficers.map((officer) => (
                      <SelectItem key={officer.id} value={officer.id}>{officer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" className="rounded-xl" onClick={() => openScheduleDialog()} disabled={!canEditRoutes || routes.length === 0}>
                  <Plus className="mr-2 h-4 w-4" />
                  New schedule
                </Button>
              </div>
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Day</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead>Sales Officer</TableHead>
                        <TableHead>Territory</TableHead>
                        <TableHead className="text-right">Customers</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSchedules.map((schedule) => (
                        <TableRow key={schedule.id}>
                          <TableCell className="font-medium">{WEEKDAY_LABEL[schedule.dayOfWeek]}</TableCell>
                          <TableCell>{schedule.routeName}</TableCell>
                          <TableCell>{schedule.salesOfficerName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{schedule.territory || '—'}</TableCell>
                          <TableCell className="text-right">{schedule.customerIds.length}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('rounded-full', schedule.status === 'active' ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300' : 'border-border bg-muted text-muted-foreground')}>
                              {schedule.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openScheduleDialog(schedule)} disabled={!canEditRoutes}>
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                onClick={() => void handleDeleteSchedule(schedule.id)}
                                disabled={!canEditRoutes}
                                aria-label="Remove schedule"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredSchedules.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            No visit schedule planned yet — add a route first, then plan which day it gets called on.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingScheduleId ? 'Edit visit schedule' : 'New visit schedule'}</DialogTitle>
                  <DialogDescription>Pick a route and the day of week it should be called on, and which of its customers to visit that day.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleScheduleSubmit}>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Route<span className="ml-0.5 text-rose-500">*</span></p>
                    <Select
                      value={scheduleForm.routeId}
                      onValueChange={(value) => setScheduleForm((current) => ({ ...current, routeId: value, customerIds: [] }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {routes.map((route) => (
                          <SelectItem key={route.id} value={route.id}>{route.routeName} — {route.salesOfficerName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Day of week</p>
                      <Select value={scheduleForm.dayOfWeek} onValueChange={(value) => setScheduleForm((current) => ({ ...current, dayOfWeek: value as Weekday }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WEEKDAYS.map((day) => (
                            <SelectItem key={day} value={day}>{WEEKDAY_LABEL[day]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Status</p>
                      <Select value={scheduleForm.status} onValueChange={(value) => setScheduleForm((current) => ({ ...current, status: value as 'active' | 'inactive' }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Customers to visit that day</p>
                    <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-border/70 p-2">
                      {scheduleFormCustomers.map((customer) => (
                        <label key={customer.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50">
                          <input type="checkbox" checked={scheduleForm.customerIds.includes(customer.id)} onChange={() => toggleScheduleCustomer(customer.id)} />
                          <span className="flex-1">{customer.name}</span>
                        </label>
                      ))}
                      {scheduleFormCustomers.length === 0 ? (
                        <p className="p-2 text-xs text-muted-foreground">
                          {scheduleFormRoute ? 'This route has no customers yet — add some from the Routes tab.' : 'Select a route first.'}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Notes <span className="font-normal text-muted-foreground">(optional)</span></p>
                    <Textarea rows={2} value={scheduleForm.notes} onChange={(event) => setScheduleForm((current) => ({ ...current, notes: event.target.value }))} />
                  </div>
                  <Button type="submit" className="w-full rounded-xl" disabled={!scheduleForm.routeId}>Save schedule</Button>
                </form>
              </DialogContent>
            </Dialog>
          </section>
        ) : null}

        {section === 'visits' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader icon={ClipboardCheck} title="Customer visits" description="Log a field visit — link the Order/Collection it produced so the officer dashboard can track it (Section 40)." />
              <div className="flex flex-wrap items-center gap-2">
                <Select value={visitOfficerFilter} onValueChange={setVisitOfficerFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All officers</SelectItem>
                    {salesOfficers.map((officer) => (
                      <SelectItem key={officer.id} value={officer.id}>{officer.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" className="rounded-xl" onClick={openVisitDialog} disabled={!canLogVisits}>
                  <Plus className="mr-2 h-4 w-4" />
                  Log visit
                </Button>
              </div>
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Date</TableHead>
                        <TableHead>Sales Officer</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead className="text-right">Order</TableHead>
                        <TableHead className="text-right">Collection</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVisits.map((visit) => (
                        <TableRow key={visit.id}>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(visit.visitDate)}</TableCell>
                          <TableCell>{visit.salesOfficerName}</TableCell>
                          <TableCell>{visit.customerName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{visit.routeName || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="rounded-full">{VISIT_OUTCOME_LABEL[visit.outcome]}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{visit.orderAmount ? formatCurrency(visit.orderAmount, currency) : '—'}</TableCell>
                          <TableCell className="text-right">{visit.collectionAmount ? formatCurrency(visit.collectionAmount, currency) : '—'}</TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                onClick={() => void handleDeleteVisit(visit.id)}
                                disabled={!canEditRoutes}
                                aria-label="Remove visit"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredVisits.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                            No visits logged yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Dialog open={visitDialogOpen} onOpenChange={setVisitDialogOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Log customer visit</DialogTitle>
                  <DialogDescription>Optionally link the Order or Collection this visit resulted in.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleVisitSubmit}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Sales Officer<span className="ml-0.5 text-rose-500">*</span></p>
                      <Select value={visitForm.salesOfficerId} onValueChange={(value) => setVisitForm((current) => ({ ...current, salesOfficerId: value }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {salesOfficers.map((officer) => (
                            <SelectItem key={officer.id} value={officer.id}>{officer.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Visit date</p>
                      <Input type="date" value={visitForm.visitDate.slice(0, 10)} onChange={(event) => setVisitForm((current) => ({ ...current, visitDate: event.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Route <span className="font-normal text-muted-foreground">(optional, narrows the customer list)</span></p>
                    <Select value={visitForm.routeId || 'none'} onValueChange={(value) => setVisitForm((current) => ({ ...current, routeId: value === 'none' ? '' : value, customerId: '' }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No route</SelectItem>
                        {visitFormRoutes.map((route) => (
                          <SelectItem key={route.id} value={route.id}>{route.routeName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Customer<span className="ml-0.5 text-rose-500">*</span></p>
                    <Select value={visitForm.customerId} onValueChange={(value) => setVisitForm((current) => ({ ...current, customerId: value, orderId: '', collectionId: '' }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {visitFormCustomers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Outcome</p>
                    <Select value={visitForm.outcome} onValueChange={(value) => setVisitForm((current) => ({ ...current, outcome: value as VisitOutcome }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VISIT_OUTCOMES.map((outcome) => (
                          <SelectItem key={outcome} value={outcome}>{VISIT_OUTCOME_LABEL[outcome]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Order placed <span className="font-normal text-muted-foreground">(optional)</span></p>
                      <Select value={visitForm.orderId || 'none'} onValueChange={(value) => setVisitForm((current) => ({ ...current, orderId: value === 'none' ? '' : value }))} disabled={!visitForm.customerId}>
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {visitFormOrders.map((order) => (
                            <SelectItem key={order.id} value={order.id}>{order.billNumber} — {formatCurrency(order.total, currency)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Collection made <span className="font-normal text-muted-foreground">(optional)</span></p>
                      <Select value={visitForm.collectionId || 'none'} onValueChange={(value) => setVisitForm((current) => ({ ...current, collectionId: value === 'none' ? '' : value }))} disabled={!visitForm.customerId}>
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {visitFormCollections.map((collection) => (
                            <SelectItem key={collection.id} value={collection.id}>{collection.receiptNumber} — {formatCurrency(collection.amount, currency)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Remarks <span className="font-normal text-muted-foreground">(optional)</span></p>
                    <Textarea rows={2} value={visitForm.remarks} onChange={(event) => setVisitForm((current) => ({ ...current, remarks: event.target.value }))} />
                  </div>
                  <Button type="submit" className="w-full rounded-xl">Save visit</Button>
                </form>
              </DialogContent>
            </Dialog>
          </section>
        ) : null}

        {section === 'targets' ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader icon={TargetIcon} title="Sales target" description="Set a monthly target per Sales Officer, Territory, Sales Area, or Distributor — Sales and Achievement track live from orders (Section 41)." />
              <Button type="button" className="rounded-xl" onClick={() => openTargetDialog()} disabled={!canEditFinance}>
                <Plus className="mr-2 h-4 w-4" />
                New target
              </Button>
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Period</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead className="text-right">Sales</TableHead>
                        <TableHead className="text-right">Achievement</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {targetRows.map(({ target, achieved, achievement }) => (
                        <TableRow key={target.id}>
                          <TableCell>{target.period}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{ENTITY_TYPE_LABEL[target.entityType]}</TableCell>
                          <TableCell className="font-medium">{target.entityName}</TableCell>
                          <TableCell className="text-right">{formatCurrency(target.targetAmount, currency)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(achieved, currency)}</TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={cn(
                                'rounded-full',
                                achievement >= 100
                                  ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
                                  : 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
                              )}
                            >
                              {achievement.toFixed(1)}%
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openTargetDialog(target)} disabled={!canEditFinance}>
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                onClick={() => void handleDeleteTarget(target.id)}
                                disabled={!canEditFinance}
                                aria-label="Delete target"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {targetRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            No sales targets set yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingTargetId ? 'Edit sales target' : 'New sales target'}</DialogTitle>
                  <DialogDescription>Sales and Achievement are computed live from orders — never entered by hand.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleTargetSubmit}>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Month</p>
                    <Input type="month" value={targetForm.period} onChange={(event) => setTargetForm((current) => ({ ...current, period: event.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Applies to</p>
                    <Select value={targetForm.entityType} onValueChange={(value) => setTargetForm((current) => ({ ...current, entityType: value as SalesTargetEntityType, entityId: '' }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ENTITY_TYPE_LABEL) as SalesTargetEntityType[]).map((type) => (
                          <SelectItem key={type} value={type}>{ENTITY_TYPE_LABEL[type]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">{ENTITY_TYPE_LABEL[targetForm.entityType]}<span className="ml-0.5 text-rose-500">*</span></p>
                    <Select value={targetForm.entityId} onValueChange={(value) => setTargetForm((current) => ({ ...current, entityId: value }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {targetEntityOptions(targetForm.entityType).map((option) => (
                          <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Target amount ({currency ?? 'BDT'})<span className="ml-0.5 text-rose-500">*</span></p>
                    <Input type="number" min="1" value={targetForm.targetAmount} onChange={(event) => setTargetForm((current) => ({ ...current, targetAmount: event.target.value }))} required />
                  </div>
                  <Button type="submit" className="w-full rounded-xl">Save target</Button>
                </form>
              </DialogContent>
            </Dialog>
          </section>
        ) : null}

        {section === 'commission' ? (
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader icon={Percent} title="Commission rules" description="Sales-value slabs (e.g. Sales > ৳10 lakh = X%) or product-wise rates — the system calculates commission automatically (Section 42)." />
              <Button type="button" className="rounded-xl" onClick={() => openRuleDialog()} disabled={!canEditFinance}>
                <Plus className="mr-2 h-4 w-4" />
                New rule
              </Button>
            </div>

            <Card className="border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto rounded-2xl">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Rule</TableHead>
                        <TableHead>Applies to</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Detail</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-medium">{rule.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{rule.appliesTo === 'sales-officer' ? 'Sales Officer' : 'Dealer'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{rule.ruleType === 'slab' ? 'Sales slab' : 'Product-wise'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {rule.ruleType === 'slab'
                              ? rule.slabs.map((slab, index) => (
                                  <span key={index} className="mr-2 inline-block">
                                    {formatCurrency(slab.minSales, currency)}{slab.maxSales !== null ? `–${formatCurrency(slab.maxSales, currency)}` : '+'} → {slab.percentage}%
                                  </span>
                                ))
                              : rule.productRates.map((rate) => `${rate.productName} (${rate.percentage}%)`).join(', ')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('rounded-full', rule.status === 'active' ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300' : 'border-border bg-muted text-muted-foreground')}>
                              {rule.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => openRuleDialog(rule)} disabled={!canEditFinance}>
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 text-destructive hover:text-destructive"
                                onClick={() => void handleDeleteRule(rule.id)}
                                disabled={!canEditFinance}
                                aria-label="Delete rule"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {rules.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                            No commission rules yet.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader icon={Award} title="Calculated commission" description="Live commission for the selected month, from active rules × that period's sales." />
              <Input type="month" className="w-40" value={commissionPeriod} onChange={(event) => setCommissionPeriod(event.target.value)} />
            </div>

            {([
              { label: 'Sales Officer commission', appliesTo: 'sales-officer' as CommissionAppliesTo, rows: officerCommissionRows },
              { label: 'Dealer commission', appliesTo: 'dealer' as CommissionAppliesTo, rows: dealerCommissionRows },
            ]).map(({ label, appliesTo, rows }) => (
              <Card key={appliesTo} className="border-border/70 shadow-sm">
                <CardContent className="p-0">
                  <p className="border-b border-border/70 p-4 text-sm font-medium text-foreground">{label}</p>
                  <div className="overflow-x-auto rounded-b-2xl">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableHead>{appliesTo === 'sales-officer' ? 'Sales Officer' : 'Dealer'}</TableHead>
                          <TableHead className="text-right">Sales</TableHead>
                          <TableHead>Applied rule</TableHead>
                          <TableHead className="text-right">Commission</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row) => (
                          <TableRow key={row.entityId}>
                            <TableCell className="font-medium">{row.entityName}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.salesAmount, currency)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.ruleLabel}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(row.commissionAmount, currency)}</TableCell>
                            <TableCell className="text-right">
                              {row.alreadyPaid ? (
                                <Badge variant="outline" className="gap-1 rounded-full border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Paid
                                </Badge>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg"
                                  onClick={() => void handleMarkPaid(appliesTo, row)}
                                  disabled={!canEditFinance || row.commissionAmount <= 0}
                                >
                                  Mark paid
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {rows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                              {appliesTo === 'sales-officer' ? 'No sales officers found.' : 'No dealer-type customers found.'}
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingRuleId ? 'Edit commission rule' : 'New commission rule'}</DialogTitle>
                  <DialogDescription>Choose a sales-value slab table or a per-product commission rate table.</DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleRuleSubmit}>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Rule name<span className="ml-0.5 text-rose-500">*</span></p>
                    <Input value={ruleForm.name} onChange={(event) => setRuleForm((current) => ({ ...current, name: event.target.value }))} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Applies to</p>
                      <Select value={ruleForm.appliesTo} onValueChange={(value) => setRuleForm((current) => ({ ...current, appliesTo: value as CommissionAppliesTo }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sales-officer">Sales Officer</SelectItem>
                          <SelectItem value="dealer">Dealer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-foreground">Rule type</p>
                      <Select value={ruleForm.ruleType} onValueChange={(value) => setRuleForm((current) => ({ ...current, ruleType: value as CommissionRuleType }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="slab">Sales value slab</SelectItem>
                          <SelectItem value="product">Product-wise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Status</p>
                    <Select value={ruleForm.status} onValueChange={(value) => setRuleForm((current) => ({ ...current, status: value as 'active' | 'inactive' }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {ruleForm.ruleType === 'slab' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">Sales slabs</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setRuleForm((current) => ({ ...current, slabs: [...current.slabs, { minSales: '', maxSales: '', percentage: '' }] }))}
                        >
                          <Plus className="mr-1.5 h-4 w-4" /> Add slab
                        </Button>
                      </div>
                      {ruleForm.slabs.map((slab, index) => (
                        <div key={index} className="grid grid-cols-[1fr_1fr_90px_auto] items-end gap-2 rounded-xl border border-border/70 p-3">
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Min sales</p>
                            <Input
                              type="number"
                              min="0"
                              className="h-9"
                              value={slab.minSales}
                              onChange={(event) =>
                                setRuleForm((current) => ({ ...current, slabs: current.slabs.map((entry, i) => (i === index ? { ...entry, minSales: event.target.value } : entry)) }))
                              }
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Max sales <span className="font-normal">(blank = no limit)</span></p>
                            <Input
                              type="number"
                              min="0"
                              className="h-9"
                              value={slab.maxSales}
                              onChange={(event) =>
                                setRuleForm((current) => ({ ...current, slabs: current.slabs.map((entry, i) => (i === index ? { ...entry, maxSales: event.target.value } : entry)) }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">%</p>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              className="h-9"
                              value={slab.percentage}
                              onChange={(event) =>
                                setRuleForm((current) => ({ ...current, slabs: current.slabs.map((entry, i) => (i === index ? { ...entry, percentage: event.target.value } : entry)) }))
                              }
                              required
                            />
                          </div>
                          {ruleForm.slabs.length > 1 ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => setRuleForm((current) => ({ ...current, slabs: current.slabs.filter((_, i) => i !== index) }))}
                              aria-label={`Remove slab ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">Product rates</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setRuleForm((current) => ({ ...current, productRates: [...current.productRates, { productId: '', percentage: '' }] }))}
                        >
                          <Plus className="mr-1.5 h-4 w-4" /> Add product
                        </Button>
                      </div>
                      {ruleForm.productRates.map((rate, index) => (
                        <div key={index} className="grid grid-cols-[1fr_90px_auto] items-end gap-2 rounded-xl border border-border/70 p-3">
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Product</p>
                            <Select
                              value={rate.productId}
                              onValueChange={(value) =>
                                setRuleForm((current) => ({ ...current, productRates: current.productRates.map((entry, i) => (i === index ? { ...entry, productId: value } : entry)) }))
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
                            <p className="text-xs font-medium text-muted-foreground">%</p>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              className="h-9"
                              value={rate.percentage}
                              onChange={(event) =>
                                setRuleForm((current) => ({ ...current, productRates: current.productRates.map((entry, i) => (i === index ? { ...entry, percentage: event.target.value } : entry)) }))
                              }
                              required
                            />
                          </div>
                          {ruleForm.productRates.length > 1 ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => setRuleForm((current) => ({ ...current, productRates: current.productRates.filter((_, i) => i !== index) }))}
                              aria-label={`Remove product ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  <Button type="submit" className="w-full rounded-xl">Save rule</Button>
                </form>
              </DialogContent>
            </Dialog>
          </section>
        ) : null}

        {!canEditFinance ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPinned className="h-3.5 w-3.5" />
            Sales Target and Commission Management require the Finance edit permission — Routes and Visits use the Sales &amp; orders permissions instead.
          </p>
        ) : null}
      </div>
    </AdminShell>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof RouteIcon
  title: string
  description: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}


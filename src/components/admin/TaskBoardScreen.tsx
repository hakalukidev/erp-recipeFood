"use client"

import { useMemo, useState, type FormEvent } from 'react'
import { CalendarClock, Plus, User } from 'lucide-react'

import { AdminShell } from './AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useERP } from '@/lib/erp/provider'
import type { TaskRecord } from '@/lib/erp/types'
import { formatDate, toArray } from '@/lib/erp/utils'
import { cn } from '@/lib/utils'

type TaskFormState = {
  title: string
  description: string
  module: TaskRecord['module']
  priority: TaskRecord['priority']
  assigneeId: string
  dueDate: string
}

function defaultDueDate() {
  const date = new Date()
  date.setDate(date.getDate() + 3)
  return date.toISOString().slice(0, 10)
}

function emptyTaskForm(): TaskFormState {
  return {
    title: '',
    description: '',
    module: 'inventory',
    priority: 'medium',
    assigneeId: '',
    dueDate: defaultDueDate(),
  }
}

const statusColumns: { status: TaskRecord['status']; label: string; hint: string }[] = [
  { status: 'pending', label: 'Pending', hint: 'Not started yet' },
  { status: 'in-progress', label: 'In progress', hint: 'Currently being worked on' },
  { status: 'done', label: 'Done', hint: 'Completed' },
]

const moduleLabels: Record<TaskRecord['module'], string> = {
  inventory: 'Inventory',
  sales: 'Sales',
  support: 'Support',
  warehouse: 'Warehouse',
}

const priorityLabels: Record<TaskRecord['priority'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

function priorityToneClass(priority: TaskRecord['priority']) {
  if (priority === 'high') {
    return 'border-rose-200 bg-rose-500/10 text-rose-700 dark:border-rose-900 dark:text-rose-300'
  }

  if (priority === 'medium') {
    return 'border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900 dark:text-amber-300'
  }

  return 'border-emerald-200 bg-emerald-500/10 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
}

function isOverdue(task: TaskRecord) {
  if (task.status === 'done') {
    return false
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return new Date(task.dueDate) < today
}

export function TaskBoardScreen() {
  const { data, createTask, updateTaskStatus, loading } = useERP()

  const tasks = useMemo(
    () => [...toArray(data?.tasks)].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [data?.tasks]
  )
  const activeUsers = useMemo(
    () => toArray(data?.users).filter((user) => user.status === 'active'),
    [data?.users]
  )

  const [query, setQuery] = useState('')
  const [moduleFilter, setModuleFilter] = useState<TaskRecord['module'] | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TaskRecord['priority'] | 'all'>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [taskForm, setTaskForm] = useState<TaskFormState>(() => emptyTaskForm())
  const [isSaving, setIsSaving] = useState(false)

  const assigneeOptions: ComboboxOption[] = useMemo(
    () => activeUsers.map((user) => ({ value: user.id, label: user.name, sublabel: user.title || user.loginId })),
    [activeUsers]
  )

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return tasks.filter((task) => {
      const matchesSearch =
        !normalizedQuery ||
        [task.title, task.description, task.assigneeName].join(' ').toLowerCase().includes(normalizedQuery)
      const matchesModule = moduleFilter === 'all' || task.module === moduleFilter
      const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter
      const matchesAssignee = assigneeFilter === 'all' || task.assigneeId === assigneeFilter

      return matchesSearch && matchesModule && matchesPriority && matchesAssignee
    })
  }, [tasks, query, moduleFilter, priorityFilter, assigneeFilter])

  const metrics = useMemo(
    () => ({
      total: tasks.length,
      pending: tasks.filter((task) => task.status === 'pending').length,
      inProgress: tasks.filter((task) => task.status === 'in-progress').length,
      done: tasks.filter((task) => task.status === 'done').length,
      overdue: tasks.filter(isOverdue).length,
    }),
    [tasks]
  )

  const assigneeFilterOptions = useMemo(() => {
    const map = new Map<string, string>()
    tasks.forEach((task) => map.set(task.assigneeId, task.assigneeName))
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [tasks])

  function openCreateDialog() {
    setTaskForm(emptyTaskForm())
    setFeedback(null)
    setNewTaskOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)

    if (!taskForm.assigneeId) {
      setFeedback('Select who this task should be assigned to.')
      return
    }

    setIsSaving(true)

    try {
      await createTask({
        title: taskForm.title,
        description: taskForm.description,
        module: taskForm.module,
        priority: taskForm.priority,
        assigneeId: taskForm.assigneeId,
        dueDate: taskForm.dueDate,
      })
      setFeedback('Task assigned successfully.')
      setNewTaskOpen(false)
      setTaskForm(emptyTaskForm())
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to create task.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleStatusChange(task: TaskRecord, status: TaskRecord['status']) {
    if (task.status === status) {
      return
    }

    setFeedback(null)
    setBusyTaskId(task.id)

    try {
      await updateTaskStatus(task.id, status)
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : 'Unable to update task status.')
    } finally {
      setBusyTaskId(null)
    }
  }

  return (
    <AdminShell active="Task Board">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Total tasks', metrics.total, 'Assigned across all modules'],
            ['Pending', metrics.pending, 'Not started yet'],
            ['In progress', metrics.inProgress, 'Currently being worked on'],
            ['Done', metrics.done, 'Completed tasks'],
            ['Overdue', metrics.overdue, 'Past due date, not yet done'],
          ].map(([label, value, note]) => (
            <Card key={label as string} className="border-border/70 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {feedback ? (
          <Card className="border-border/70 bg-primary/5 shadow-sm">
            <CardContent className="p-4 text-sm text-primary">{feedback}</CardContent>
          </Card>
        ) : null}

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Task board</CardTitle>
              <CardDescription>Assign work across inventory, sales, support, and warehouse, and track it to done.</CardDescription>
            </div>
            <Button onClick={openCreateDialog} className="h-10 rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              New task
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search title, description, assignee"
              />
              <Select value={moduleFilter} onValueChange={(value) => setModuleFilter(value as typeof moduleFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="All modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  {(Object.keys(moduleLabels) as TaskRecord['module'][]).map((module) => (
                    <SelectItem key={module} value={module}>
                      {moduleLabels[module]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as typeof priorityFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="All priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  {(Object.keys(priorityLabels) as TaskRecord['priority'][]).map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priorityLabels[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All assignees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignees</SelectItem>
                  {assigneeFilterOptions.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {statusColumns.map((column) => {
                const columnTasks = filteredTasks.filter((task) => task.status === column.status)

                return (
                  <div key={column.status} className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
                    <div className="flex items-center justify-between px-1">
                      <div>
                        <p className="font-semibold">{column.label}</p>
                        <p className="text-xs text-muted-foreground">{column.hint}</p>
                      </div>
                      <Badge variant="outline" className="rounded-full">{columnTasks.length}</Badge>
                    </div>

                    <div className="space-y-3">
                      {columnTasks.map((task) => {
                        const overdue = isOverdue(task)

                        return (
                          <Card key={task.id} className="border-border/70 shadow-sm">
                            <CardContent className="space-y-3 p-4">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold leading-snug">{task.title}</p>
                                <Badge variant="outline" className={cn('shrink-0 rounded-full', priorityToneClass(task.priority))}>
                                  {priorityLabels[task.priority]}
                                </Badge>
                              </div>
                              {task.description ? (
                                <p className="text-sm text-muted-foreground">{task.description}</p>
                              ) : null}
                              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                <Badge variant="outline" className="rounded-full">{moduleLabels[task.module]}</Badge>
                                <span className="flex items-center gap-1">
                                  <User className="h-3.5 w-3.5" />
                                  {task.assigneeName}
                                </span>
                                <span className={cn('flex items-center gap-1', overdue && 'font-semibold text-rose-600 dark:text-rose-400')}>
                                  <CalendarClock className="h-3.5 w-3.5" />
                                  {formatDate(task.dueDate)}
                                  {overdue ? ' · overdue' : ''}
                                </span>
                              </div>
                              <Select
                                value={task.status}
                                onValueChange={(value) => void handleStatusChange(task, value as TaskRecord['status'])}
                                disabled={busyTaskId === task.id}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="in-progress">In progress</SelectItem>
                                  <SelectItem value="done">Done</SelectItem>
                                </SelectContent>
                              </Select>
                            </CardContent>
                          </Card>
                        )
                      })}
                      {columnTasks.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                          No tasks here.
                        </p>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-4 text-sm text-muted-foreground">Loading tasks...</CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={newTaskOpen} onOpenChange={setNewTaskOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign new task</DialogTitle>
            <DialogDescription>Assign work to a teammate and track it through to done.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Title<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input
                value={taskForm.title}
                onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="e.g. Follow up low stock for Punjabi"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Description <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <Textarea
                value={taskForm.description}
                onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="What needs to happen"
                rows={3}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Module</p>
                <Select value={taskForm.module} onValueChange={(value) => setTaskForm((current) => ({ ...current, module: value as TaskRecord['module'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(moduleLabels) as TaskRecord['module'][]).map((module) => (
                      <SelectItem key={module} value={module}>
                        {moduleLabels[module]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Priority</p>
                <Select value={taskForm.priority} onValueChange={(value) => setTaskForm((current) => ({ ...current, priority: value as TaskRecord['priority'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(priorityLabels) as TaskRecord['priority'][]).map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priorityLabels[priority]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Assign to<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Combobox
                options={assigneeOptions}
                value={taskForm.assigneeId}
                onChange={(value) => setTaskForm((current) => ({ ...current, assigneeId: value }))}
                placeholder="Select a teammate"
                searchPlaceholder="Search teammates..."
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Due date<span className="ml-0.5 text-rose-500">*</span>
              </p>
              <Input
                type="date"
                value={taskForm.dueDate}
                onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))}
                required
              />
            </div>
            {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewTaskOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Assign task'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

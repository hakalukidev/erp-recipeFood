"use client"

import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertTriangle,
  Banknote,
  Boxes,
  CheckCircle2,
  Download,
  Landmark,
  ReceiptText,
  ShoppingBag,
  Truck,
  Upload,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'

import { AdminShell } from '@/components/admin/AdminShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useERP } from '@/lib/erp/provider'
import type {
  BankAccountInput,
  CustomerInput,
  CustomerType,
  ImportResult,
  OpeningBalanceRow,
  OpeningStockRow,
  ProductInput,
  SupplierInput,
  SupplierRecord,
  UserInput,
} from '@/lib/erp/types'
import { exportCsv, formatCurrency, parseSpreadsheetFile, toArray } from '@/lib/erp/utils'
import { isStrongPassword } from '@/lib/erp/provider'
import { cn } from '@/lib/utils'

type MapResult<T> = { input: T } | { error: string }

function findByName<T extends { name?: string }>(records: T[], value: string): T | undefined {
  const target = value.trim().toLowerCase()
  if (!target) return undefined
  return records.find((record) => (record.name ?? '').trim().toLowerCase() === target)
}

function toNumber(value: string, fallback = 0) {
  const parsed = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : fallback
}

// ---- Section 82 shell: the entry point used by every import tab below ---
type ImportPanelConfig<T> = {
  templateHeaders: string[]
  sampleRow: (string | number)[]
  mapRow: (row: Record<string, string>) => MapResult<T>
  onImport: (inputs: T[]) => Promise<ImportResult>
  resultNoun: string
  templateFilename: string
}

function ImportPanel<T>({ config }: { config: ImportPanelConfig<T> }) {
  const [fileName, setFileName] = useState('')
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [validInputs, setValidInputs] = useState<T[]>([])
  const [clientErrors, setClientErrors] = useState<{ row: number; message: string }[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setFileName('')
    setRawRows([])
    setValidInputs([])
    setClientErrors([])
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setResult(null)
    setFileName(file.name)

    try {
      const { rows } = await parseSpreadsheetFile(file)
      const inputs: T[] = []
      const errors: { row: number; message: string }[] = []

      rows.forEach((row, index) => {
        const mapped = config.mapRow(row)
        if ('error' in mapped) {
          errors.push({ row: index + 1, message: mapped.error })
        } else {
          inputs.push(mapped.input)
        }
      })

      setRawRows(rows)
      setValidInputs(inputs)
      setClientErrors(errors)
    } catch {
      setClientErrors([{ row: 0, message: 'Could not read that file — upload a .xlsx, .xls, or .csv exported from Excel/Sheets.' }])
    }
  }

  async function handleImport() {
    if (validInputs.length === 0) return
    setImporting(true)
    setResult(null)
    try {
      const outcome = await config.onImport(validInputs)
      setResult(outcome)
    } catch (reason) {
      setResult({ imported: 0, errors: [{ row: 0, message: reason instanceof Error ? reason.message : 'Import failed.' }] })
    } finally {
      setImporting(false)
    }
  }

  const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => exportCsv(config.templateFilename, config.templateHeaders, [config.sampleRow.map(String)])}
        >
          <Download className="mr-2 h-4 w-4" />
          Download template (CSV)
        </Button>
        <Button type="button" size="sm" className="rounded-xl" onClick={() => inputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" />
          Upload Excel/CSV
        </Button>
        {fileName ? (
          <span className="text-xs text-muted-foreground">
            {fileName} · {rawRows.length} row(s) found
          </span>
        ) : null}
        {rawRows.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={reset}>
            Clear
          </Button>
        ) : null}
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => void handleFile(event)} />
      </div>

      {rawRows.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="rounded-full border-emerald-300 text-emerald-700 dark:text-emerald-300">
              {validInputs.length} valid row(s)
            </Badge>
            {clientErrors.length > 0 ? (
              <Badge variant="outline" className="rounded-full border-rose-300 text-rose-700 dark:text-rose-300">
                {clientErrors.length} row(s) skipped
              </Badge>
            ) : null}
          </div>

          {clientErrors.length > 0 ? (
            <div className="max-h-32 overflow-y-auto rounded-xl border border-rose-200 bg-rose-500/5 p-3 text-xs text-rose-700 dark:border-rose-900 dark:text-rose-300">
              {clientErrors.slice(0, 30).map((entry, index) => (
                <p key={index}>
                  Row {entry.row}: {entry.message}
                </p>
              ))}
              {clientErrors.length > 30 ? <p>…and {clientErrors.length - 30} more.</p> : null}
            </div>
          ) : null}

          <div className="max-h-64 overflow-auto rounded-xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  {headers.map((header) => (
                    <TableHead key={header} className="whitespace-nowrap text-xs">
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rawRows.slice(0, 10).map((row, index) => (
                  <TableRow key={index}>
                    {headers.map((header) => (
                      <TableCell key={header} className="whitespace-nowrap text-xs">
                        {row[header]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {rawRows.length > 10 ? (
            <p className="text-xs text-muted-foreground">Showing the first 10 of {rawRows.length} rows.</p>
          ) : null}

          <Button
            type="button"
            className="rounded-xl"
            disabled={validInputs.length === 0 || importing}
            onClick={() => void handleImport()}
          >
            {importing ? 'Importing…' : `Import ${validInputs.length} ${config.resultNoun}(s)`}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Download the template, fill it in from your existing Excel sheet or khata, then upload it here.
        </p>
      )}

      {result ? (
        <Card className={cn('border-border/70 shadow-none', result.imported > 0 && 'border-emerald-300 bg-emerald-500/5')}>
          <CardContent className="space-y-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Imported {result.imported} {config.resultNoun}(s).
            </p>
            {result.errors.length > 0 ? (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-rose-200 bg-rose-500/5 p-2 text-xs text-rose-700 dark:border-rose-900 dark:text-rose-300">
                {result.errors.slice(0, 30).map((entry, index) => (
                  <p key={index}>
                    Row {entry.row}: {entry.message}
                  </p>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

const CUSTOMER_TYPES: CustomerType[] = ['retailer', 'wholesaler', 'distributor', 'dealer', 'corporate']
const SUPPLIER_TYPES: SupplierRecord['supplierType'][] = ['local', 'foreign', 'importer']

type Section =
  | 'product'
  | 'customer'
  | 'supplier'
  | 'opening-stock'
  | 'opening-receivable'
  | 'opening-payable'
  | 'opening-cash'
  | 'opening-bank'
  | 'employee'

const SECTIONS: Array<{ id: Section; label: string; icon: typeof Boxes }> = [
  { id: 'product', label: 'Product', icon: Boxes },
  { id: 'customer', label: 'Customer', icon: Users },
  { id: 'supplier', label: 'Supplier', icon: Truck },
  { id: 'opening-stock', label: 'Opening Stock', icon: ShoppingBag },
  { id: 'opening-receivable', label: 'Opening Receivable', icon: ReceiptText },
  { id: 'opening-payable', label: 'Opening Payable', icon: ReceiptText },
  { id: 'opening-cash', label: 'Opening Cash', icon: Banknote },
  { id: 'opening-bank', label: 'Opening Bank', icon: Landmark },
  { id: 'employee', label: 'Employee', icon: UserPlus },
]

export function DataMigrationScreen() {
  const {
    data,
    importProducts,
    importCustomers,
    importSuppliers,
    importOpeningStock,
    importOpeningReceivable,
    importOpeningPayable,
    importOpeningCash,
    importOpeningBank,
    importEmployees,
  } = useERP()
  const [section, setSection] = useState<Section>('product')
  const [cashAmount, setCashAmount] = useState('')
  const [cashFeedback, setCashFeedback] = useState<string | null>(null)
  const [cashSaving, setCashSaving] = useState(false)

  const warehouses = useMemo(() => toArray(data?.warehouses), [data])
  const suppliers = useMemo(() => toArray(data?.suppliers), [data])
  const roles = useMemo(() => toArray(data?.roles), [data])
  const currency = data?.settings.currency ?? 'BDT'
  const cashAccount = useMemo(
    () => Object.values(data?.chartOfAccounts ?? {}).find((account) => account.ledgerAccount === 'cash'),
    [data]
  )

  async function handleSaveCash() {
    setCashFeedback(null)
    setCashSaving(true)
    try {
      await importOpeningCash(toNumber(cashAmount))
      setCashFeedback('Opening cash balance saved.')
    } catch (reason) {
      setCashFeedback(reason instanceof Error ? reason.message : 'Unable to save opening cash.')
    } finally {
      setCashSaving(false)
    }
  }

  const productConfig: ImportPanelConfig<ProductInput> = {
    templateHeaders: [
      'Name',
      'SKU',
      'Category',
      'Brand',
      'Unit',
      'Purchase Price',
      'Selling Price',
      'Wholesale Price',
      'MRP',
      'Opening Stock Qty',
      'Min Stock',
      'Max Stock',
      'Warehouse',
      'Supplier',
    ],
    sampleRow: ['Sunflower Oil 1L', 'SKU-001', 'Grocery', 'Fresh', 'pcs', 250, 300, 280, 320, 100, 10, 500, warehouses[0]?.name ?? 'Main Warehouse', ''],
    templateFilename: 'product-import-template.csv',
    resultNoun: 'product',
    mapRow: (row) => {
      const name = row['Name']?.trim()
      const sku = row['SKU']?.trim()
      if (!name) return { error: 'Name is required.' }
      if (!sku) return { error: 'SKU is required.' }

      const warehouseName = row['Warehouse']?.trim()
      const warehouse = warehouseName ? findByName(warehouses, warehouseName) : warehouses[0]
      if (!warehouse) return { error: `Warehouse "${warehouseName || ''}" was not found — create it first under Inventory / Stock.` }

      const supplier = row['Supplier']?.trim() ? findByName(suppliers, row['Supplier']) : undefined

      return {
        input: {
          name,
          sku,
          category: row['Category'] ?? '',
          brand: row['Brand'] ?? '',
          unit: row['Unit'] ?? '',
          purchasePrice: toNumber(row['Purchase Price']),
          sellingPrice: toNumber(row['Selling Price']),
          wholesalePrice: row['Wholesale Price'] ? toNumber(row['Wholesale Price']) : undefined,
          mrp: row['MRP'] ? toNumber(row['MRP']) : undefined,
          stockQty: toNumber(row['Opening Stock Qty']),
          minStock: toNumber(row['Min Stock']),
          maxStock: row['Max Stock'] ? toNumber(row['Max Stock']) : undefined,
          warehouseId: warehouse.id,
          supplierId: supplier?.id,
        },
      }
    },
    onImport: importProducts,
  }

  const customerConfig: ImportPanelConfig<CustomerInput> = {
    templateHeaders: ['Customer Code', 'Name', 'Company', 'Phone', 'Location', 'District', 'Customer Type', 'Credit Limit', 'Credit Days', 'Opening Balance (Due)'],
    sampleRow: ['CUST-001', 'Karim Store', 'Karim Traders', '01700000000', 'Dhaka', 'Dhaka', 'retailer', 50000, 15, 0],
    templateFilename: 'customer-import-template.csv',
    resultNoun: 'customer',
    mapRow: (row) => {
      const name = row['Name']?.trim()
      const phone = row['Phone']?.trim()
      if (!name) return { error: 'Name is required.' }
      if (!phone) return { error: 'Phone is required.' }

      const rawType = row['Customer Type']?.trim().toLowerCase()
      const customerType = (CUSTOMER_TYPES as string[]).includes(rawType) ? (rawType as CustomerType) : 'retailer'

      return {
        input: {
          customerCode: row['Customer Code'] ?? '',
          name,
          company: row['Company'] ?? '',
          phone,
          location: row['Location'] ?? '',
          district: row['District'] ?? '',
          customerType,
          creditLimit: row['Credit Limit'] ? toNumber(row['Credit Limit']) : undefined,
          creditDays: row['Credit Days'] ? toNumber(row['Credit Days']) : undefined,
          openingBalance: row['Opening Balance (Due)'] ? toNumber(row['Opening Balance (Due)']) : undefined,
        },
      }
    },
    onImport: importCustomers,
  }

  const supplierConfig: ImportPanelConfig<SupplierInput> = {
    templateHeaders: ['Supplier Code', 'Name', 'Company', 'Phone', 'Email', 'Location', 'Country', 'Supplier Type', 'Opening Balance (Payable)'],
    sampleRow: ['SUP-001', 'ABC Distribution', 'ABC Distribution Ltd', '01800000000', 'sales@abc.com', 'Chattogram', 'Bangladesh', 'local', 0],
    templateFilename: 'supplier-import-template.csv',
    resultNoun: 'supplier',
    mapRow: (row) => {
      const name = row['Name']?.trim()
      const phone = row['Phone']?.trim()
      if (!name) return { error: 'Name is required.' }
      if (!phone) return { error: 'Phone is required.' }

      const rawType = row['Supplier Type']?.trim().toLowerCase()
      const supplierType = (SUPPLIER_TYPES as string[]).includes(rawType) ? (rawType as SupplierRecord['supplierType']) : 'local'

      return {
        input: {
          supplierCode: row['Supplier Code'] ?? '',
          name,
          company: row['Company'] ?? '',
          phone,
          email: row['Email'] ?? '',
          location: row['Location'] ?? '',
          country: row['Country'] ?? '',
          supplierType,
          openingBalance: row['Opening Balance (Payable)'] ? toNumber(row['Opening Balance (Payable)']) : undefined,
        },
      }
    },
    onImport: importSuppliers,
  }

  const openingStockConfig: ImportPanelConfig<OpeningStockRow> = {
    templateHeaders: ['SKU', 'Warehouse', 'Quantity'],
    sampleRow: ['SKU-001', warehouses[0]?.name ?? 'Main Warehouse', 100],
    templateFilename: 'opening-stock-import-template.csv',
    resultNoun: 'product',
    mapRow: (row) => {
      const sku = row['SKU']?.trim()
      if (!sku) return { error: 'SKU is required.' }
      const quantity = toNumber(row['Quantity'], NaN)
      if (!Number.isFinite(quantity) || quantity < 0) return { error: 'Quantity must be a non-negative number.' }

      const warehouseName = row['Warehouse']?.trim()
      const warehouse = warehouseName ? findByName(warehouses, warehouseName) : undefined
      if (warehouseName && !warehouse) return { error: `Warehouse "${warehouseName}" was not found.` }

      return { input: { sku, quantity, warehouseId: warehouse?.id } }
    },
    onImport: importOpeningStock,
  }

  const openingReceivableConfig: ImportPanelConfig<OpeningBalanceRow> = {
    templateHeaders: ['Customer Code or Phone', 'Amount'],
    sampleRow: ['CUST-001', 12000],
    templateFilename: 'opening-receivable-import-template.csv',
    resultNoun: 'customer',
    mapRow: (row) => {
      const match = row['Customer Code or Phone']?.trim()
      if (!match) return { error: 'Customer code or phone is required.' }
      const amount = toNumber(row['Amount'], NaN)
      if (!Number.isFinite(amount) || amount < 0) return { error: 'Amount must be a non-negative number.' }
      return { input: { match, amount } }
    },
    onImport: importOpeningReceivable,
  }

  const openingPayableConfig: ImportPanelConfig<OpeningBalanceRow> = {
    templateHeaders: ['Supplier Code or Phone', 'Amount'],
    sampleRow: ['SUP-001', 8000],
    templateFilename: 'opening-payable-import-template.csv',
    resultNoun: 'supplier',
    mapRow: (row) => {
      const match = row['Supplier Code or Phone']?.trim()
      if (!match) return { error: 'Supplier code or phone is required.' }
      const amount = toNumber(row['Amount'], NaN)
      if (!Number.isFinite(amount) || amount < 0) return { error: 'Amount must be a non-negative number.' }
      return { input: { match, amount } }
    },
    onImport: importOpeningPayable,
  }

  const openingBankConfig: ImportPanelConfig<BankAccountInput> = {
    templateHeaders: ['Bank Name', 'Branch', 'Account Number', 'Opening Balance'],
    sampleRow: ['Dutch-Bangla Bank', 'Gulshan', '1234567890', 50000],
    templateFilename: 'opening-bank-import-template.csv',
    resultNoun: 'bank account',
    mapRow: (row) => {
      const bankName = row['Bank Name']?.trim()
      const accountNumber = row['Account Number']?.trim()
      if (!bankName) return { error: 'Bank name is required.' }
      if (!accountNumber) return { error: 'Account number is required.' }
      return {
        input: {
          bankName,
          branch: row['Branch'] ?? '',
          accountNumber,
          openingBalance: row['Opening Balance'] ? toNumber(row['Opening Balance']) : undefined,
        },
      }
    },
    onImport: importOpeningBank,
  }

  const employeeConfig: ImportPanelConfig<UserInput> = {
    templateHeaders: ['Name', 'Login ID', 'Phone', 'Title', 'Role', 'Password'],
    sampleRow: ['Rahim Uddin', 'rahim', '01900000000', 'Sales Officer', roles.find((role) => role.id === 'sales_officer')?.name ?? roles[0]?.name ?? 'Sales Officer', ''],
    templateFilename: 'employee-import-template.csv',
    resultNoun: 'employee',
    mapRow: (row) => {
      const name = row['Name']?.trim()
      const loginId = row['Login ID']?.trim()
      const phone = row['Phone']?.trim()
      if (!name) return { error: 'Name is required.' }
      if (!loginId) return { error: 'Login ID is required.' }
      if (!phone) return { error: 'Phone is required.' }

      const roleName = row['Role']?.trim()
      const role = roleName ? findByName(roles, roleName) : undefined
      if (!role) return { error: `Role "${roleName || ''}" was not found — check the Role & Permission Matrix for the exact name.` }

      const rawPassword = row['Password']?.trim()
      const last4 = phone.replace(/\D/g, '').slice(-4).padStart(4, '9')
      const password = rawPassword && isStrongPassword(rawPassword) ? rawPassword : `Welcome@${last4}`

      return {
        input: {
          name,
          loginId,
          phone,
          title: row['Title'] ?? role.name,
          roleId: role.id,
          password,
        },
      }
    },
    onImport: importEmployees,
  }

  const panelByConfig: Record<Exclude<Section, 'opening-cash'>, ImportPanelConfig<any>> = {
    product: productConfig,
    customer: customerConfig,
    supplier: supplierConfig,
    'opening-stock': openingStockConfig,
    'opening-receivable': openingReceivableConfig,
    'opening-payable': openingPayableConfig,
    'opening-bank': openingBankConfig,
    employee: employeeConfig,
  }

  return (
    <AdminShell active="Data Migration">
      <div className="space-y-6">
        <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">Data Migration</p>
          <p className="text-xs text-muted-foreground">
            Bring in Product, Customer, Supplier, Opening Stock/Receivable/Payable/Cash/Bank, and Employee records from
            your existing Excel sheet, khata, or old software — download a template, fill it in, and upload it back.
          </p>
        </div>

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

        {section === 'opening-cash' ? (
          <Card className="border-border/70 shadow-none">
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="text-sm font-medium text-foreground">Opening Cash</p>
                <p className="text-xs text-muted-foreground">
                  A single starting cash-in-hand figure — posts to the Cash account&apos;s opening balance (Accounting
                  Module → Chart of Accounts).
                </p>
              </div>
              {cashAccount ? (
                <p className="text-xs text-muted-foreground">
                  Current opening cash balance: <span className="font-medium text-foreground">{formatCurrency(cashAccount.openingBalance, currency)}</span>
                </p>
              ) : (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                  Load the standard chart of accounts first (Accounting Module → Chart of Accounts) before setting
                  opening cash.
                </p>
              )}
              <div className="flex max-w-xs items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 50000"
                  value={cashAmount}
                  onChange={(event) => setCashAmount(event.target.value)}
                  className="rounded-xl"
                />
              </div>
              <Button
                type="button"
                className="rounded-xl"
                disabled={!cashAccount || cashSaving || !cashAmount}
                onClick={() => void handleSaveCash()}
              >
                {cashSaving ? 'Saving…' : 'Save opening cash'}
              </Button>
              {cashFeedback ? <p className="text-sm text-foreground">{cashFeedback}</p> : null}
            </CardContent>
          </Card>
        ) : (
          <ImportPanel key={section} config={panelByConfig[section]} />
        )}
      </div>
    </AdminShell>
  )
}

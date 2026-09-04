import type { AccountType, LedgerAccount } from '@/lib/erp/types'

// Section 28's exact hierarchy — the button on the Accounting page seeds
// these once (idempotent by `code`, like the Section 1 starter catalog
// loader). Rows with a `ledgerAccount` are "system" accounts the
// Automatic Accounting Engine (Section 29) already posts to on its own;
// the rest exist purely so a manual Journal Entry (Section 27) has
// somewhere to post.
export const STANDARD_CHART_OF_ACCOUNTS: Array<{
  code: string
  name: string
  type: AccountType
  ledgerAccount?: LedgerAccount
}> = [
  // Assets
  { code: '1001', name: 'Cash', type: 'asset', ledgerAccount: 'cash' },
  { code: '1002', name: 'Bank', type: 'asset', ledgerAccount: 'bank' },
  { code: '1002a', name: 'MFS (Mobile Banking)', type: 'asset', ledgerAccount: 'mfs' },
  { code: '1003', name: 'Accounts Receivable', type: 'asset', ledgerAccount: 'dealer' },
  { code: '1004', name: 'Inventory', type: 'asset', ledgerAccount: 'inventory' },
  { code: '1005', name: 'Raw Material', type: 'asset' },
  { code: '1006', name: 'Finished Goods', type: 'asset' },
  { code: '1007', name: 'Work in Process', type: 'asset', ledgerAccount: 'wip' },
  { code: '1008', name: 'Fixed Assets', type: 'asset' },
  { code: '1009', name: 'Advance', type: 'asset' },
  // Liabilities
  { code: '2001', name: 'Supplier Payable', type: 'liability', ledgerAccount: 'accounts_payable' },
  { code: '2002', name: 'Bank Loan', type: 'liability' },
  { code: '2003', name: 'Other Payable', type: 'liability' },
  { code: '2004', name: 'Tax/VAT Payable', type: 'liability', ledgerAccount: 'vat_payable' },
  // Equity
  { code: '3001', name: 'Share Capital', type: 'equity' },
  { code: '3002', name: 'Retained Earnings', type: 'equity' },
  // Revenue
  { code: '4001', name: 'Product Sales', type: 'revenue', ledgerAccount: 'sales' },
  { code: '4002', name: 'Sales Return', type: 'revenue', ledgerAccount: 'sales_return' },
  { code: '4003', name: 'Other Income', type: 'revenue' },
  // Expenses
  { code: '5001', name: 'Cost of Goods Sold (COGS)', type: 'expense', ledgerAccount: 'cogs' },
  { code: '5002', name: 'Salary', type: 'expense', ledgerAccount: 'salary' },
  { code: '5003', name: 'Rent', type: 'expense', ledgerAccount: 'rent' },
  { code: '5004', name: 'Electricity', type: 'expense', ledgerAccount: 'electricity' },
  { code: '5005', name: 'Transport', type: 'expense', ledgerAccount: 'transport' },
  { code: '5006', name: 'Marketing', type: 'expense', ledgerAccount: 'marketing' },
  { code: '5007', name: 'Commission', type: 'expense', ledgerAccount: 'commission' },
  { code: '5008', name: 'Office Expense', type: 'expense', ledgerAccount: 'office_expense' },
  { code: '5009', name: 'Factory Expense', type: 'expense', ledgerAccount: 'factory_expense' },
  { code: '5010', name: 'Bank Charge', type: 'expense', ledgerAccount: 'bank_charge' },
  { code: '5011', name: 'Depreciation', type: 'expense', ledgerAccount: 'depreciation' },
  { code: '5012', name: 'Other Expense / Miscellaneous', type: 'expense', ledgerAccount: 'other_expense' },
  { code: '5013', name: 'Fuel', type: 'expense', ledgerAccount: 'fuel' },
  { code: '5014', name: 'Advertisement', type: 'expense', ledgerAccount: 'advertisement' },
  { code: '5015', name: 'Repair', type: 'expense', ledgerAccount: 'repair' },
  { code: '5016', name: 'Utility', type: 'expense', ledgerAccount: 'utility' },
  { code: '5017', name: 'Travel', type: 'expense', ledgerAccount: 'travel' },
]

// Section 36's exact Expense Category list, in spec order — the Finance
// page's "Record expense" form and the Accounting page's Budget form both
// use this as their category dropdown, so a budget's category always lines
// up with an expense's category (both compared case-insensitively).
export const EXPENSE_CATEGORIES = [
  'Office Expense',
  'Factory Expense',
  'Transport',
  'Fuel',
  'Marketing',
  'Advertisement',
  'Salary',
  'Commission',
  'Repair',
  'Utility',
  'Rent',
  'Travel',
  'Miscellaneous',
] as const

// Free-text expense categories (Finance page) are matched against this map
// (case-insensitive) to decide which Chart of Accounts expense head an
// expense auto-posts against; anything unmatched falls back to
// 'other_expense'. Kept in sync with the Expenses group above.
export const EXPENSE_CATEGORY_LEDGER_ACCOUNT: Record<string, LedgerAccount> = {
  salary: 'salary',
  rent: 'rent',
  electricity: 'electricity',
  transport: 'transport',
  marketing: 'marketing',
  commission: 'commission',
  'office expense': 'office_expense',
  office: 'office_expense',
  'factory expense': 'factory_expense',
  factory: 'factory_expense',
  'bank charge': 'bank_charge',
  'bank charges': 'bank_charge',
  depreciation: 'depreciation',
  fuel: 'fuel',
  advertisement: 'advertisement',
  repair: 'repair',
  'repair & maintenance': 'repair',
  utility: 'utility',
  utilities: 'utility',
  travel: 'travel',
  miscellaneous: 'other_expense',
}

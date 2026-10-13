import {
  COMPANY_ADDRESS,
  COMPANY_EMAIL,
  COMPANY_HELPLINE,
  COMPANY_INVOICE_FOOTER_NOTE,
  COMPANY_NAME,
} from '@/lib/erp/companyInfo'

// Category-wise / Date-wise printable report (2026-10-13 client request:
// "ক্যাটাগরি ওয়াইজ ও ডেট ওয়াইজ সব প্রিন্ট অপশন" for Cash Maintenance and
// Expense). Company letterhead, a summary table (one line per group), then
// each group's entries under its own heading with a subtotal, ending in a
// grand total. Same layout family as buildExpenseReportHtml/buildLoanStatementHtml.

export type ReportGroupBy = 'category' | 'date'

export type GroupedReportGroup = {
  label: string
  rows: string[][]
  // One cell per summary amount column (already formatted).
  amounts: string[]
}

export type GroupedReportOptions = {
  title: string
  subtitle: string
  meta?: string[]
  groupHeading: string
  // Summary amount column names, e.g. ['Amount'] or ['Cash In', 'Cash Out'].
  amountHeaders: string[]
  detailHeaders: string[]
  // Indexes in detailHeaders whose cells are right-aligned numbers.
  numericColumns: number[]
  groups: GroupedReportGroup[]
  // Grand total per amount column (already formatted).
  grandTotals: string[]
  // Extra label/value lines under the summary table.
  footerLines?: Array<[string, string]>
}

export function escapeReportHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function openReportPrintWindow(html: string) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(html)
  printWindow.document.close()
}

// Groups items by key, keeping keys sorted (dates oldest first, categories by
// the caller's order function) — used by both screens to build `groups`.
export function groupReportItems<T>(items: T[], keyOf: (item: T) => string, compare?: (left: string, right: string) => number) {
  const groups = new Map<string, T[]>()
  items.forEach((item) => {
    const key = keyOf(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
  })
  const keys = Array.from(groups.keys()).sort(compare ?? ((left, right) => left.localeCompare(right)))
  return keys.map((key) => ({ key, items: groups.get(key) ?? [] }))
}

export function buildGroupedReportHtml(options: GroupedReportOptions) {
  const esc = escapeReportHtml
  const detailCell = (value: string, index: number) =>
    `<td${options.numericColumns.includes(index) ? ' class="numeric"' : ''}>${esc(value)}</td>`
  const entryCount = options.groups.reduce((sum, group) => sum + group.rows.length, 0)

  const summaryRows = options.groups
    .map(
      (group) =>
        `<tr><td>${esc(group.label)}</td><td class="numeric">${group.rows.length}</td>${group.amounts
          .map((amount) => `<td class="numeric">${esc(amount)}</td>`)
          .join('')}</tr>`
    )
    .join('')

  const footerLines = (options.footerLines ?? [])
    .map(([label, value]) => `<tr><td>${esc(label)}</td><td class="numeric">${esc(value)}</td></tr>`)
    .join('')

  // Subtotal row spans everything up to the first numeric column, then puts
  // each group amount under the matching numeric column.
  const firstNumeric = Math.min(...options.numericColumns)
  const trailing = options.detailHeaders.length - firstNumeric - options.amountHeaders.length
  const subtotalRow = (label: string, amounts: string[], className: string) =>
    `<tr class="${className}"><td colspan="${firstNumeric}">${esc(label)}</td>${amounts
      .map((amount) => `<td class="numeric">${esc(amount)}</td>`)
      .join('')}${trailing > 0 ? `<td colspan="${trailing}"></td>` : ''}</tr>`

  const sections = options.groups
    .map(
      (group) => `
        <h3>${esc(group.label)} <span class="count">(${group.rows.length})</span></h3>
        <table class="doc">
          <thead><tr>${options.detailHeaders.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead>
          <tbody>
            ${group.rows.map((row) => `<tr>${row.map(detailCell).join('')}</tr>`).join('')}
            ${subtotalRow(`Subtotal — ${group.label}`, group.amounts, 'subtotal')}
          </tbody>
        </table>
      `
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${esc(options.title)}</title>
        <style>
          * { box-sizing: border-box; }
          @page { margin: 12mm 16mm; size: A4; }
          body { color: #111827; font-family: Arial, sans-serif; margin: 0; padding: 0; }
          .title { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 4px; color: #0f766e; }
          .company-meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
          .subtitle { text-align: center; color: #111827; font-size: 15px; font-weight: 700; margin: 12px 0 4px; }
          .meta { text-align: center; color: #4b5563; font-size: 12.5px; margin: 0 0 2px; }
          h2 { font-size: 14px; margin: 18px 0 8px; }
          h3 { font-size: 13px; margin: 16px 0 6px; color: #0f766e; page-break-after: avoid; }
          h3 .count { color: #6b7280; font-weight: 400; }
          table.doc { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
          table.doc th, table.doc td { border: 1px solid #d1d5db; padding: 5px 7px; font-size: 12px; }
          table.doc th { background: #f3f4f6; text-transform: uppercase; font-size: 10.5px; }
          .numeric { text-align: right; white-space: nowrap; }
          tr.subtotal td { font-weight: 700; background: #f9fafb; }
          tr.totals td { font-weight: 700; border-top: 2px solid #111827; background: #fef9c3; }
          .footnote { text-align: center; font-style: italic; font-size: 11.5px; color: #4b5563; margin-top: 16px; }
        </style>
      </head>
      <body>
        <p class="title">${esc(COMPANY_NAME)}</p>
        <p class="company-meta">${esc(COMPANY_ADDRESS)}</p>
        <p class="company-meta">${esc(COMPANY_EMAIL)} &middot; Help Line: ${esc(COMPANY_HELPLINE)}</p>
        <p class="subtitle">${esc(options.subtitle)}</p>
        ${(options.meta ?? []).map((line) => `<p class="meta">${esc(line)}</p>`).join('')}
        <h2>Summary — ${esc(options.groupHeading)}</h2>
        <table class="doc">
          <thead><tr><th>${esc(options.groupHeading)}</th><th>Entries</th>${options.amountHeaders
            .map((header) => `<th>${esc(header)}</th>`)
            .join('')}</tr></thead>
          <tbody>
            ${summaryRows}
            <tr class="totals"><td>Grand Total</td><td class="numeric">${entryCount}</td>${options.grandTotals
              .map((amount) => `<td class="numeric">${esc(amount)}</td>`)
              .join('')}</tr>
          </tbody>
        </table>
        ${footerLines ? `<table class="doc" style="width:60%;margin-left:auto"><tbody>${footerLines}</tbody></table>` : ''}
        <h2>Detail</h2>
        ${sections}
        <table class="doc">
          <tbody>${subtotalRow('Grand Total', options.grandTotals, 'totals')}</tbody>
        </table>
        <p class="footnote">${esc(COMPANY_INVOICE_FOOTER_NOTE)}</p>
        <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
      </body>
    </html>
  `
}

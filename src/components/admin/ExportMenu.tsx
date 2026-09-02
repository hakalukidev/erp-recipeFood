"use client"

import { Download, FileSpreadsheet, FileText, FileType } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { exportCsv, exportPdf, exportXlsx } from '@/lib/erp/utils'

// ---- Section 82 (Import/Export) ------------------------------------------
// One "Export" button — Excel / CSV / PDF — for any list screen. Every
// format shares the same headers/rows so a page only has to build that data
// once (see the `columns`/`rows` shape below, matched to the codebase's
// existing exportCsv/exportXlsx/exportPdf helpers in utils.ts).
export type ExportMenuProps = {
  filenameBase: string
  title: string
  headers: string[]
  rows: (string | number)[][]
  disabled?: boolean
}

export function ExportMenu({ filenameBase, title, headers, rows, disabled }: ExportMenuProps) {
  const isDisabled = disabled ?? rows.length === 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={isDisabled}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => void exportXlsx(`${filenameBase}.xlsx`, title, headers, rows)}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportCsv(`${filenameBase}.csv`, headers, rows.map((row) => row.map(String)))}>
          <FileType className="mr-2 h-4 w-4" />
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void exportPdf(`${filenameBase}.pdf`, title, headers, rows)}>
          <FileText className="mr-2 h-4 w-4" />
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

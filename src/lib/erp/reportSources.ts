import { achievedAmountFor, buildInventoryDashboard } from '@/lib/erp/dashboards'
import type { ERPData, OrderRecord } from '@/lib/erp/types'
import { formatCurrency, formatDate, isPremiumCustomer, toArray } from '@/lib/erp/utils'

// Shared by every "X-wise Sales" report source below (Section 59).
function aggregateSalesBy(orders: OrderRecord[], keyOf: (order: OrderRecord) => string | undefined, fallback = 'Unassigned') {
  const rows = new Map<string, { label: string; orders: number; totalSales: number; totalDue: number }>()
  orders.forEach((order) => {
    const label = keyOf(order) || fallback
    const row = rows.get(label) ?? { label, orders: 0, totalSales: 0, totalDue: 0 }
    row.orders += 1
    row.totalSales += order.total
    row.totalDue += order.due
    rows.set(label, row)
  })
  return Array.from(rows.values()).sort((a, b) => b.totalSales - a.totalSales)
}

export type ReportFieldType = 'string' | 'number' | 'currency' | 'date' | 'boolean'

export type ReportColumn = {
  key: string
  label: string
  type: ReportFieldType
  filterable?: boolean
  searchable?: boolean
  isPrimaryDate?: boolean
}

export type ReportRow = Record<string, string | number | boolean | null | undefined>

export type ReportSource = {
  id: string
  label: string
  description: string
  rows: (data: ERPData) => ReportRow[]
  columns: ReportColumn[]
}

function col(key: string, label: string, type: ReportFieldType, extra: Partial<ReportColumn> = {}): ReportColumn {
  return { key, label, type, ...extra }
}

export const REPORT_SOURCES: ReportSource[] = [
  {
    id: 'sales',
    label: 'Sales / Orders',
    description: 'Every bill raised across all customers with payment and delivery status.',
    rows: (data) => {
      const customers = toArray(data.customers)
      return toArray(data.orders).map((order) => {
        const customer = customers.find((entry) => entry.id === order.customerId)
        return {
          billNumber: order.billNumber,
          date: order.createdAt,
          customerName: order.customerName,
          customerPhone: customer?.phone ?? '',
          salesPerson: order.salesPersonName,
          status: order.status,
          paymentStatus: order.paymentStatus,
          total: order.total,
          paid: order.paid,
          due: order.due,
          deliveryDate: order.deliveryDate,
          paymentDueDate: order.paymentDueDate,
          ref: order.due > 0 ? (order.dueReference === 'courier' ? 'With courier' : 'With owner') : 'Paid',
          products: order.items.map((item) => `${item.productName} x ${item.quantity}`).join(', '),
          totalQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
        }
      })
    },
    columns: [
      col('billNumber', 'Bill No.', 'string', { searchable: true }),
      col('date', 'Date', 'date', { isPrimaryDate: true }),
      col('customerName', 'Customer', 'string', { searchable: true }),
      col('customerPhone', 'Phone', 'string', { searchable: true }),
      col('salesPerson', 'Sales Person', 'string', { filterable: true }),
      col('status', 'Status', 'string', { filterable: true }),
      col('paymentStatus', 'Payment Status', 'string', { filterable: true }),
      col('total', 'Total', 'currency'),
      col('paid', 'Paid', 'currency'),
      col('due', 'Due', 'currency'),
      col('deliveryDate', 'Delivery Date', 'date'),
      col('ref', 'Due Reference', 'string', { filterable: true }),
      col('products', 'Products', 'string', { searchable: true }),
      col('totalQuantity', 'Total Qty', 'number'),
    ],
  },
  {
    id: 'stock',
    label: 'Stock / Products',
    description: 'Inventory levels, pricing, and status for every product.',
    rows: (data) => {
      const warehouses = data.warehouses
      const suppliers = data.suppliers
      return toArray(data.products).map((product) => ({
        name: product.name,
        category: product.category,
        brand: product.brand,
        sku: product.sku,
        serialNumber: product.serialNumber ?? '',
        warehouse: warehouses[product.warehouseId]?.name ?? '',
        supplier: suppliers[product.supplierId]?.name ?? '',
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        wholesalePrice: product.wholesalePrice,
        stockQty: product.stockQty,
        minStock: product.minStock,
        maxStock: product.maxStock,
        status: product.status,
        updatedAt: product.updatedAt,
      }))
    },
    columns: [
      col('name', 'Product', 'string', { searchable: true }),
      col('category', 'Category', 'string', { filterable: true }),
      col('brand', 'Brand', 'string', { filterable: true }),
      col('sku', 'SKU', 'string', { searchable: true }),
      col('serialNumber', 'Serial No.', 'string', { searchable: true }),
      col('warehouse', 'Warehouse', 'string', { filterable: true }),
      col('supplier', 'Supplier', 'string', { filterable: true }),
      col('purchasePrice', 'Purchase Price', 'currency'),
      col('sellingPrice', 'Selling Price', 'currency'),
      col('wholesalePrice', 'Wholesale Price', 'currency'),
      col('stockQty', 'Stock Qty', 'number'),
      col('minStock', 'Min Stock', 'number'),
      col('maxStock', 'Max Stock', 'number'),
      col('status', 'Status', 'string', { filterable: true }),
      col('updatedAt', 'Updated', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    description: 'Customer ledger with dues, support status, and premium flag.',
    rows: (data) => {
      const orders = toArray(data.orders)
      return toArray(data.customers).map((customer) => {
        const customerOrders = orders.filter((order) => order.customerId === customer.id)
        const purchaseTotal = customerOrders.reduce((sum, order) => sum + order.total, 0)
        const effectivePurchaseTotal =
          customerOrders.length > 0 ? purchaseTotal : customer.previousPurchaseAmount ?? 0

        return {
          name: customer.name,
          company: customer.company,
          phone: customer.phone,
          location: customer.location,
          due: customer.due,
          supportStatus: customer.supportStatus,
          isPremium: isPremiumCustomer(effectivePurchaseTotal),
          createdAt: customer.createdAt,
        }
      })
    },
    columns: [
      col('name', 'Customer', 'string', { searchable: true }),
      col('company', 'Company', 'string', { searchable: true }),
      col('phone', 'Phone', 'string', { searchable: true }),
      col('location', 'Location', 'string', { filterable: true }),
      col('due', 'Due', 'currency'),
      col('supportStatus', 'Support Status', 'string', { filterable: true }),
      col('isPremium', 'Premium', 'boolean', { filterable: true }),
      col('createdAt', 'Created', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'suppliers',
    label: 'Suppliers / Imports',
    description: 'Supplier directory with LC status and landed cost breakdown.',
    rows: (data) =>
      toArray(data.suppliers).map((supplier) => ({
        name: supplier.name,
        company: supplier.company,
        phone: supplier.phone,
        supplierType: supplier.supplierType,
        country: supplier.country,
        lcNumber: supplier.lcNumber,
        lcStatus: supplier.lcStatus,
        productCost: supplier.productCost,
        shippingCost: supplier.shippingCost,
        customsDuty: supplier.customsDuty,
        otherCost: supplier.otherCost,
        landedCost: supplier.productCost + supplier.shippingCost + supplier.customsDuty + supplier.otherCost,
        createdAt: supplier.createdAt,
      })),
    columns: [
      col('name', 'Supplier', 'string', { searchable: true }),
      col('company', 'Company', 'string', { searchable: true }),
      col('phone', 'Phone', 'string', { searchable: true }),
      col('supplierType', 'Type', 'string', { filterable: true }),
      col('country', 'Country', 'string', { filterable: true }),
      col('lcNumber', 'LC No.', 'string', { searchable: true }),
      col('lcStatus', 'LC Status', 'string', { filterable: true }),
      col('productCost', 'Product Cost', 'currency'),
      col('shippingCost', 'Shipping', 'currency'),
      col('customsDuty', 'Customs', 'currency'),
      col('otherCost', 'Other', 'currency'),
      col('landedCost', 'Landed Cost', 'currency'),
      col('createdAt', 'Created', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'purchases',
    label: 'Purchases',
    description: 'Stock purchased from suppliers, cost, and receipt status.',
    rows: (data) =>
      toArray(data.purchases).map((purchase) => ({
        productName: purchase.productName,
        supplierName: purchase.supplierName,
        quantity: purchase.quantity,
        unitCost: purchase.unitCost,
        total: purchase.total,
        currency: purchase.currency,
        status: purchase.status,
        createdAt: purchase.createdAt,
      })),
    columns: [
      col('productName', 'Product', 'string', { searchable: true }),
      col('supplierName', 'Supplier', 'string', { filterable: true }),
      col('quantity', 'Quantity', 'number'),
      col('unitCost', 'Unit Cost', 'currency'),
      col('total', 'Total', 'currency'),
      col('status', 'Status', 'string', { filterable: true }),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'expenses',
    label: 'Expenses',
    description: 'Operational expenses logged by category and staff member.',
    rows: (data) =>
      toArray(data.expenses).map((expense) => ({
        category: expense.category,
        amount: expense.amount,
        note: expense.note,
        createdByName: expense.createdByName,
        date: expense.date,
      })),
    columns: [
      col('category', 'Category', 'string', { filterable: true }),
      col('amount', 'Amount', 'currency'),
      col('note', 'Note', 'string', { searchable: true }),
      col('createdByName', 'Created By', 'string', { filterable: true }),
      col('date', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'sellers',
    label: 'Sellers',
    description: 'External seller/agent directory.',
    rows: (data) =>
      toArray(data.sellers).map((seller) => ({
        name: seller.name,
        phone: seller.phone,
        location: seller.location,
        notes: seller.notes,
        createdAt: seller.createdAt,
      })),
    columns: [
      col('name', 'Seller', 'string', { searchable: true }),
      col('phone', 'Phone', 'string', { searchable: true }),
      col('location', 'Location', 'string', { filterable: true }),
      col('notes', 'Notes', 'string', { searchable: true }),
      col('createdAt', 'Created', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'sellerTransactions',
    label: 'Seller Ledger',
    description: 'Goods taken, cash given, and receivables per seller transaction.',
    rows: (data) =>
      toArray(data.sellerTransactions).map((txn) => ({
        sellerName: txn.sellerName,
        date: txn.date,
        productName: txn.productName,
        quantity: txn.quantity,
        takenValue: txn.takenValue,
        cashGiven: txn.cashGiven,
        givenValue: txn.givenValue,
        cashReceived: txn.cashReceived,
        iReceiveAmount: txn.iReceiveAmount,
        theyReceiveAmount: txn.theyReceiveAmount,
      })),
    columns: [
      col('sellerName', 'Seller', 'string', { filterable: true }),
      col('date', 'Date', 'date', { isPrimaryDate: true }),
      col('productName', 'Product', 'string', { searchable: true }),
      col('quantity', 'Quantity', 'number'),
      col('takenValue', 'Taken Value', 'currency'),
      col('cashGiven', 'Cash Given', 'currency'),
      col('givenValue', 'Goods Given Value', 'currency'),
      col('cashReceived', 'Cash Received', 'currency'),
      col('iReceiveAmount', 'I Receive', 'currency'),
      col('theyReceiveAmount', 'They Receive', 'currency'),
    ],
  },
  {
    id: 'couriers',
    label: 'Couriers',
    description: 'Shipments sent via courier with COD collection status.',
    rows: (data) =>
      toArray(data.couriers).map((courier) => ({
        customerName: courier.customerName,
        billNumber: courier.billNumber,
        courierName: courier.courierName,
        productDescription: courier.productDescription,
        quantity: courier.quantity,
        codAmount: courier.codAmount,
        sentDate: courier.sentDate,
        status: courier.status,
      })),
    columns: [
      col('customerName', 'Customer', 'string', { searchable: true }),
      col('billNumber', 'Bill No.', 'string', { searchable: true }),
      col('courierName', 'Courier', 'string', { filterable: true }),
      col('productDescription', 'Product', 'string', { searchable: true }),
      col('quantity', 'Quantity', 'number'),
      col('codAmount', 'COD Amount', 'currency'),
      col('sentDate', 'Sent Date', 'date', { isPrimaryDate: true }),
      col('status', 'Status', 'string', { filterable: true }),
    ],
  },
  {
    id: 'users',
    label: 'Users / Staff',
    description: 'Internal staff accounts and roles.',
    rows: (data) =>
      toArray(data.users).map((user) => ({
        name: user.name,
        loginId: user.loginId,
        phone: user.phone,
        role: data.roles[user.roleId]?.name ?? user.roleId,
        title: user.title,
        status: user.status,
      })),
    columns: [
      col('name', 'Name', 'string', { searchable: true }),
      col('loginId', 'Login ID', 'string', { searchable: true }),
      col('phone', 'Phone', 'string', { searchable: true }),
      col('role', 'Role', 'string', { filterable: true }),
      col('title', 'Title', 'string', { searchable: true }),
      col('status', 'Status', 'string', { filterable: true }),
    ],
  },
  {
    id: 'userPerformance',
    label: 'User Performance',
    description: 'Orders, revenue, and due amounts attributed to each sales user.',
    rows: (data) => {
      const orders = toArray(data.orders)
      return toArray(data.users).map((user) => {
        const userOrders = orders.filter((order) => order.salesPersonId === user.id)
        return {
          name: user.name,
          role: data.roles[user.roleId]?.name ?? user.roleId,
          totalOrders: userOrders.length,
          pendingOrders: userOrders.filter((order) => order.status === 'pending').length,
          completedOrders: userOrders.filter((order) => order.status === 'completed').length,
          revenue: userOrders.reduce((sum, order) => sum + order.total, 0),
          due: userOrders.reduce((sum, order) => sum + order.due, 0),
        }
      })
    },
    columns: [
      col('name', 'User', 'string', { searchable: true }),
      col('role', 'Role', 'string', { filterable: true }),
      col('totalOrders', 'Total Orders', 'number'),
      col('pendingOrders', 'Pending', 'number'),
      col('completedOrders', 'Completed', 'number'),
      col('revenue', 'Revenue', 'currency'),
      col('due', 'Due', 'currency'),
    ],
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'Assigned tasks across inventory, sales, support, and warehouse.',
    rows: (data) =>
      toArray(data.tasks).map((task) => ({
        title: task.title,
        module: task.module,
        status: task.status,
        priority: task.priority,
        assigneeName: task.assigneeName,
        dueDate: task.dueDate,
        createdAt: task.createdAt,
      })),
    columns: [
      col('title', 'Title', 'string', { searchable: true }),
      col('module', 'Module', 'string', { filterable: true }),
      col('status', 'Status', 'string', { filterable: true }),
      col('priority', 'Priority', 'string', { filterable: true }),
      col('assigneeName', 'Assignee', 'string', { filterable: true }),
      col('dueDate', 'Due Date', 'date'),
      col('createdAt', 'Created', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'activities',
    label: 'Activity Log',
    description: 'System-wide audit trail of user actions.',
    rows: (data) =>
      toArray(data.activities).map((activity) => ({
        action: activity.action,
        module: activity.module,
        message: activity.message,
        userName: activity.userName,
        createdAt: activity.createdAt,
      })),
    columns: [
      col('action', 'Action', 'string', { filterable: true }),
      col('module', 'Module', 'string', { filterable: true }),
      col('message', 'Message', 'string', { searchable: true }),
      col('userName', 'User', 'string', { filterable: true }),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },

  // ---- Section 59: Management Reports — Sales ------------------------
  // "Daily Sales" / "Monthly Sales" / "Purchase Register" already exist
  // above as the 'sales' and 'purchases' sources (filter by date range).
  // Trial Balance / General Ledger / Cash Book / Bank Book / Receivable /
  // Payable / P&L / Balance Sheet / Cash Flow already exist as their own
  // interactive tabs on the Accounting page (src/app/admin/accounting/
  // page.tsx) — the General Ledger tab's account picker doubles as Cash
  // Book/Bank Book — so they aren't duplicated here as flat tables.
  {
    id: 'productWiseSales',
    label: 'Product-wise Sales',
    description: 'Quantity and revenue sold per product, across all orders.',
    rows: (data) => {
      const rows = new Map<string, { productName: string; quantity: number; revenue: number }>()
      toArray(data.orders)
        .filter((order) => order.status !== 'cancelled')
        .forEach((order) => {
          order.items.forEach((item) => {
            const row = rows.get(item.productId) ?? { productName: item.productName, quantity: 0, revenue: 0 }
            row.quantity += item.quantity
            row.revenue += item.quantity * item.unitPrice
            rows.set(item.productId, row)
          })
        })
      return Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue)
    },
    columns: [
      col('productName', 'Product', 'string', { searchable: true }),
      col('quantity', 'Qty Sold', 'number'),
      col('revenue', 'Revenue', 'currency'),
    ],
  },
  {
    id: 'categoryWiseSales',
    label: 'Category-wise Sales',
    description: 'Quantity and revenue sold per product category, across all orders.',
    rows: (data) => {
      const products = toArray(data.products)
      const categoryByProductId = new Map(products.map((product) => [product.id, product.category || 'Uncategorized']))
      const rows = new Map<string, { category: string; quantity: number; revenue: number }>()
      toArray(data.orders)
        .filter((order) => order.status !== 'cancelled')
        .forEach((order) => {
          order.items.forEach((item) => {
            const category = categoryByProductId.get(item.productId) ?? 'Uncategorized'
            const row = rows.get(category) ?? { category, quantity: 0, revenue: 0 }
            row.quantity += item.quantity
            row.revenue += item.quantity * item.unitPrice
            rows.set(category, row)
          })
        })
      return Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue)
    },
    columns: [
      col('category', 'Category', 'string', { filterable: true }),
      col('quantity', 'Qty Sold', 'number'),
      col('revenue', 'Revenue', 'currency'),
    ],
  },
  {
    id: 'customerWiseSales',
    label: 'Customer-wise Sales',
    description: 'Order count, total sales, and outstanding due per customer.',
    rows: (data) =>
      aggregateSalesBy(
        toArray(data.orders).filter((order) => order.status !== 'cancelled'),
        (order) => order.customerName
      ).map((row) => ({ customerName: row.label, orders: row.orders, totalSales: row.totalSales, totalDue: row.totalDue })),
    columns: [
      col('customerName', 'Customer', 'string', { searchable: true }),
      col('orders', 'Orders', 'number'),
      col('totalSales', 'Total Sales', 'currency'),
      col('totalDue', 'Total Due', 'currency'),
    ],
  },
  {
    id: 'territoryWiseSales',
    label: 'Territory-wise Sales',
    description: 'Order count, total sales, and outstanding due per customer territory.',
    rows: (data) => {
      const customerById = new Map(toArray(data.customers).map((customer) => [customer.id, customer]))
      return aggregateSalesBy(
        toArray(data.orders).filter((order) => order.status !== 'cancelled'),
        (order) => customerById.get(order.customerId)?.territory
      ).map((row) => ({ territory: row.label, orders: row.orders, totalSales: row.totalSales, totalDue: row.totalDue }))
    },
    columns: [
      col('territory', 'Territory', 'string', { filterable: true }),
      col('orders', 'Orders', 'number'),
      col('totalSales', 'Total Sales', 'currency'),
      col('totalDue', 'Total Due', 'currency'),
    ],
  },
  {
    id: 'officerWiseSales',
    label: 'Sales Officer-wise Sales',
    description: 'Order count, total sales, and outstanding due per sales officer.',
    rows: (data) =>
      aggregateSalesBy(
        toArray(data.orders).filter((order) => order.status !== 'cancelled'),
        (order) => order.salesPersonName
      ).map((row) => ({ salesOfficer: row.label, orders: row.orders, totalSales: row.totalSales, totalDue: row.totalDue })),
    columns: [
      col('salesOfficer', 'Sales Officer', 'string', { filterable: true }),
      col('orders', 'Orders', 'number'),
      col('totalSales', 'Total Sales', 'currency'),
      col('totalDue', 'Total Due', 'currency'),
    ],
  },
  {
    id: 'dealerWiseSales',
    label: 'Dealer-wise Sales',
    description: 'Order count, total sales, and outstanding due per dealer customer.',
    rows: (data) => {
      const customerById = new Map(toArray(data.customers).map((customer) => [customer.id, customer]))
      const dealerOrders = toArray(data.orders).filter(
        (order) => order.status !== 'cancelled' && customerById.get(order.customerId)?.customerType === 'dealer'
      )
      return aggregateSalesBy(dealerOrders, (order) => customerById.get(order.customerId)?.name).map((row) => ({
        dealerName: row.label,
        orders: row.orders,
        totalSales: row.totalSales,
        totalDue: row.totalDue,
      }))
    },
    columns: [
      col('dealerName', 'Dealer', 'string', { searchable: true }),
      col('orders', 'Orders', 'number'),
      col('totalSales', 'Total Sales', 'currency'),
      col('totalDue', 'Total Due', 'currency'),
    ],
  },
  {
    id: 'salesReturns',
    label: 'Sales Return',
    description: 'Goods returned by customers, refund value, and restock/write-off split.',
    rows: (data) =>
      toArray(data.salesReturns).map((salesReturn) => ({
        returnNumber: salesReturn.returnNumber,
        billNumber: salesReturn.billNumber,
        customerName: salesReturn.customerName,
        products: salesReturn.items.map((item) => `${item.productName} x ${item.quantity}`).join(', '),
        totalRefund: salesReturn.totalRefund,
        restockedQty: salesReturn.restockedQty,
        writtenOffQty: salesReturn.writtenOffQty,
        processedByName: salesReturn.processedByName,
        createdAt: salesReturn.createdAt,
      })),
    columns: [
      col('returnNumber', 'Return No.', 'string', { searchable: true }),
      col('billNumber', 'Bill No.', 'string', { searchable: true }),
      col('customerName', 'Customer', 'string', { searchable: true }),
      col('products', 'Products', 'string', { searchable: true }),
      col('totalRefund', 'Refund', 'currency'),
      col('restockedQty', 'Restocked Qty', 'number'),
      col('writtenOffQty', 'Written Off Qty', 'number'),
      col('processedByName', 'Processed By', 'string', { filterable: true }),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'discountReport',
    label: 'Discount Report',
    description: 'Orders with a regular or promotional discount applied.',
    rows: (data) =>
      toArray(data.orders)
        .filter((order) => (order.discount ?? 0) > 0 || (order.promotionalDiscount ?? 0) > 0)
        .map((order) => ({
          billNumber: order.billNumber,
          customerName: order.customerName,
          salesPerson: order.salesPersonName,
          subtotal: order.subtotal ?? order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
          discount: order.discount ?? 0,
          promotionalDiscount: order.promotionalDiscount ?? 0,
          totalDiscount: (order.discount ?? 0) + (order.promotionalDiscount ?? 0),
          total: order.total,
          date: order.createdAt,
        })),
    columns: [
      col('billNumber', 'Bill No.', 'string', { searchable: true }),
      col('customerName', 'Customer', 'string', { searchable: true }),
      col('salesPerson', 'Sales Person', 'string', { filterable: true }),
      col('subtotal', 'Subtotal', 'currency'),
      col('discount', 'Discount', 'currency'),
      col('promotionalDiscount', 'Promotional Discount', 'currency'),
      col('totalDiscount', 'Total Discount', 'currency'),
      col('total', 'Total', 'currency'),
      col('date', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'targetAchievement',
    label: 'Target vs Achievement',
    description: 'Sales targets by sales officer, territory, sales area, or dealer against actual achievement for that period.',
    rows: (data) => {
      const customerById = new Map(toArray(data.customers).map((customer) => [customer.id, customer]))
      const orders = toArray(data.orders).filter((order) => order.status !== 'cancelled')
      return toArray(data.salesTargets)
        .map((target) => {
          const periodOrders = orders.filter((order) => order.createdAt.slice(0, 7) === target.period)
          const achievedAmount = achievedAmountFor(target, periodOrders, customerById)
          return {
            period: target.period,
            entityType: target.entityType,
            entityName: target.entityName,
            targetAmount: target.targetAmount,
            achievedAmount,
            achievementPercent: target.targetAmount > 0 ? (achievedAmount / target.targetAmount) * 100 : 0,
          }
        })
        .sort((a, b) => b.period.localeCompare(a.period) || b.targetAmount - a.targetAmount)
    },
    columns: [
      col('period', 'Period', 'string', { filterable: true }),
      col('entityType', 'Entity Type', 'string', { filterable: true }),
      col('entityName', 'Entity', 'string', { searchable: true }),
      col('targetAmount', 'Target', 'currency'),
      col('achievedAmount', 'Achieved', 'currency'),
      col('achievementPercent', 'Achievement %', 'number'),
    ],
  },

  // ---- Section 59: Management Reports — Inventory ---------------------
  // "Current Stock" already exists above as the 'stock' source.
  {
    id: 'warehouseStock',
    label: 'Warehouse Stock',
    description: 'Stock quantity and value grouped by warehouse.',
    rows: (data) =>
      buildInventoryDashboard(data).warehouseWiseStock.map((row) => ({
        warehouseName: row.warehouseName,
        quantity: row.quantity,
        value: row.value,
      })),
    columns: [
      col('warehouseName', 'Warehouse', 'string', { filterable: true }),
      col('quantity', 'Quantity', 'number'),
      col('value', 'Value', 'currency'),
    ],
  },
  {
    id: 'batchStock',
    label: 'Batch Stock',
    description: 'Remaining quantity per received batch (FIFO/FEFO), with manufacturing and expiry dates.',
    rows: (data) =>
      buildInventoryDashboard(data).batchWiseStock.map((batch) => ({
        productName: batch.productName,
        batchNumber: batch.batchNumber,
        warehouse: data.warehouses[batch.warehouseId]?.name ?? '',
        manufacturingDate: batch.manufacturingDate,
        expiryDate: batch.expiryDate,
        quantity: batch.quantity,
      })),
    columns: [
      col('productName', 'Product', 'string', { searchable: true }),
      col('batchNumber', 'Batch No.', 'string', { searchable: true }),
      col('warehouse', 'Warehouse', 'string', { filterable: true }),
      col('manufacturingDate', 'Mfg. Date', 'date'),
      col('expiryDate', 'Expiry Date', 'date', { isPrimaryDate: true }),
      col('quantity', 'Quantity', 'number'),
    ],
  },
  {
    id: 'stockValuation',
    label: 'Stock Valuation',
    description: 'Stock value per product at purchase cost, with category and warehouse.',
    rows: (data) =>
      toArray(data.products).map((product) => ({
        name: product.name,
        sku: product.sku,
        category: product.category,
        warehouse: data.warehouses[product.warehouseId]?.name ?? '',
        stockQty: product.stockQty,
        purchasePrice: product.purchasePrice,
        stockValue: product.stockQty * product.purchasePrice,
      })),
    columns: [
      col('name', 'Product', 'string', { searchable: true }),
      col('sku', 'SKU', 'string', { searchable: true }),
      col('category', 'Category', 'string', { filterable: true }),
      col('warehouse', 'Warehouse', 'string', { filterable: true }),
      col('stockQty', 'Stock Qty', 'number'),
      col('purchasePrice', 'Unit Cost', 'currency'),
      col('stockValue', 'Stock Value', 'currency'),
    ],
  },
  {
    id: 'stockMovement',
    label: 'Stock Movement',
    description: 'Stock transferred between warehouses, with status and requester.',
    rows: (data) =>
      toArray(data.stockTransfers).map((transfer) => ({
        transferNumber: transfer.transferNumber,
        productName: transfer.productName,
        fromWarehouse: transfer.fromWarehouseName,
        toWarehouse: transfer.toWarehouseName,
        quantity: transfer.quantity,
        status: transfer.status,
        requestedByName: transfer.requestedByName,
        createdAt: transfer.createdAt,
      })),
    columns: [
      col('transferNumber', 'Transfer No.', 'string', { searchable: true }),
      col('productName', 'Product', 'string', { searchable: true }),
      col('fromWarehouse', 'From', 'string', { filterable: true }),
      col('toWarehouse', 'To', 'string', { filterable: true }),
      col('quantity', 'Quantity', 'number'),
      col('status', 'Status', 'string', { filterable: true }),
      col('requestedByName', 'Requested By', 'string', { filterable: true }),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'stockAdjustment',
    label: 'Stock Adjustment',
    description: 'Manual stock corrections with before/after quantity, reason, and approval status.',
    rows: (data) =>
      toArray(data.stockAdjustments).map((adjustment) => ({
        productName: adjustment.productName,
        warehouse: adjustment.warehouseName,
        quantityBefore: adjustment.quantityBefore,
        quantityAfter: adjustment.quantityAfter,
        delta: adjustment.delta,
        reason: adjustment.reason,
        status: adjustment.status,
        requestedByName: adjustment.requestedByName,
        createdAt: adjustment.createdAt,
      })),
    columns: [
      col('productName', 'Product', 'string', { searchable: true }),
      col('warehouse', 'Warehouse', 'string', { filterable: true }),
      col('quantityBefore', 'Before', 'number'),
      col('quantityAfter', 'After', 'number'),
      col('delta', 'Delta', 'number'),
      col('reason', 'Reason', 'string', { searchable: true }),
      col('status', 'Status', 'string', { filterable: true }),
      col('requestedByName', 'Requested By', 'string', { filterable: true }),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'lowStock',
    label: 'Low Stock',
    description: 'Products at or below their minimum stock level (but not yet fully out of stock).',
    rows: (data) =>
      toArray(data.products)
        .filter((product) => product.stockQty > 0 && product.stockQty <= product.minStock)
        .map((product) => ({
          name: product.name,
          sku: product.sku,
          category: product.category,
          warehouse: data.warehouses[product.warehouseId]?.name ?? '',
          stockQty: product.stockQty,
          minStock: product.minStock,
          shortfall: product.minStock - product.stockQty,
        })),
    columns: [
      col('name', 'Product', 'string', { searchable: true }),
      col('sku', 'SKU', 'string', { searchable: true }),
      col('category', 'Category', 'string', { filterable: true }),
      col('warehouse', 'Warehouse', 'string', { filterable: true }),
      col('stockQty', 'Stock Qty', 'number'),
      col('minStock', 'Min Stock', 'number'),
      col('shortfall', 'Shortfall', 'number'),
    ],
  },
  {
    id: 'expiryReport',
    label: 'Expiry Report',
    description: 'Batches with an expiry date, flagged Expired / Near Expiry (within 30 days) / OK.',
    rows: (data) => {
      const now = Date.now()
      return toArray(data.batches)
        .filter((batch) => batch.expiryDate)
        .map((batch) => {
          const expiryTime = new Date(batch.expiryDate).getTime()
          const daysToExpiry = Math.ceil((expiryTime - now) / 86_400_000)
          const status = expiryTime < now ? 'Expired' : daysToExpiry <= 30 ? 'Near Expiry' : 'OK'
          return {
            productName: batch.productName,
            batchNumber: batch.batchNumber,
            warehouse: data.warehouses[batch.warehouseId]?.name ?? '',
            quantity: batch.quantity,
            expiryDate: batch.expiryDate,
            daysToExpiry,
            status,
          }
        })
    },
    columns: [
      col('productName', 'Product', 'string', { searchable: true }),
      col('batchNumber', 'Batch No.', 'string', { searchable: true }),
      col('warehouse', 'Warehouse', 'string', { filterable: true }),
      col('quantity', 'Quantity', 'number'),
      col('expiryDate', 'Expiry Date', 'date', { isPrimaryDate: true }),
      col('daysToExpiry', 'Days To Expiry', 'number'),
      col('status', 'Status', 'string', { filterable: true }),
    ],
  },
  {
    id: 'damagedStock',
    label: 'Damaged Stock',
    description: 'Products classified as Damaged Goods stock, with remaining quantity and value.',
    rows: (data) =>
      toArray(data.products)
        .filter((product) => (product.productType ?? '').toLowerCase().includes('damaged'))
        .map((product) => ({
          name: product.name,
          sku: product.sku,
          warehouse: data.warehouses[product.warehouseId]?.name ?? '',
          stockQty: product.stockQty,
          value: product.stockQty * product.purchasePrice,
          updatedAt: product.updatedAt,
        })),
    columns: [
      col('name', 'Product', 'string', { searchable: true }),
      col('sku', 'SKU', 'string', { searchable: true }),
      col('warehouse', 'Warehouse', 'string', { filterable: true }),
      col('stockQty', 'Stock Qty', 'number'),
      col('value', 'Value', 'currency'),
      col('updatedAt', 'Updated', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'deadStock',
    label: 'Dead Stock',
    description: 'Products still in stock with no sale in the last 90 days (or never sold).',
    rows: (data) => {
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000
      const lastSoldAt = new Map<string, number>()
      toArray(data.orders)
        .filter((order) => order.status !== 'cancelled')
        .forEach((order) => {
          const time = new Date(order.createdAt).getTime()
          order.items.forEach((item) => {
            if (time > (lastSoldAt.get(item.productId) ?? 0)) lastSoldAt.set(item.productId, time)
          })
        })
      return toArray(data.products)
        .filter((product) => product.stockQty > 0 && (lastSoldAt.get(product.id) ?? 0) < cutoff)
        .map((product) => {
          const lastSold = lastSoldAt.get(product.id)
          return {
            name: product.name,
            sku: product.sku,
            category: product.category,
            stockQty: product.stockQty,
            value: product.stockQty * product.purchasePrice,
            lastSoldAt: lastSold ? new Date(lastSold).toISOString() : '',
          }
        })
    },
    columns: [
      col('name', 'Product', 'string', { searchable: true }),
      col('sku', 'SKU', 'string', { searchable: true }),
      col('category', 'Category', 'string', { filterable: true }),
      col('stockQty', 'Stock Qty', 'number'),
      col('value', 'Value', 'currency'),
      col('lastSoldAt', 'Last Sold', 'date'),
    ],
  },

  // ---- Section 59: Management Reports — Purchase ----------------------
  // "Purchase Register" already exists above as the 'purchases' source.
  {
    id: 'supplierWisePurchase',
    label: 'Supplier-wise Purchase',
    description: 'Purchase count and total value per supplier.',
    rows: (data) => {
      const rows = new Map<string, { supplierName: string; count: number; total: number }>()
      toArray(data.purchases).forEach((purchase) => {
        const row = rows.get(purchase.supplierName) ?? { supplierName: purchase.supplierName, count: 0, total: 0 }
        row.count += 1
        row.total += purchase.total
        rows.set(purchase.supplierName, row)
      })
      return Array.from(rows.values()).sort((a, b) => b.total - a.total)
    },
    columns: [
      col('supplierName', 'Supplier', 'string', { searchable: true }),
      col('count', 'Purchases', 'number'),
      col('total', 'Total Value', 'currency'),
    ],
  },
  {
    id: 'purchaseOrder',
    label: 'Purchase Order',
    description: 'Every purchase order raised, with GRN, billing, and payment status.',
    rows: (data) =>
      toArray(data.purchaseOrders).map((po) => ({
        poNumber: po.poNumber,
        supplierName: po.supplierName,
        warehouse: po.warehouseName,
        status: po.status,
        billStatus: po.billStatus,
        subtotal: po.subtotal,
        totalLandedCost: po.totalLandedCost,
        paid: po.paid,
        due: po.due,
        expectedDate: po.expectedDate,
        createdAt: po.createdAt,
      })),
    columns: [
      col('poNumber', 'PO No.', 'string', { searchable: true }),
      col('supplierName', 'Supplier', 'string', { filterable: true }),
      col('warehouse', 'Warehouse', 'string', { filterable: true }),
      col('status', 'Status', 'string', { filterable: true }),
      col('billStatus', 'Bill Status', 'string', { filterable: true }),
      col('subtotal', 'Subtotal', 'currency'),
      col('totalLandedCost', 'Landed Cost', 'currency'),
      col('paid', 'Paid', 'currency'),
      col('due', 'Due', 'currency'),
      col('expectedDate', 'Expected Date', 'date'),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'purchaseReturn',
    label: 'Purchase Return',
    description: 'Goods returned to suppliers from a received purchase order.',
    rows: (data) =>
      toArray(data.purchaseReturns).map((purchaseReturn) => ({
        returnNumber: purchaseReturn.returnNumber,
        poNumber: purchaseReturn.poNumber,
        supplierName: purchaseReturn.supplierName,
        warehouse: purchaseReturn.warehouseName,
        products: purchaseReturn.items.map((item) => `${item.productName} x ${item.quantity}`).join(', '),
        totalValue: purchaseReturn.totalValue,
        reason: purchaseReturn.reason,
        processedByName: purchaseReturn.processedByName,
        createdAt: purchaseReturn.createdAt,
      })),
    columns: [
      col('returnNumber', 'Return No.', 'string', { searchable: true }),
      col('poNumber', 'PO No.', 'string', { searchable: true }),
      col('supplierName', 'Supplier', 'string', { filterable: true }),
      col('warehouse', 'Warehouse', 'string', { filterable: true }),
      col('products', 'Products', 'string', { searchable: true }),
      col('totalValue', 'Total Value', 'currency'),
      col('reason', 'Reason', 'string', { searchable: true }),
      col('processedByName', 'Processed By', 'string', { filterable: true }),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'outstandingPurchase',
    label: 'Outstanding Purchase',
    description: 'Purchase orders with an unpaid balance still due to the supplier.',
    rows: (data) =>
      toArray(data.purchaseOrders)
        .filter((po) => po.due > 0 && po.status !== 'cancelled')
        .map((po) => ({
          poNumber: po.poNumber,
          supplierName: po.supplierName,
          totalLandedCost: po.totalLandedCost,
          paid: po.paid,
          due: po.due,
          expectedDate: po.expectedDate,
          createdAt: po.createdAt,
        })),
    columns: [
      col('poNumber', 'PO No.', 'string', { searchable: true }),
      col('supplierName', 'Supplier', 'string', { filterable: true }),
      col('totalLandedCost', 'Landed Cost', 'currency'),
      col('paid', 'Paid', 'currency'),
      col('due', 'Due', 'currency'),
      col('expectedDate', 'Expected Date', 'date'),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },

  // ---- Section 59: Management Reports — Manufacturing ------------------
  {
    id: 'productionReport',
    label: 'Production Report',
    description: 'Every production order with planned vs finished quantity and QC status.',
    rows: (data) =>
      toArray(data.productionOrders).map((order) => ({
        productionNumber: order.productionNumber,
        finishedProductName: order.finishedProductName,
        warehouse: order.warehouseName,
        plannedBatches: order.plannedBatches,
        plannedOutputQty: order.plannedOutputQty,
        finishedGoodsQty: order.finishedGoodsQty,
        status: order.status,
        qualityCheckStatus: order.qualityCheckStatus,
        createdAt: order.createdAt,
      })),
    columns: [
      col('productionNumber', 'Production No.', 'string', { searchable: true }),
      col('finishedProductName', 'Finished Product', 'string', { searchable: true }),
      col('warehouse', 'Warehouse', 'string', { filterable: true }),
      col('plannedBatches', 'Planned Batches', 'number'),
      col('plannedOutputQty', 'Planned Output', 'number'),
      col('finishedGoodsQty', 'Finished Qty', 'number'),
      col('status', 'Status', 'string', { filterable: true }),
      col('qualityCheckStatus', 'QC Status', 'string', { filterable: true }),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'productionCost',
    label: 'Production Cost',
    description: 'Full cost breakdown per production order, and cost per finished unit.',
    rows: (data) =>
      toArray(data.productionOrders).map((order) => ({
        productionNumber: order.productionNumber,
        finishedProductName: order.finishedProductName,
        rawMaterialCost: order.rawMaterialCost,
        packagingCost: order.packagingCost,
        directLabourCost: order.directLabourCost,
        electricityCost: order.electricityCost,
        gasFuelCost: order.gasFuelCost,
        factoryOverheadCost: order.factoryOverheadCost,
        processingCost: order.processingCost,
        otherCost: order.otherCost,
        totalCost: order.totalCost,
        unitCost: order.unitCost,
        finishedGoodsQty: order.finishedGoodsQty,
        createdAt: order.updatedAt,
      })),
    columns: [
      col('productionNumber', 'Production No.', 'string', { searchable: true }),
      col('finishedProductName', 'Finished Product', 'string', { searchable: true }),
      col('rawMaterialCost', 'Raw Material', 'currency'),
      col('packagingCost', 'Packaging', 'currency'),
      col('directLabourCost', 'Labour', 'currency'),
      col('electricityCost', 'Electricity', 'currency'),
      col('gasFuelCost', 'Gas/Fuel', 'currency'),
      col('factoryOverheadCost', 'Factory Overhead', 'currency'),
      col('processingCost', 'Processing', 'currency'),
      col('otherCost', 'Other', 'currency'),
      col('totalCost', 'Total Cost', 'currency'),
      col('unitCost', 'Unit Cost', 'currency'),
      col('finishedGoodsQty', 'Finished Qty', 'number'),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'rawMaterialConsumption',
    label: 'Raw Material Consumption',
    description: 'Required vs issued quantity per raw material line, across every production order.',
    rows: (data) =>
      toArray(data.productionOrders).flatMap((order) =>
        order.materials.map((material) => ({
          productionNumber: order.productionNumber,
          finishedProductName: order.finishedProductName,
          materialName: material.productName,
          requiredQty: material.requiredQty,
          issuedQty: material.issuedQty,
          unitCost: material.unitCost,
          totalCost: material.issuedQty * material.unitCost,
          createdAt: order.updatedAt,
        }))
      ),
    columns: [
      col('productionNumber', 'Production No.', 'string', { searchable: true }),
      col('finishedProductName', 'Finished Product', 'string', { searchable: true }),
      col('materialName', 'Material', 'string', { searchable: true }),
      col('requiredQty', 'Required Qty', 'number'),
      col('issuedQty', 'Issued Qty', 'number'),
      col('unitCost', 'Unit Cost', 'currency'),
      col('totalCost', 'Total Cost', 'currency'),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'productionVariance',
    label: 'Production Variance',
    description: 'Planned vs actual output and production loss against the standard loss allowance.',
    rows: (data) =>
      toArray(data.productionOrders)
        .filter((order) => order.status === 'completed')
        .map((order) => ({
          productionNumber: order.productionNumber,
          finishedProductName: order.finishedProductName,
          plannedOutputQty: order.plannedOutputQty,
          finishedGoodsQty: order.finishedGoodsQty,
          productionLossQty: order.productionLossQty,
          productionLossPercentage: order.productionLossPercentage,
          varianceAlert: order.varianceAlert,
          createdAt: order.updatedAt,
        })),
    columns: [
      col('productionNumber', 'Production No.', 'string', { searchable: true }),
      col('finishedProductName', 'Finished Product', 'string', { searchable: true }),
      col('plannedOutputQty', 'Planned Output', 'number'),
      col('finishedGoodsQty', 'Finished Qty', 'number'),
      col('productionLossQty', 'Loss Qty', 'number'),
      col('productionLossPercentage', 'Loss %', 'number'),
      col('varianceAlert', 'Over Standard Loss', 'boolean', { filterable: true }),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'productionBatchReport',
    label: 'Batch Report',
    description: 'Per-batch costing for every production order — total cost and finished quantity divided across its planned batches.',
    rows: (data) =>
      toArray(data.productionOrders).map((order) => ({
        productionNumber: order.productionNumber,
        finishedProductName: order.finishedProductName,
        plannedBatches: order.plannedBatches,
        costPerBatch: order.plannedBatches > 0 ? order.totalCost / order.plannedBatches : 0,
        finishedGoodsQty: order.finishedGoodsQty,
        unitCost: order.unitCost,
        status: order.status,
        createdAt: order.createdAt,
      })),
    columns: [
      col('productionNumber', 'Production No.', 'string', { searchable: true }),
      col('finishedProductName', 'Finished Product', 'string', { searchable: true }),
      col('plannedBatches', 'Planned Batches', 'number'),
      col('costPerBatch', 'Cost / Batch', 'currency'),
      col('finishedGoodsQty', 'Finished Qty', 'number'),
      col('unitCost', 'Unit Cost', 'currency'),
      col('status', 'Status', 'string', { filterable: true }),
      col('createdAt', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'wastageReport',
    label: 'Wastage Report',
    description: 'Production loss and QC-scrapped stock, the two sources of physical wastage.',
    rows: (data) => {
      const productionWastage = toArray(data.productionOrders)
        .filter((order) => order.productionLossQty > 0)
        .map((order) => ({
          source: 'Production Loss',
          reference: order.productionNumber,
          productName: order.finishedProductName,
          quantity: order.productionLossQty,
          note: `${order.productionLossPercentage.toFixed(1)}% loss`,
          date: order.updatedAt,
        }))
      const scrapWastage = toArray(data.qcHolds)
        .filter((hold) => hold.status === 'scrapped')
        .map((hold) => ({
          source: 'QC Scrap',
          reference: hold.sourceReference,
          productName: hold.productName,
          quantity: hold.quantity,
          note: hold.reason,
          date: hold.updatedAt,
        }))
      return [...productionWastage, ...scrapWastage].sort((a, b) => b.date.localeCompare(a.date))
    },
    columns: [
      col('source', 'Source', 'string', { filterable: true }),
      col('reference', 'Reference', 'string', { searchable: true }),
      col('productName', 'Product', 'string', { searchable: true }),
      col('quantity', 'Quantity', 'number'),
      col('note', 'Note', 'string', { searchable: true }),
      col('date', 'Date', 'date', { isPrimaryDate: true }),
    ],
  },
  {
    id: 'bomReport',
    label: 'BOM Report',
    description: 'Active recipe/formula versions with their full component list.',
    rows: (data) =>
      toArray(data.billOfMaterials)
        .filter((bom) => bom.isActive)
        .flatMap((bom) =>
          bom.components.map((component) => ({
            formulaCode: bom.formulaCode,
            finishedProductName: bom.finishedProductName,
            version: bom.version,
            outputQuantity: bom.outputQuantity,
            componentName: component.productName,
            quantityPerBatch: component.quantityPerBatch,
            percentage: component.percentage ?? 0,
            approvalStatus: bom.approvalStatus,
            updatedAt: bom.updatedAt,
          }))
        ),
    columns: [
      col('formulaCode', 'Formula Code', 'string', { searchable: true }),
      col('finishedProductName', 'Finished Product', 'string', { searchable: true }),
      col('version', 'Version', 'number'),
      col('outputQuantity', 'Output Qty', 'number'),
      col('componentName', 'Component', 'string', { searchable: true }),
      col('quantityPerBatch', 'Qty / Batch', 'number'),
      col('percentage', 'Percentage', 'number'),
      col('approvalStatus', 'Approval Status', 'string', { filterable: true }),
      col('updatedAt', 'Updated', 'date', { isPrimaryDate: true }),
    ],
  },
]

export function formatReportValue(column: ReportColumn, value: unknown, currency: string) {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  switch (column.type) {
    case 'currency':
      return formatCurrency(Number(value), currency)
    case 'date':
      return formatDate(String(value))
    case 'boolean':
      return value ? 'Yes' : 'No'
    case 'number':
      return typeof value === 'number' ? value.toLocaleString('en-BD') : String(value)
    default:
      return String(value)
  }
}

export function reportExportValue(column: ReportColumn, value: unknown) {
  if (value === null || value === undefined) {
    return ''
  }

  if (column.type === 'number' || column.type === 'currency') {
    return Number(value) || 0
  }

  if (column.type === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (column.type === 'date') {
    return value ? formatDate(String(value)) : ''
  }

  return String(value)
}

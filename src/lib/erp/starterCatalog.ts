// Recipe Food Products Ltd. — starter Category/SKU structure (Spec Section 5).
// This is only a suggestion catalog; the Administrator can always create
// products manually with any Category/SKU from the Inventory screen.

export type StarterCatalogItem = {
  sku: string
  name: string
  category: string
  subCategory?: string
  productType: string
  unit: string
  packSize: string
}

const RFP_PREFIX = 'RFP'

function item(
  skuSuffix: string,
  name: string,
  category: string,
  packSize: string,
  unit: string,
  subCategory?: string
): StarterCatalogItem {
  return {
    sku: `${RFP_PREFIX}-${skuSuffix}`,
    name,
    category,
    subCategory,
    productType: 'Finished Goods',
    unit,
    packSize,
  }
}

export const RECIPE_STARTER_CATALOG: StarterCatalogItem[] = [
  // Mustard Oil
  item('MUS-080ML', 'Mustard Oil 80 ml', 'Mustard Oil', '80 ml', 'ML'),
  item('MUS-200ML', 'Mustard Oil 200 ml', 'Mustard Oil', '200 ml', 'ML'),
  item('MUS-500ML', 'Mustard Oil 500 ml', 'Mustard Oil', '500 ml', 'ML'),
  item('MUS-1000ML', 'Mustard Oil 1000 ml', 'Mustard Oil', '1000 ml', 'ML'),

  // Tejpatta
  item('TEJ-040G', 'Tejpatta 40 g', 'Tejpatta', '40 g', 'Gram'),
  item('TEJ-070G', 'Tejpatta 70 g', 'Tejpatta', '70 g', 'Gram'),

  // Suji
  item('SUJ-200G', 'Suji 200 g', 'Suji', '200 g', 'Gram'),
  item('SUJ-400G', 'Suji 400 g', 'Suji', '400 g', 'Gram'),
  item('SUJ-400G-BOX', 'Box Suji 400 g', 'Suji', '400 g', 'Gram', 'Box Pack'),

  // Muri
  item('MUR-200G', 'Muri 200 g', 'Muri', '200 g', 'Gram'),
  item('MUR-400G', 'Muri 400 g', 'Muri', '400 g', 'Gram'),

  // Spice Products — carton size not in the spec, defaults to 1 (update from
  // the Product List once known, same as their zero price/stock).
  item('SPC-CHILI', 'Chili Powder', 'Spice Products', '1', 'Gram'),
  item('SPC-TURMERIC', 'Turmeric Powder', 'Spice Products', '1', 'Gram'),
  item('SPC-CORIANDER', 'Coriander Powder', 'Spice Products', '1', 'Gram'),
  item('SPC-BIRYANI', 'Biryani Masala', 'Spice Products', '1', 'Gram'),
  item('SPC-CHICKEN', 'Chicken Masala', 'Spice Products', '1', 'Gram'),
  item('SPC-BEEF', 'Beef Masala', 'Spice Products', '1', 'Gram'),
  item('SPC-MEAT', 'Meat Masala', 'Spice Products', '1', 'Gram'),
  item('SPC-ROAST', 'Roast Masala', 'Spice Products', '1', 'Gram'),
  item('SPC-PANCH', 'Panch Phoron', 'Spice Products', '1', 'Gram'),
]

export const RECIPE_STARTER_CATEGORIES: string[] = Array.from(
  new Set(RECIPE_STARTER_CATALOG.map((entry) => entry.category))
)

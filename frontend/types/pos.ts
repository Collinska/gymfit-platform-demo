export type POSProduct = {
  product_id: string
  display_name: string
  product_name: string
  rate: number
  mrp: number
  tax_id: number
  tax_value: number
  tax_name: string
  include_in_rate: boolean
  ask_price: boolean
  is_stock_item: boolean
}

export type POSMenu = {
  menu_id: number
  menu_name: string
  items: POSProduct[]
}

export type POSMember = {
  customer_id: string
  first_name: string
  last_name: string
  account_id: number
  mobile: string
  balance: number
}

export type CartItem = POSProduct & {
  quantity: number
  line_total: number
  tax_amount: number
  taxable_value: number
}

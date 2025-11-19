/**
 * GoedGepickt API Client
 * Voor het ophalen van order informatie
 */

const GOEDGEPICKT_BASE_URL = "https://account.goedgepickt.nl/api/v1"

export interface GoedGepicktProduct {
  productUuid?: string
  productName?: string
  sku?: string
  productQuantity?: number
  pickedQuantity?: number
  type?: "normal" | "parent" | "child"
  stock?: {
    freeStock?: number
    totalStock?: number
    reservedStock?: number
    unlimitedStock?: boolean
  }
  allowBackorders?: boolean
  [key: string]: any
}

export interface GoedGepicktOrder {
  uuid?: string
  orderNumber?: string
  status?: string
  tags?: string[]
  customerName?: string
  customer?: {
    name?: string
    email?: string
    [key: string]: any
  }
  products?: GoedGepicktProduct[]
  notes?: string
  [key: string]: any
}

export class GoedGepicktAPI {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl: string = GOEDGEPICKT_BASE_URL) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, "")
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    }
  }

  /**
   * Haal een order op via UUID
   */
  async getOrder(orderUuid: string): Promise<GoedGepicktOrder | null> {
    const url = `${this.baseUrl}/orders/${orderUuid}`

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
        cache: "no-store",
      })

      if (response.status === 200) {
        const data = await response.json()
        return data
      } else if (response.status === 401) {
        console.error("❌ GoedGepickt authenticatie gefaald - check API key")
        return null
      } else if (response.status === 404) {
        console.error(`❌ Order ${orderUuid} niet gevonden`)
        return null
      } else {
        console.error(`❌ GoedGepickt API error: ${response.status}`)
        const text = await response.text()
        console.error("Response:", text)
        return null
      }
    } catch (error) {
      console.error("❌ GoedGepickt API error:", error)
      return null
    }
  }

  /**
   * Haal product details op
   */
  async getProduct(productUuid: string): Promise<GoedGepicktProduct | null> {
    const url = `${this.baseUrl}/products/${productUuid}`

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
        cache: "no-store",
      })

      if (response.status === 200) {
        return await response.json()
      }
      return null
    } catch (error) {
      console.error("❌ Error fetching product:", error)
      return null
    }
  }

  /**
   * Test de API connectie
   */
  async testConnection(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/orders`
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
        cache: "no-store",
      })

      return response.status === 200 || response.status === 401 // 401 betekent dat de endpoint bereikbaar is
    } catch (error) {
      console.error("❌ Connection test failed:", error)
      return false
    }
  }
}

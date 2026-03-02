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

  /**
   * Haal alle pick-locaties op (alle pagina's)
   */
  async getPickLocations(): Promise<{ uuid: string; name: string; [key: string]: any }[]> {
    const allLocations: { uuid: string; name: string; [key: string]: any }[] = []
    let page = 1
    const perPage = 100

    while (true) {
      const url = `${this.baseUrl}/picklocations?perPage=${perPage}&page=${page}`
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: this.getHeaders(),
          cache: "no-store",
        })
        if (response.status !== 200) break

        const data = await response.json()
        let items: any[] = []

        if (Array.isArray(data)) {
          items = data
        } else if (data.items && Array.isArray(data.items)) {
          items = data.items
        } else if (data.data && Array.isArray(data.data)) {
          items = data.data
        }

        allLocations.push(...items)

        // Stop als er minder items zijn dan perPage (laatste pagina)
        const lastPage = data.pageInfo?.lastPage ?? null
        if (lastPage !== null && page >= lastPage) break
        if (items.length < perPage) break
        page++
      } catch (error) {
        console.error("❌ Error fetching picklocations:", error)
        break
      }
    }

    return allLocations
  }

  /**
   * Haal stock locations op voor een product
   */
  async getProductStockLocations(
    productUuid: string
  ): Promise<{ picklocationUuid: string; picklocationName: string; stockQuantity: number; stockPriority: number }[]> {
    const url = `${this.baseUrl}/products/${productUuid}/stock`
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
        cache: "no-store",
      })
      if (response.status !== 200) return []
      const data = await response.json()
      return data.stockLocations || []
    } catch (error) {
      console.error("❌ Error fetching product stock locations:", error)
      return []
    }
  }

  /**
   * Maak een stock location aan voor een product (koppel product aan picklocation)
   * POST /products/{uuid}/stock/{locationUuid}
   */
  async createStockLocation(
    productUuid: string,
    pickLocationUuid: string,
    stockQuantity: number = 0,
    priority: number = 1
  ): Promise<{ ok: boolean; error?: string }> {
    const url = `${this.baseUrl}/products/${productUuid}/stock/${pickLocationUuid}`
    try {
      const body = new URLSearchParams()
      body.append("stockQuantity", stockQuantity.toString())
      body.append("priority", priority.toString())

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
        cache: "no-store",
      })
      if (response.status === 200) return { ok: true }
      const text = await response.text()
      let errorMessage = `HTTP ${response.status}`
      try {
        const json = JSON.parse(text)
        if (json.errorMessage) errorMessage = json.errorMessage
        else if (json.message) errorMessage = json.message
      } catch {}
      console.error(`❌ Create stock location failed for ${productUuid}: ${response.status} ${text}`)
      return { ok: false, error: errorMessage }
    } catch (error) {
      console.error("❌ Error creating stock location:", error)
      return { ok: false, error: String(error) }
    }
  }

  /**
   * Update stock op een specifieke locatie (set absoluut aantal)
   * PUT /products/{uuid}/stock/{locationUuid}
   */
  async updateStockLocation(
    productUuid: string,
    pickLocationUuid: string,
    stockQuantity: number,
    reason?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const url = `${this.baseUrl}/products/${productUuid}/stock/${pickLocationUuid}`
    try {
      const body = new URLSearchParams()
      body.append("stockQuantity", stockQuantity.toString())
      if (reason) body.append("reason", reason)

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
        cache: "no-store",
      })
      if (response.status === 200) return { ok: true }
      const text = await response.text()
      let errorMessage = `HTTP ${response.status}`
      try {
        const json = JSON.parse(text)
        if (json.errorMessage) errorMessage = json.errorMessage
        else if (json.message) errorMessage = json.message
      } catch {}
      console.error(`❌ Update stock location failed for ${productUuid}: ${response.status} ${text}`)
      return { ok: false, error: errorMessage }
    } catch (error) {
      console.error("❌ Error updating stock location:", error)
      return { ok: false, error: String(error) }
    }
  }

  /**
   * Muteer voorraad van een product
   * Positief = toevoegen, negatief = verminderen
   * Geeft { ok: true } of { ok: false, error: string } terug
   */
  async stockMutation(
    productUuid: string,
    mutation: number,
    mutationReason?: string,
    pickLocationUuid?: string
  ): Promise<{ ok: boolean; error?: string }> {
    const url = `${this.baseUrl}/products/${productUuid}/stock-mutation`
    try {
      const body = new URLSearchParams()
      body.append("mutation", mutation.toString())
      if (mutationReason) body.append("mutationReason", mutationReason)
      if (pickLocationUuid) body.append("pickLocationUuid", pickLocationUuid)

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
        cache: "no-store",
      })
      if (response.status === 200) return { ok: true }
      const text = await response.text()
      let errorMessage = `HTTP ${response.status}`
      try {
        const json = JSON.parse(text)
        if (json.errorMessage) errorMessage = json.errorMessage
        else if (json.message) errorMessage = json.message
      } catch {}
      console.error(`❌ Stock mutation failed for ${productUuid}: ${response.status} ${text}`)
      return { ok: false, error: errorMessage }
    } catch (error) {
      console.error("❌ Error stock mutation:", error)
      return { ok: false, error: String(error) }
    }
  }

  // Bewaar laatste paginatie info
  public lastPaginationInfo: {
    totalItems: number
    itemsPerPage: number
    currentPage: number
    lastPage: number
  } | null = null

  /**
   * Haal alle orders op met filters
   */
  async getOrders(filters?: {
    status?: string
    orderstatus?: string
    limit?: number
    offset?: number
    page?: number
    per_page?: number
    createdAfter?: string
  }): Promise<GoedGepicktOrder[]> {
    try {
      const params = new URLSearchParams()
      if (filters?.status) params.append("status", filters.status)
      if (filters?.orderstatus) params.append("orderstatus", filters.orderstatus)
      if (filters?.createdAfter) params.append("createdAfter", filters.createdAfter)
      
      // Probeer verschillende limit parameters
      if (filters?.limit) {
        params.append("limit", filters.limit.toString())
        params.append("per_page", filters.limit.toString())
      }
      if (filters?.offset) params.append("offset", filters.offset.toString())
      if (filters?.page) params.append("page", filters.page.toString())

      const url = `${this.baseUrl}/orders${params.toString() ? `?${params.toString()}` : ""}`
      console.log(`🔗 GET ${url}`)
      
      // Fetch met retry bij rate limiting (429)
      let response: Response | null = null
      for (let attempt = 0; attempt < 4; attempt++) {
        response = await fetch(url, {
          method: "GET",
          headers: this.getHeaders(),
          cache: "no-store",
        })
        if (response.status !== 429) break
        const waitMs = Math.min(2000 * Math.pow(2, attempt), 10000)
        console.log(`⏳ Rate limited (429), wacht ${waitMs}ms... (poging ${attempt + 1}/4)`)
        await new Promise(resolve => setTimeout(resolve, waitMs))
      }
      if (!response) return []

      console.log(`📡 Response status: ${response.status}`)

      if (response.status === 200) {
        const data = await response.json()
        console.log(`📦 Response data type: ${Array.isArray(data) ? 'array' : typeof data}`)
        
        // Log pagination info if available
        if (data.pageInfo) {
          console.log(`📄 Pagination:`, data.pageInfo)
          this.lastPaginationInfo = data.pageInfo
        }
        
        // De API kan verschillende structuren teruggeven
        if (Array.isArray(data)) {
          console.log(`✅ Returning ${data.length} orders (direct array)`)
          return data
        } else if (data.items && Array.isArray(data.items)) {
          console.log(`✅ Returning ${data.items.length} orders (from data.items)`)
          return data.items
        } else if (data.orders && Array.isArray(data.orders)) {
          console.log(`✅ Returning ${data.orders.length} orders (from data.orders)`)
          return data.orders
        } else if (data.data && Array.isArray(data.data)) {
          console.log(`✅ Returning ${data.data.length} orders (from data.data)`)
          return data.data
        } else {
          console.log("⚠️  Response structure not recognized:", Object.keys(data))
          console.log("Full response sample:", JSON.stringify(data).substring(0, 200))
        }
        return []
      } else if (response.status === 401) {
        console.error("❌ GoedGepickt authentication failed - check API key")
        return []
      } else {
        console.error(`❌ GoedGepickt API error: ${response.status}`)
        const text = await response.text()
        console.error("Response:", text.substring(0, 500))
        return []
      }
    } catch (error) {
      console.error("❌ Error fetching orders:", error)
      return []
    }
  }
}

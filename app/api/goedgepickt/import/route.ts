import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

/**
 * POST /api/goedgepickt/import
 * Importeer een order uit GoedGepickt en maak printjobs
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { orderUuid } = body

    if (!orderUuid) {
      return NextResponse.json(
        { error: "orderUuid is required" },
        { status: 400 }
      )
    }

    // Haal API key op
    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })

    if (!apiKeySetting || !apiKeySetting.value) {
      return NextResponse.json(
        { error: "GoedGepickt API key not configured" },
        { status: 400 }
      )
    }

    // Initialiseer API client
    const api = new GoedGepicktAPI(apiKeySetting.value)

    // Haal order op
    console.log(`📦 Importing order ${orderUuid} from GoedGepickt...`)
    const order = await api.getOrder(orderUuid)

    if (!order) {
      return NextResponse.json(
        { error: "Order not found in GoedGepickt" },
        { status: 404 }
      )
    }

    // Check of deze order al geïmporteerd is
    const existingJobs = await prisma.printJob.findMany({
      where: { orderUuid },
    })

    if (existingJobs.length > 0) {
      return NextResponse.json(
        {
          error: "Order already imported",
          existingJobs: existingJobs.length,
        },
        { status: 400 }
      )
    }

    const createdJobs = []

    // Maak een printjob voor elk product in de order
    if (order.products && order.products.length > 0) {
      for (const product of order.products) {
        // Skip parent products (alleen children importeren)
        if (product.type === "parent") {
          continue
        }

                // Bepaal of product in backorder is en haal supplierSku op
        let isBackorder = false
        let supplierSku: string | null = null
        
        if (product.productUuid) {
          try {
            const productDetails = await api.getProduct(product.productUuid)
            if (productDetails) {
              // Haal supplierSku op
              if (productDetails.supplier?.supplierSku) {
                supplierSku = productDetails.supplier.supplierSku
              } else if (productDetails.supplierSku) {
                supplierSku = productDetails.supplierSku
              }
              
              // Check voorraad
              if (productDetails.stock) {
                const freeStock = productDetails.stock.freeStock || 0
                isBackorder = freeStock < 0
              }
            }
          } catch (error) {
            console.warn(`⚠️  Kon product details niet ophalen voor ${product.productUuid}`)
          }
        }

        // Bepaal priority op basis van tags
        let priority = "normal"
        if (order.tags && Array.isArray(order.tags) && order.tags.length > 0) {
          const tagsLower = order.tags
            .filter((t: any) => typeof t === 'string')
            .map((t: string) => t.toLowerCase())
          
          if (tagsLower.includes("urgent") || tagsLower.includes("spoed")) {
            priority = "urgent"
          } else if (tagsLower.includes("high") || tagsLower.includes("hoog")) {
            priority = "high"
          }
        }

        // Maak printjob
        const printJob = await prisma.printJob.create({
          data: {
            orderUuid: order.uuid || orderUuid,
            orderNumber: order.externalDisplayId || order.orderNumber || orderUuid,
            productUuid: product.productUuid,
            productName: product.productName || "Onbekend product",
            sku: product.sku,
            backfile: supplierSku,
            quantity: product.productQuantity || 1,
            pickedQuantity: product.pickedQuantity || 0,
            priority,
            tags: order.tags && Array.isArray(order.tags)
              ? order.tags.filter((t: any) => typeof t === 'string').join(", ")
              : null,
            customerName: order.customer?.name || order.customerName,
            notes: order.notes,
            status: "pending",
            backorder: isBackorder,
            webhookData: JSON.stringify(
              { order, product },
              null,
              2
            ),
          },
        })

        createdJobs.push(printJob)
      }
    }

    console.log(`✅ Created ${createdJobs.length} printjobs for order ${orderUuid}`)

    return NextResponse.json({
      success: true,
      message: `Created ${createdJobs.length} printjobs`,
      order: {
        uuid: order.uuid,
        orderNumber: order.orderNumber,
        products: createdJobs.length,
      },
      printJobs: createdJobs.map((job) => ({
        id: job.id,
        productName: job.productName,
        quantity: job.quantity,
        priority: job.priority,
        backorder: job.backorder,
      })),
    })
  } catch (error: any) {
    console.error("❌ Import error:", error)
    return NextResponse.json(
      { error: error.message || "Error importing order" },
      { status: 500 }
    )
  }
}

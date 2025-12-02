import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"
import { webhookLogger } from "@/lib/webhook-logger"

/**
 * Webhook endpoint voor GoedeGepickt
 * Ontvangt orderUuid en haalt volledige order data op
 */

// Helper functie om te checken of een printjob uitgesloten moet worden
async function shouldExclude(
  sku: string | null, 
  orderNumber: string, 
  customerName: string | null
): Promise<{ excluded: boolean; reason?: string }> {
  // Haal actieve exclusion regels op
  const exclusionRules = await prisma.exclusionRule.findMany({
    where: { active: true }
  })

  for (const rule of exclusionRules) {
    let matches = false
    let fieldValue: string | null = null

    // Bepaal welk veld te checken
    switch (rule.field) {
      case "sku":
        fieldValue = sku
        break
      case "orderNumber":
        fieldValue = orderNumber
        break
      case "customerName":
        fieldValue = customerName
        break
    }

    if (!fieldValue) continue

    // Pas conditie toe
    switch (rule.condition) {
      case "starts_with":
        matches = fieldValue.startsWith(rule.value)
        break
      case "ends_with":
        matches = fieldValue.endsWith(rule.value)
        break
      case "contains":
        matches = fieldValue.includes(rule.value)
        break
      case "equals":
        matches = fieldValue === rule.value
        break
    }

    if (matches) {
      console.log(`   ⛔ Exclusion match: ${rule.field} ${rule.condition} "${rule.value}"${rule.reason ? ` (${rule.reason})` : ''}`)
      return { excluded: true, reason: rule.reason || undefined }
    }
  }

  return { excluded: false }
}

// Helper functie om tags toe te kennen op basis van tag regels
async function applyTagRules(sku: string | null, existingTags: string | null): Promise<string> {
  if (!sku) return existingTags || ""

  // Haal actieve tag regels op
  const tagRules = await prisma.tagRule.findMany({
    where: { 
      active: true,
      field: "sku" // Alleen SKU regels voor nu
    }
  })

  const appliedTags: string[] = []
  
  // Voeg bestaande tags toe
  if (existingTags) {
    appliedTags.push(...existingTags.split(",").map(t => t.trim()).filter(t => t))
  }

  // Pas elke regel toe
  for (const rule of tagRules) {
    let matches = false

    switch (rule.condition) {
      case "starts_with":
        matches = sku.startsWith(rule.value)
        break
      case "ends_with":
        matches = sku.endsWith(rule.value)
        break
      case "contains":
        matches = sku.includes(rule.value)
        break
      case "equals":
        matches = sku === rule.value
        break
    }

    if (matches && !appliedTags.includes(rule.tag)) {
      appliedTags.push(rule.tag)
      console.log(`   🏷️  Tag toegepast: "${rule.tag}" (SKU ${rule.condition} "${rule.value}")`)
    }
  }

  return appliedTags.join(", ")
}

// GET endpoint voor webhook info
export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: "GoedeGepickt Webhook Endpoint",
    status: "active",
    usage: "POST naar deze URL met { orderUuid: '...' }",
    documentation: "Zie WEBHOOK-SETUP.md voor meer informatie",
  })
}

// POST endpoint voor webhook data
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const body = await request.json()
    
    console.log("📥 Webhook ontvangen:", JSON.stringify(body, null, 2))
    
    // Check voor event type (voor status updates)
    const webhookEvent = body.event
    if (webhookEvent) {
      console.log(`📢 Webhook event: ${webhookEvent}`)
    }

    // Extract orderUuid (verschillende mogelijke veldnamen)
    const orderUuid = 
      body.orderUuid || 
      body.order_uuid || 
      body.uuid ||
      body.orderId ||
      body.order_id

    if (!orderUuid) {
      console.error("❌ Geen orderUuid gevonden in webhook")
      
      // Log to debug system
      webhookLogger.log(undefined, undefined, body)
      
      return NextResponse.json(
        { 
          success: false,
          error: "orderUuid is verplicht",
          receivedFields: Object.keys(body)
        },
        { status: 400 }
      )
    }
    
    // Check debug mode setting
    const debugModeSetting = await prisma.setting.findUnique({
      where: { key: "webhook_debug_mode" }
    })
    const debugMode = debugModeSetting?.value === "true"

    // Check of deze order al eerder is geïmporteerd
    const existingJobs = await prisma.printJob.findMany({
      where: { orderUuid },
    })

    // Haal API key op uit settings
    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })

    if (!apiKeySetting || !apiKeySetting.value) {
      console.error("❌ GoedGepickt API key niet geconfigureerd")
      return NextResponse.json(
        { 
          success: false,
          error: "GoedGepickt API key niet geconfigureerd in settings"
        },
        { status: 500 }
      )
    }

    // Initialiseer GoedGepickt API client
    const api = new GoedGepicktAPI(apiKeySetting.value)

    // Haal volledige order data op
    console.log(`📦 Order ${orderUuid} ophalen uit GoedGepickt...`)
    const order = await api.getOrder(orderUuid)

    if (!order) {
      console.error(`❌ Order ${orderUuid} niet gevonden in GoedGepickt`)
      
      // Log to debug system if enabled
      if (debugMode) {
        webhookLogger.log(orderUuid, undefined, body)
      }
      
      return NextResponse.json(
        { 
          success: false,
          error: "Order niet gevonden in GoedGepickt of API error"
        },
        { status: 404 }
      )
    }

    // Extract order status from order data or event
    let orderStatus = order.status || body.status || null
    
    // Map webhook event naar status als geen expliciete status
    if (!orderStatus && webhookEvent) {
      const eventToStatus: Record<string, string> = {
        'orderCompleted': 'completed',
        'orderCancelled': 'cancelled',
        'orderShipped': 'shipped',
        'orderPicked': 'picked',
        'orderPacking': 'packing',
        'orderProcessing': 'processing'
      }
      orderStatus = eventToStatus[webhookEvent] || null
      if (orderStatus) {
        console.log(`📊 Status afgeleid van event '${webhookEvent}': ${orderStatus}`)
      }
    }
    
    console.log(`📊 Order status: ${orderStatus}`)
    
    // Log to debug system if enabled
    if (debugMode) {
      webhookLogger.log(orderUuid, orderStatus || undefined, body)
    }

    // Check of we bestaande printjobs moeten updaten met nieuwe order status
    if (existingJobs.length > 0) {
      console.log(`📋 Order ${orderUuid} bestaat al met ${existingJobs.length} printjobs`)
      let updatedJobs = 0
      
      if (orderStatus) {
        // Check of de status is veranderd
        const jobsWithDifferentStatus = existingJobs.filter(job => job.orderStatus !== orderStatus)
        
        if (jobsWithDifferentStatus.length > 0) {
          console.log(`🔄 Updating order status voor ${jobsWithDifferentStatus.length} printjobs: ${jobsWithDifferentStatus[0].orderStatus || 'null'} → ${orderStatus}`)
          
          // Update alle printjobs van deze order met nieuwe status
          const updateResult = await prisma.printJob.updateMany({
            where: { orderUuid },
            data: { orderStatus }
          })
          
          updatedJobs = updateResult.count
          console.log(`✅ ${updatedJobs} printjobs ge-update naar status: ${orderStatus}`)
        } else {
          console.log(`ℹ️  Alle printjobs hebben al status: ${orderStatus}`)
        }
      }

      console.log(`⚠️  Order ${orderUuid} was al geïmporteerd (${existingJobs.length} printjobs)${updatedJobs > 0 ? `, ${updatedJobs} printjobs ge-updated met nieuwe status` : ''}`)
      
      return NextResponse.json({
        success: true,
        message: existingJobs.length > 0 ? (updatedJobs > 0 ? "Order status updated" : "Order was al geïmporteerd") : "Order imported",
        duplicate: existingJobs.length > 0,
        existingJobs: existingJobs.length,
        updatedJobs,
        orderStatus,
        event: webhookEvent,
        orderStatus,
        printJobs: existingJobs.map(job => ({
          id: job.id,
          productName: job.productName,
          status: job.status,
          orderStatus: updatedJobs > 0 ? orderStatus : job.orderStatus,
        }))
      }, { status: 200 })
    }

    const createdJobs = []

    // Maak een printjob voor elk product in de order
    if (order.products && order.products.length > 0) {
      console.log(`📦 Order bevat ${order.products.length} producten`)

      for (const product of order.products) {
        // Skip parent products (alleen children importeren bij bundle products)
        if (product.type === "parent") {
          console.log(`⏭️  Skip parent product: ${product.productName}`)
          continue
        }

        console.log(`📝 Verwerk product: ${product.productName} (${product.sku || "geen SKU"})`)

        // Haal product details op voor voorraad info en supplierSku
        let isBackorder = false
        let supplierSku: string | null = null
        
        if (product.productUuid) {
          try {
            const productDetails = await api.getProduct(product.productUuid)
            if (productDetails) {
              // Haal supplierSku op
              if (productDetails.supplier?.supplierSku) {
                supplierSku = productDetails.supplier.supplierSku
                console.log(`   📦 Backfile (supplierSku): ${supplierSku}`)
              } else if (productDetails.supplierSku) {
                supplierSku = productDetails.supplierSku
                console.log(`   📦 Backfile (supplierSku): ${supplierSku}`)
              }
              
              // Check voorraad
              if (productDetails.stock) {
                const freeStock = productDetails.stock.freeStock || 0
                isBackorder = freeStock < 0
                console.log(`   📊 Voorraad: ${freeStock} (backorder: ${isBackorder})`)
              }
            }
          } catch (error) {
            console.warn(`⚠️  Kon product details niet ophalen voor ${product.productUuid}`)
          }
        }

        // Bepaal priority op basis van tags
        let priority = "normal"
        const orderTagsArray: string[] = []
        
        if (order.tags && Array.isArray(order.tags) && order.tags.length > 0) {
          const tagsLower = order.tags
            .filter((t: any) => typeof t === 'string')
            .map((t: string) => t.toLowerCase())
          
          orderTagsArray.push(...order.tags.filter((t: any) => typeof t === 'string'))
          
          if (tagsLower.includes("urgent") || tagsLower.includes("spoed")) {
            priority = "urgent"
          } else if (tagsLower.includes("high") || tagsLower.includes("hoog")) {
            priority = "high"
          } else if (tagsLower.includes("low") || tagsLower.includes("laag")) {
            priority = "low"
          }
          console.log(`   🏷️  Order tags: ${order.tags.join(", ")} → Priority: ${priority}`)
        }

        // Pas tag regels toe op basis van SKU
        const finalTags = await applyTagRules(
          product.sku ?? null, 
          orderTagsArray.length > 0 ? orderTagsArray.join(", ") : null
        )

        // Check of deze printjob uitgesloten moet worden
        const exclusionCheck = await shouldExclude(
          product.sku ?? null,
          order.externalDisplayId || order.orderNumber || orderUuid,
          order.customerName || null
        )

        if (exclusionCheck.excluded) {
          console.log(`   ⛔ Printjob UITGESLOTEN${exclusionCheck.reason ? `: ${exclusionCheck.reason}` : ''}`)
          continue // Skip deze printjob
        }

        // Maak printjob aan
        const printJob = await prisma.printJob.create({
          data: {
            orderUuid: order.uuid || orderUuid,
            orderNumber: order.externalDisplayId || order.orderNumber || orderUuid,
            productUuid: product.productUuid,
            productName: product.productName || "Onbekend product",
            sku: product.sku ?? null,
            backfile: supplierSku,
            quantity: product.productQuantity || 1,
            pickedQuantity: product.pickedQuantity || 0,
            priority,
            tags: finalTags || null,
            orderStatus,
            customerName: order.customer?.name || order.customerName,
            notes: order.notes,
            status: "pending",
            backorder: isBackorder,
            webhookData: JSON.stringify(
              { 
                order, 
                product,
                importedAt: new Date().toISOString(),
                webhookPayload: body
              },
              null,
              2
            ),
          },
        })

        createdJobs.push(printJob)
        console.log(`   ✅ PrintJob aangemaakt: ${printJob.id}`)
      }
    } else {
      console.warn("⚠️  Order bevat geen producten")
      return NextResponse.json(
        { 
          success: false,
          error: "Order bevat geen producten om te importeren"
        },
        { status: 400 }
      )
    }

    const processingTime = Date.now() - startTime

    console.log(`✅ Webhook verwerkt: ${createdJobs.length} printjobs aangemaakt in ${processingTime}ms`)

    return NextResponse.json({
      success: true,
      message: `${createdJobs.length} printjob(s) succesvol aangemaakt`,
      order: {
        uuid: order.uuid,
        orderNumber: order.orderNumber,
        customerName: order.customer?.name || order.customerName,
        productsImported: createdJobs.length,
      },
      printJobs: createdJobs.map((job) => ({
        id: job.id,
        productName: job.productName,
        sku: job.sku,
        quantity: job.quantity,
        priority: job.priority,
        backorder: job.backorder,
        status: job.status,
      })),
      processingTime: `${processingTime}ms`
    }, { status: 201 })

  } catch (error: any) {
    const processingTime = Date.now() - startTime
    
    console.error("❌ Webhook fout:", error)
    console.error("Stack trace:", error.stack)

    return NextResponse.json(
      { 
        success: false,
        error: "Er is een fout opgetreden bij het verwerken van de webhook",
        message: error.message,
        processingTime: `${processingTime}ms`
      },
      { status: 500 }
    )
  }
}

// OPTIONS voor CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

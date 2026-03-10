/**
 * Diagnose script: zoek specifieke orders op in GoedGepickt API
 * en analyseer waarom ze niet in de printjobs terechtkomen.
 *
 * Gebruik:
 *   npx tsx scripts/diagnose-missing-orders.ts FR70912 WN210764 WF192142 WF192154 WN210823
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const GG_BASE = "https://account.goedgepickt.nl/api/v1"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchGG(url: string, apiKey: string, retries = 3): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      cache: "no-store" as any,
    })
    if (res.status === 429) {
      const wait = 3000 * Math.pow(2, attempt)
      console.log(`  ⏳ Rate limited, wacht ${wait}ms...`)
      await sleep(wait)
      continue
    }
    if (res.status !== 200) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`)
    }
    return res.json()
  }
  throw new Error("Too many retries (rate limit)")
}

async function main() {
  const orderNumbers = process.argv.slice(2)
  if (orderNumbers.length === 0) {
    console.log("Gebruik: npx tsx scripts/diagnose-missing-orders.ts FR70912 WN210764 ...")
    process.exit(1)
  }

  console.log(`\n🔍 Diagnose voor ${orderNumbers.length} orders: ${orderNumbers.join(", ")}\n`)

  // Haal API key op
  const apiKeySetting = await prisma.setting.findUnique({
    where: { key: "goedgepickt_api_key" },
  })
  if (!apiKeySetting?.value) {
    console.error("❌ Geen GoedGepickt API key gevonden in database!")
    process.exit(1)
  }
  const apiKey = apiKeySetting.value
  console.log("✅ API key gevonden\n")

  // Haal exclusion rules op
  const exclusionRules = await prisma.exclusionRule.findMany({ where: { active: true } })
  console.log(`📋 ${exclusionRules.length} actieve exclusion rules gevonden`)
  for (const rule of exclusionRules) {
    console.log(`   - ${rule.field} ${rule.condition} "${rule.value}"`)
  }
  console.log()

  // === STAP 1: Check of orders al in database staan ===
  console.log("═══════════════════════════════════════════════════════════")
  console.log("STAP 1: Database check — staan ze al in printjobs?")
  console.log("═══════════════════════════════════════════════════════════\n")

  for (const orderNum of orderNumbers) {
    const jobs = await prisma.printJob.findMany({
      where: { orderNumber: orderNum },
      select: {
        id: true,
        orderNumber: true,
        orderUuid: true,
        productName: true,
        sku: true,
        printStatus: true,
        orderStatus: true,
        backorder: true,
        receivedAt: true,
        completedAt: true,
        pickedQuantity: true,
        quantity: true,
      },
    })

    if (jobs.length === 0) {
      console.log(`❌ ${orderNum}: NIET in database`)
    } else {
      console.log(`✅ ${orderNum}: ${jobs.length} printjob(s) gevonden`)
      for (const job of jobs) {
        console.log(`   - Status: ${job.printStatus} | OrderStatus: ${job.orderStatus} | SKU: ${job.sku}`)
        console.log(`     Product: ${job.productName} | Qty: ${job.quantity} | Picked: ${job.pickedQuantity}`)
        console.log(`     Backorder: ${job.backorder} | Ontvangen: ${job.receivedAt?.toISOString()}`)
      }
    }
  }

  // === STAP 2: Zoek orders in GoedGepickt API ===
  console.log("\n═══════════════════════════════════════════════════════════")
  console.log("STAP 2: GoedGepickt API — orders ophalen")
  console.log("═══════════════════════════════════════════════════════════\n")

  // Methode 1: Probeer per nummerveld te zoeken (sommige APIs ondersteunen dit)
  // Methode 2: Als dat niet werkt, haal ALLE orders op (ZONDER status filter!) en zoek client-side

  console.log("📡 Ophalen van ALLE orders (ZONDER statusfilter) van afgelopen 90 dagen...")
  console.log("   (Dit kan even duren bij veel orders...)\n")

  const createdAfter = new Date()
  createdAfter.setDate(createdAfter.getDate() - 90)
  const createdAfterStr = `${createdAfter.getFullYear()}-${String(createdAfter.getMonth() + 1).padStart(2, "0")}-${String(createdAfter.getDate()).padStart(2, "0")}`

  // Haal alle orders op ZONDER orderstatus filter
  const allOrders: any[] = []
  let page = 1
  let lastPage = 1
  let totalFetched = 0

  while (page <= lastPage && page <= 100) {
    const url = `${GG_BASE}/orders?createdAfter=${createdAfterStr}&page=${page}`
    process.stdout.write(`  Pagina ${page}/${lastPage}...`)

    try {
      const data = await fetchGG(url, apiKey)

      if (data.pageInfo) {
        lastPage = data.pageInfo.lastPage || 1
      }

      const items = data.items || data.data || data.orders || (Array.isArray(data) ? data : [])
      allOrders.push(...items)
      totalFetched += items.length
      console.log(` ${items.length} orders (totaal: ${totalFetched})`)

      if (items.length === 0) break
      if (page < lastPage) await sleep(500)
      page++
    } catch (err: any) {
      console.log(` ❌ Fout: ${err.message}`)
      break
    }
  }

  console.log(`\n📊 Totaal ${allOrders.length} orders opgehaald uit GoedGepickt (alle statussen)\n`)

  // Zoek de specifieke orders
  const orderNumberSet = new Set(orderNumbers.map((n) => n.toUpperCase()))

  // Kijk naar verschillende velden waar het ordernummer kan staan
  const foundOrders: any[] = []
  for (const order of allOrders) {
    const possibleNumbers = [
      order.externalDisplayId,
      order.orderNumber,
      order.order_number,
      order.externalId,
      order.external_id,
    ].filter(Boolean).map((n: string) => n.toUpperCase())

    if (possibleNumbers.some((n) => orderNumberSet.has(n))) {
      foundOrders.push(order)
    }
  }

  // === STAP 3: Analyseer elke order ===
  console.log("═══════════════════════════════════════════════════════════")
  console.log("STAP 3: Analyse per order")
  console.log("═══════════════════════════════════════════════════════════\n")

  // Track welke ordernummers we gevonden/niet gevonden hebben
  const foundNumbers = new Set<string>()

  for (const order of foundOrders) {
    const orderNum = order.externalDisplayId || order.orderNumber || "?"
    foundNumbers.add(orderNum.toUpperCase())

    console.log(`\n┌─────────────────────────────────────────────────────`)
    console.log(`│ ORDER: ${orderNum}`)
    console.log(`│ UUID:  ${order.uuid || "?"}`)
    console.log(`│ Status: ${order.status || "?"}`)
    console.log(`│ Aangemaakt: ${order.createDate || order.createdAt || "?"}`)
    console.log(`│ Klant: ${order.customer?.name || order.customerName || "?"}`)
    console.log(`│ Tags: ${JSON.stringify(order.tags || [])}`)
    console.log(`├─────────────────────────────────────────────────────`)

    // Check waarom het NIET geïmporteerd zou worden:
    const reasons: string[] = []

    // Reden 1: Status is niet "backorder"
    if (order.status !== "backorder") {
      reasons.push(`⚠️  Status is "${order.status}" — sync haalt alleen "backorder" op!`)
    }

    // Reden 2: Geen producten
    if (!order.products || order.products.length === 0) {
      reasons.push(`⚠️  Order heeft GEEN producten!`)
    }

    // Producten analyseren
    if (order.products && order.products.length > 0) {
      console.log(`│ Producten (${order.products.length}):`)
      for (const product of order.products) {
        const picked = product.pickedQuantity || 0
        const qty = product.productQuantity || 1
        const isPicked = picked >= qty
        const isParent = product.type === "parent"

        console.log(`│   - ${product.productName || "?"}`)
        console.log(`│     SKU: ${product.sku || "?"} | Type: ${product.type || "normal"}`)
        console.log(`│     Qty: ${qty} | Picked: ${picked} ${isPicked ? "⚠️ VOLLEDIG GEPICKT" : "✅"}`)
        console.log(`│     ProductUUID: ${product.productUuid || "?"}`)

        if (isParent) {
          reasons.push(`⚠️  Product "${product.productName}" is type=parent → wordt overgeslagen`)
        }
        if (isPicked) {
          reasons.push(`⚠️  Product "${product.productName}" is al gepickt (${picked}/${qty}) → wordt overgeslagen`)
        }

        // Check exclusion rules
        for (const rule of exclusionRules) {
          let val = ""
          if (rule.field === "sku") val = product.sku || ""
          else if (rule.field === "orderNumber") val = orderNum
          else if (rule.field === "customerName") val = order.customerName || order.customer?.name || ""
          else if (rule.field === "orderStatus") val = order.status || ""

          if (checkCondition(val, rule.condition, rule.value)) {
            reasons.push(`⚠️  ExclusionRule match: ${rule.field} ${rule.condition} "${rule.value}" → product "${product.productName}" zou worden uitgesloten`)
          }
        }

        // Check dedup: staat dit product al in DB?
        if (order.uuid && product.productUuid) {
          const existingJob = await prisma.printJob.findFirst({
            where: {
              orderUuid: order.uuid,
              OR: [
                { productUuid: product.productUuid },
                { sku: product.sku || undefined },
                { productName: product.productName || undefined },
              ],
            },
            select: { id: true, printStatus: true, orderNumber: true },
          })
          if (existingJob) {
            reasons.push(`⚠️  Product staat AL in database als ${existingJob.printStatus} (job ID: ${existingJob.id})`)
          }
        }
      }
    }

    // Check of createDate binnen 30-dagen lookback valt
    if (order.createDate) {
      const orderDate = new Date(order.createDate)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      if (orderDate < thirtyDaysAgo) {
        reasons.push(`⚠️  Order is ouder dan 30 dagen (${order.createDate}) — normale sync kijkt maar 30 dagen terug!`)
      }
    }

    console.log(`├─────────────────────────────────────────────────────`)
    if (reasons.length === 0) {
      console.log(`│ ✅ GEEN REDEN GEVONDEN — deze order zou geïmporteerd moeten worden!`)
      console.log(`│    Mogelijk een timing-issue of race-condition bij sync.`)
    } else {
      console.log(`│ 🚨 REDENEN WAAROM DEZE ORDER NIET GEÏMPORTEERD WORDT:`)
      for (const reason of reasons) {
        console.log(`│    ${reason}`)
      }
    }
    console.log(`└─────────────────────────────────────────────────────`)
  }

  // Niet gevonden orders
  for (const orderNum of orderNumbers) {
    if (!foundNumbers.has(orderNum.toUpperCase())) {
      console.log(`\n┌─────────────────────────────────────────────────────`)
      console.log(`│ ORDER: ${orderNum}`)
      console.log(`│ 🚨 NIET GEVONDEN in GoedGepickt (afgelopen 90 dagen)`)
      console.log(`│    Mogelijke redenen:`)
      console.log(`│    - Order is ouder dan 90 dagen`)
      console.log(`│    - Ordernummer klopt niet`)
      console.log(`│    - Order is verwijderd in GoedGepickt`)
      console.log(`└─────────────────────────────────────────────────────`)
    }
  }

  // === SAMENVATTING ===
  console.log("\n═══════════════════════════════════════════════════════════")
  console.log("SAMENVATTING")
  console.log("═══════════════════════════════════════════════════════════\n")

  // Toon status-verdeling van ALLE opgehaalde orders
  const statusCounts: Record<string, number> = {}
  for (const order of allOrders) {
    const s = order.status || "unknown"
    statusCounts[s] = (statusCounts[s] || 0) + 1
  }
  console.log("Status-verdeling ALLE orders (afgelopen 90 dagen):")
  for (const [status, count] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status}: ${count} orders ${status === "backorder" ? "← alleen deze worden gesyncet!" : ""}`)
  }

  console.log(`\nGezochte orders: ${orderNumbers.length}`)
  console.log(`Gevonden in GG:  ${foundOrders.length}`)
  console.log(`Niet gevonden:   ${orderNumbers.length - foundOrders.length}`)

  await prisma.$disconnect()
}

function checkCondition(fieldValue: string, condition: string, ruleValue: string): boolean {
  const a = fieldValue.toLowerCase()
  const b = ruleValue.toLowerCase()
  switch (condition) {
    case "equals": return a === b
    case "starts_with": return a.startsWith(b)
    case "ends_with": return a.endsWith(b)
    case "contains": return a.includes(b)
    default: return false
  }
}

main().catch((err) => {
  console.error("❌ Script error:", err)
  prisma.$disconnect()
  process.exit(1)
})

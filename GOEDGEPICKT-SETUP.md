# 🚀 GoedGepickt Integratie - Setup Guide

## 📋 Overzicht

De PrintLijst app is nu volledig geïntegreerd met GoedGepickt WMS. Orders worden automatisch geïmporteerd als printjobs wanneer GoedeGepickt een webhook stuurt.

## 🔧 Stap 1: API Key Configureren

### In de App:
1. Log in als admin op http://localhost:3000/admin
2. Ga naar **Settings** → **Integraties**
3. Scroll naar **GoedeGepickt WMS**
4. Plak je API key (te vinden in GoedeGepickt onder Instellingen → GoedGepickt API)
5. Klik op **API Key Opslaan**
6. Klik op **Test Connectie** om te verifiëren dat de key werkt

### In GoedeGepickt:
1. Log in op https://account.goedgepickt.nl
2. Ga naar **Instellingen** → **GoedGepickt API**
3. Klik op **Nieuwe API key genereren**
4. Kopieer de key en bewaar deze veilig

## 📨 Stap 2: Webhook Configureren (Later)

⚠️ **Voor nu skippen we dit stap - webhooks ontvangen doen we later**

Wanneer je klaar bent om webhooks te ontvangen:

1. Ga in GoedeGepickt naar **Instellingen** → **Webhooks**
2. Klik op **Nieuwe webhook toevoegen**
3. Configureer:
   - **URL**: `https://jouw-domein.com/api/webhook`
   - **Event**: Order Created / Order Fulfilled
   - **Method**: POST
   - **Content-Type**: application/json

## 🧪 Stap 3: Testen

### Test 1: API Verbinding Testen
```bash
# In de app: Settings → Integraties → Test Connectie
```

### Test 2: Handmatig Order Importeren
```bash
# Gebruik de GoedGepickt API om een order te importeren
curl -X POST http://localhost:3000/api/goedgepickt/import \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{
    "orderUuid": "802b2103-9695-41ff-a7a2-60fe6b87e466"
  }'
```

### Test 3: Webhook Simuleren
```bash
# Simuleer een webhook van GoedeGepickt
curl -X POST http://localhost:3000/api/webhook/test \
  -H "Content-Type: application/json" \
  -d '{
    "orderUuid": "802b2103-9695-41ff-a7a2-60fe6b87e466"
  }'
```

### Test 4: Direct Webhook Testen
```bash
# Stuur direct een orderUuid naar de webhook
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "orderUuid": "802b2103-9695-41ff-a7a2-60fe6b87e466"
  }'
```

## 📊 Wat Gebeurt Er?

### 1. Webhook Ontvangst
- GoedeGepickt stuurt een `orderUuid` naar `/api/webhook`
- Webhook endpoint valideert de data

### 2. Order Ophalen
- Met de opgeslagen API key wordt de volledige order opgehaald
- Endpoint: `GET /api/v1/orders/{orderUuid}`

### 3. Printjobs Aanmaken
Voor elk product in de order wordt een aparte printjob aangemaakt met:
- ✅ Order UUID en nummer
- ✅ Product naam en SKU
- ✅ Hoeveelheid (besteld + gepickt)
- ✅ Priority (bepaald via tags)
- ✅ Backorder status (via voorraad check)
- ✅ Klant informatie
- ✅ Tags en notities
- ✅ Volledige order data (in `webhookData` veld)

### 4. Dashboard Update
- Nieuwe printjobs verschijnen direct in het admin dashboard
- Status: **pending**
- Medewerkers kunnen ze claimen en afhandelen

## 🗄️ Database Velden

### PrintJob Model
```prisma
model PrintJob {
  id              String    @id
  orderUuid       String?   // GoedeGepickt order UUID
  orderNumber     String    // Order nummer
  productUuid     String?   // GoedeGepickt product UUID
  productName     String    // Product naam
  sku             String?   // Product SKU
  quantity        Int       // Bestelde hoeveelheid
  pickedQuantity  Int?      // Gepickte hoeveelheid
  priority        String    // low/normal/high/urgent
  tags            String?   // Comma-separated tags
  customerName    String?   // Naam van klant
  notes           String?   // Extra notities
  status          String    // pending/in_progress/completed
  backorder       Boolean   // Of product in backorder is
  webhookData     String?   // Volledige JSON backup
  // ... timestamps en relaties
}
```

### Settings Model
```prisma
model Settings {
  id        String   @id
  key       String   @unique
  value     String
  // ... timestamps
}
```

## 🔐 Beveiliging

### API Key
- API key wordt veilig opgeslagen in database (Settings tabel)
- Alleen admins kunnen de key bekijken en wijzigen
- Key wordt gebruikt voor alle GoedGepickt API calls

### Webhook Authenticatie
Voor productie kun je webhook authenticatie toevoegen:
```typescript
// In webhook route.ts
const authHeader = request.headers.get("authorization")
if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

## 📖 API Endpoints

### `/api/settings`
- **GET**: Haal alle settings op
- **POST**: Sla een setting op
- **DELETE**: Verwijder een setting

### `/api/goedgepickt/order/[uuid]`
- **GET**: Haal een order op uit GoedeGepickt

### `/api/goedgepickt/import`
- **POST**: Importeer een order handmatig

### `/api/goedgepickt/test`
- **POST**: Test de API connectie

### `/api/webhook`
- **GET**: Webhook info
- **POST**: Ontvang order UUID, importeer automatisch
- **OPTIONS**: CORS support

### `/api/webhook/test`
- **GET**: Test endpoint info
- **POST**: Simuleer webhook

## 🐛 Troubleshooting

### "GoedGepickt API key not configured"
➡️ Ga naar Settings → Integraties en sla je API key op

### "Order not found in GoedGepickt"
➡️ Controleer of de orderUuid correct is
➡️ Check of je toegang hebt tot deze order in GoedeGepickt

### "Order already imported"
➡️ De order is al eerder geïmporteerd (duplicate check)
➡️ Bestaande printjobs worden geretourneerd

### Webhook wordt niet ontvangen
➡️ Check webhook configuratie in GoedeGepickt
➡️ Zorg dat je URL publiek toegankelijk is (gebruik ngrok voor development)
➡️ Check de GoedeGepickt webhook logs

## 📝 Development Logs

Alle webhook en import acties worden gelogd naar de console:
```
📥 Webhook ontvangen: {...}
📦 Order 802b2103... ophalen uit GoedGepickt...
📦 Order bevat 3 producten
📝 Verwerk product: T-Shirt Zwart (SKU-123)
   📊 Voorraad: 50 (backorder: false)
   🏷️  Tags: urgent, custom → Priority: urgent
   ✅ PrintJob aangemaakt: clxxx...
✅ Webhook verwerkt: 3 printjobs aangemaakt in 450ms
```

## 🎉 Klaar!

De integratie is nu compleet. Voor nu test je handmatig met de API endpoints. Later kun je de webhook configureren voor automatische import.

### Volgende Stappen:
1. ✅ API key opslaan in Settings
2. ✅ Test de connectie
3. ✅ Importeer een test order handmatig
4. 🔄 Later: Webhook configureren in GoedeGepickt

## 💡 Tips

- Gebruik de `webhookData` veld in de database om de originele order data te bekijken
- Check de console logs voor gedetailleerde import informatie
- Test eerst met een enkele order voordat je de webhook activeert
- Backorder status wordt automatisch bepaald op basis van voorraad
- Priority wordt automatisch bepaald op basis van order tags

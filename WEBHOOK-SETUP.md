# GoedeGepickt Webhook Setup

## 🎯 Doel
Deze documentatie helpt je om de GoedeGepickt webhook correct in te stellen zodat orders automatisch als printjobs in de applicatie komen.

## 📋 Stap 1: Webhook URL

Je webhook URL is:
```
https://jouw-domein.com/api/webhook
```

Voor lokale development (met ngrok of vergelijkbaar):
```
https://jouw-ngrok-url.ngrok.io/api/webhook
```

## 🔧 Stap 2: Webhook configureren in GoedeGepickt

1. Log in op je GoedeGepickt admin panel
2. Ga naar Settings > Integrations > Webhooks
3. Voeg een nieuwe webhook toe met de volgende settings:
   - **URL**: Jouw webhook URL (zie boven)
   - **Event**: Order Created / Order Fulfilled (afhankelijk van wanneer je de printjob wilt ontvangen)
   - **Method**: POST
   - **Content-Type**: application/json

## 📨 Verwachte Data Formaat

De webhook accepteert verschillende veldnamen. Dit zijn de belangrijkste:

### Verplichte velden (één van deze moet aanwezig zijn):
```json
{
  "orderNumber": "ORD-12345",      // of order_number, orderId, order_id
  "productName": "T-Shirt Zwart"   // of product_name, productSku, product_sku
}
```

### Optionele velden:
```json
{
  "quantity": 2,                    // of qty, amount (default: 1)
  "priority": "normal",             // low, normal, high, urgent (default: normal)
  "customerName": "Jan Jansen",     // of customer_name
  "notes": "Extra info",
  "express": false,                 // urgent flag
  "productSku": "SKU-123"
}
```

### Volledig voorbeeld:
```json
{
  "orderNumber": "ORD-12345",
  "productName": "T-Shirt Zwart - Maat L",
  "quantity": 3,
  "priority": "high",
  "customerName": "Jan Jansen",
  "productSku": "TSH-BLK-L",
  "notes": "Print op voorkant en achterkant"
}
```

## 🧪 Stap 3: Testen

### Test 1: Basis webhook info
```bash
curl http://localhost:3000/api/webhook
```

### Test 2: Test order versturen
```bash
curl -X POST http://localhost:3000/api/webhook/test
```

### Test 3: Handmatig order versturen
```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "orderNumber": "TEST-001",
    "productName": "T-Shirt Test",
    "quantity": 1,
    "priority": "normal"
  }'
```

## 📊 Response Formaten

### Succes (201 Created):
```json
{
  "success": true,
  "message": "PrintJob succesvol aangemaakt",
  "printJob": {
    "id": "clxxx...",
    "orderNumber": "ORD-12345",
    "productName": "T-Shirt Zwart",
    "quantity": 2,
    "priority": "normal",
    "status": "pending",
    "receivedAt": "2025-11-18T..."
  },
  "processingTime": "45ms"
}
```

### Duplicate (200 OK):
```json
{
  "success": true,
  "message": "Order bestaat al",
  "duplicate": true,
  "printJob": { ... }
}
```

### Error (400 Bad Request):
```json
{
  "success": false,
  "error": "OrderNumber is verplicht maar niet gevonden in de data",
  "receivedData": ["field1", "field2"]
}
```

## 🔍 Debugging

### Logs controleren
De webhook logt alle binnenkomende data. Check je terminal/console voor:
- 📥 Webhook ontvangen
- ✅ PrintJob aangemaakt
- ⚠️ Order bestaat al
- ❌ Fouten

### Webhook data bekijken
Elke printjob slaat de originele webhook data op in het `webhookData` veld. Je kunt deze bekijken in:
- Admin Dashboard > Recent Voltooid
- Database: `printJobs` tabel, `webhookData` kolom

## 🔐 Beveiliging (Optioneel)

Voor productie is het aan te raden om de webhook te beveiligen:

1. Voeg een secret token toe aan je `.env`:
```
WEBHOOK_SECRET=jouw-geheime-token-hier
```

2. Update de webhook route om de token te verifiëren:
```typescript
const authHeader = request.headers.get("authorization")
if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

3. Configureer in GoedeGepickt:
   - Header: `Authorization`
   - Value: `Bearer jouw-geheime-token-hier`

## 📞 Support

Als je problemen hebt met de webhook:

1. **Check de logs** - Kijk in de terminal voor foutmeldingen
2. **Test de endpoint** - Gebruik de `/api/webhook/test` endpoint
3. **Valideer de data** - Zorg dat GoedeGepickt de juiste velden stuurt
4. **Check de database** - Kijk of printjobs worden aangemaakt in de database

## 🎉 Klaar!

Als alles goed is ingesteld, zullen nieuwe orders van GoedeGepickt automatisch als printjobs in je dashboard verschijnen!

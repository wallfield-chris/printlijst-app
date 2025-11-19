# Printlijst APP V2

Een Next.js applicatie voor het beheren van printjobs met aparte interfaces voor werknemers en administrators.

## Functionaliteiten

### Voor Werknemers
- Inloggen met email en wachtwoord
- Overzicht van alle actieve printjobs (pending en in progress)
- Printjobs starten en als voltooid markeren
- Real-time weergave van nieuwe printjobs
- Prioriteitsindicatoren (urgent, high, normal, low)

### Voor Administrators  
- Inloggen met admin account
- Real-time dashboard met statistieken
- Auto-refresh elke 5 seconden
- Overzicht van alle actieve en voltooide jobs
- Prestatie monitoring per werknemer
- Gemiddelde verwerkingstijd per job
- Voltooide jobs vandaag met tijdsberekening

### Webhook
- `/api/webhook` endpoint voor het ontvangen van printjobs van GoedeGepickt
- Accepteert POST requests met JSON body
- Verwachte velden: `orderNumber`, `productName`, `quantity`, `priority`

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Authenticatie**: NextAuth.js
- **Database**: SQLite met Prisma ORM
- **Styling**: Tailwind CSS
- **TypeScript**: Voor type-safety

## Installatie

1. Installeer dependencies:
```bash
npm install
```

2. Database setup:
```bash
npx prisma generate
npx prisma db push
```

3. Seed de database met test data:
```bash
npx tsx prisma/seed.ts
```

4. Start de development server:
```bash
npm run dev
```

De applicatie is nu beschikbaar op http://localhost:3000

## Login Credentials

Na het seeden van de database zijn de volgende accounts beschikbaar:

**Admin Account:**
- Email: `admin@printlijst.nl`
- Wachtwoord: `admin123`

**Werknemer Accounts:**
- Email: `jan@printlijst.nl` / Wachtwoord: `werknemer123`
- Email: `marie@printlijst.nl` / Wachtwoord: `werknemer123`

## API Endpoints

### Authenticatie
- `POST /api/auth/signin` - Inloggen
- `POST /api/auth/signout` - Uitloggen

### Printjobs
- `GET /api/printjobs` - Alle printjobs ophalen (met optionele filters)
  - Query params: `status`, `userId`, `from`, `to`
- `PATCH /api/printjobs/[id]` - Printjob status updaten
  - Body: `{ status: "pending" | "in_progress" | "completed" }`

### Webhook
- `POST /api/webhook` - Nieuwe printjob toevoegen
  - Body: `{ orderNumber, productName, quantity?, priority? }`

### Statistieken (Admin only)
- `GET /api/stats` - Dashboard statistieken ophalen
  - Query params: `userId`, `from`, `to`

## Webhook Integratie met GoedeGepickt

Om printjobs automatisch van GoedeGepickt te ontvangen, configureer een webhook in je WMS systeem:

**Webhook URL:** `https://jouw-domein.nl/api/webhook`

**Method:** POST

**JSON Body Format:**
```json
{
  "orderNumber": "ORD-12345",
  "productName": "T-Shirt Zwart - Maat L",
  "quantity": 5,
  "priority": "normal"
}
```

**Priority opties:** `low`, `normal`, `high`, `urgent`

## Database Schema

### User
- id, email, password, name, role (admin/employee)

### PrintJob
- id, orderNumber, productName, quantity, priority, status
- receivedAt, startedAt, completedAt, completedBy
- webhookData (raw JSON van webhook)

### Session
- NextAuth sessie management

## Deployment

### Environment Variables

Zorg ervoor dat je de volgende environment variables configureert:

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_URL="https://jouw-domein.nl"
NEXTAUTH_SECRET="genereer-een-veilige-random-string"
```

### Production

Voor productie:
1. Vervang SQLite door PostgreSQL of MySQL voor betere performance
2. Update `prisma/schema.prisma` datasource naar je productie database
3. Genereer een veilige `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```
4. Deploy naar Vercel, Railway, of een andere hosting provider

## Development

### Project Structuur

```
app/
├── api/              # API routes
│   ├── auth/         # NextAuth endpoints
│   ├── webhook/      # Webhook endpoint
│   ├── printjobs/    # CRUD endpoints
│   └── stats/        # Statistieken endpoint
├── admin/            # Admin dashboard
├── printjobs/        # Werknemer interface
├── login/            # Login pagina
└── layout.tsx        # Root layout

lib/
├── auth.ts           # NextAuth configuratie
└── prisma.ts         # Prisma client

prisma/
├── schema.prisma     # Database schema
└── seed.ts           # Test data
```

## Troubleshooting

**Database errors:**
```bash
npx prisma generate
npx prisma db push
```

**Clear database en reset:**
```bash
rm prisma/dev.db
npx prisma db push
npx tsx prisma/seed.ts
```

**Port already in use:**
```bash
npm run dev -- -p 3001
```

## Toekomstige Verbeteringen

- [ ] WebSocket voor real-time updates zonder polling
- [ ] Notificaties voor nieuwe printjobs
- [ ] Exporteer functionaliteit voor rapporten
- [ ] Filters en zoekfunctionaliteit
- [ ] Printer status monitoring
- [ ] Bulk acties op printjobs
- [ ] Gebruikers management in admin panel
- [ ] Mobile app versie

## Licentie

Proprietary - Alle rechten voorbehouden

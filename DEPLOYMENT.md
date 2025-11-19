# Deployment Guide - Kinsta

## Voorbereiding

### 1. Database Setup
Voor productie heb je een echte database nodig (SQLite is niet geschikt voor productie):

**Optie A: PostgreSQL bij Kinsta**
1. Ga naar Kinsta Dashboard → Database → Add database
2. Kies PostgreSQL
3. Noteer de connection string

**Optie B: Externe PostgreSQL (bijv. Supabase, Neon.tech)**
1. Maak een gratis PostgreSQL database aan
2. Kopieer de connection string

### 2. Pas Prisma Schema aan voor PostgreSQL

Open `prisma/schema.prisma` en wijzig:

```prisma
datasource db {
  provider = "postgresql"  // Was: "sqlite"
  url      = env("DATABASE_URL")
}
```

### 3. Genereer nieuw Auth Secret

Voer uit in terminal:
```bash
openssl rand -base64 32
```

Kopieer de output - dit wordt je `AUTH_SECRET`.

## Deployment Stappen

### 1. Push Code naar Git Repository

```bash
# Initialiseer git (als nog niet gedaan)
git init

# Voeg alle bestanden toe
git add .

# Commit
git commit -m "Initial commit - printlijst app"

# Verbind met GitHub (vervang met jouw repo)
git remote add origin https://github.com/jouw-username/printlijst-app-v2.git
git branch -M main
git push -u origin main
```

### 2. Deploy op Kinsta

1. **Log in bij Kinsta Dashboard**
   - Ga naar "Applications"
   - Klik "Add application"

2. **Verbind GitHub Repository**
   - Selecteer je repository: `printlijst-app-v2`
   - Branch: `main`

3. **Build Settings**
   - Build command: `npm run build`
   - Start command: `npm start`
   - Node version: `20.x` of hoger

4. **Environment Variables**
   
   Voeg toe in Kinsta dashboard onder "Environment variables":
   
   ```
   DATABASE_URL="postgresql://user:password@host:5432/database?schema=public"
   NEXTAUTH_URL="https://jouw-app-naam.kinsta.app"
   AUTH_SECRET="[jouw-gegenereerde-secret-van-stap-3]"
   NODE_ENV="production"
   ```

5. **Deploy**
   - Klik "Deploy now"
   - Wacht tot de build compleet is

### 3. Database Migratie

Na eerste deployment, open Kinsta Terminal en voer uit:

```bash
npx prisma migrate deploy
npx prisma db seed
```

Of maak een gebruiker via de app interface na deployment.

## Post-Deployment

### 1. Test de applicatie
- Ga naar `https://jouw-app-naam.kinsta.app`
- Test login functionaliteit
- Test webhook endpoint: `https://jouw-app-naam.kinsta.app/api/webhook`

### 2. Webhook Setup bij GoedGepickt
1. Log in bij GoedGepickt
2. Ga naar instellingen → Webhooks
3. Voeg webhook URL toe: `https://jouw-app-naam.kinsta.app/api/webhook`
4. Selecteer event: "Order created" of "Order fulfilled"

### 3. Custom Domain (optioneel)
1. Kinsta dashboard → Domains → Add domain
2. Voeg jouw domein toe (bijv. `printlijst.jouwbedrijf.nl`)
3. Update DNS records bij je domain provider
4. Update `NEXTAUTH_URL` in environment variables

## Belangrijke Notities

### Database Backups
- Kinsta maakt automatisch backups van je database
- Test je backup recovery procedure

### Monitoring
- Check Kinsta Analytics voor performance
- Monitor error logs in Kinsta dashboard

### Updates
Na code wijzigingen:
```bash
git add .
git commit -m "Beschrijving van wijzigingen"
git push
```

Kinsta zal automatisch re-deployen (als auto-deploy aan staat).

## Troubleshooting

### Build fails
- Check build logs in Kinsta dashboard
- Zorg dat alle dependencies in `package.json` staan
- Verify Node version compatibility

### Database connection errors
- Controleer `DATABASE_URL` format
- Verify database is accessible from Kinsta
- Check firewall rules

### Authentication issues
- Verify `AUTH_SECRET` is set
- Check `NEXTAUTH_URL` matches je domain
- Clear browser cookies en test opnieuw

### Webhook niet werkend
- Test webhook URL met Postman
- Check firewall/security settings
- Verify GoedGepickt webhook configuratie

## Security Checklist

✅ Database connection string gebruikt environment variables
✅ AUTH_SECRET is sterk en uniek
✅ .env files zijn niet in git
✅ Production environment variabelen zijn ingesteld
✅ HTTPS is enabled (automatisch bij Kinsta)
✅ Database backups zijn geconfigureerd

## Contact & Support

Voor vragen over:
- **Kinsta**: https://kinsta.com/help/
- **Next.js**: https://nextjs.org/docs
- **Prisma**: https://www.prisma.io/docs

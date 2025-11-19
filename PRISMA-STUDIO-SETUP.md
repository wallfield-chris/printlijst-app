# Prisma Studio Setup op Kinsta

Deze guide helpt je om Prisma Studio te draaien op je Kinsta productie server, zodat je de database structuur en data kunt bekijken via het admin panel.

## 🔐 Beveiliging

**BELANGRIJK:** Prisma Studio heeft standaard geen authenticatie. We beveiligen het op twee manieren:
1. De "Open Prisma Studio" knop in het admin panel is alleen toegankelijk voor admins (via NextAuth)
2. Prisma Studio draait op een aparte port die alleen toegankelijk is via de juiste URL

## 📋 Stap 1: Environment Variabelen in Kinsta

Ga naar je applicatie in Kinsta en voeg deze environment variabelen toe:

### Verplichte variabelen:
```
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
NEXTAUTH_URL=https://jouw-domein.com
AUTH_SECRET=<genereer met: openssl rand -base64 32>
```

### Optionele variabelen voor Prisma Studio:
```
PRISMA_STUDIO_PORT=5555
PRISMA_STUDIO_URL=https://jouw-domein.com:5555
```

**Let op:** Als je `PRISMA_STUDIO_URL` niet instelt, wordt deze automatisch gegenereerd op basis van `NEXTAUTH_URL` + `:5555`

## 🚀 Stap 2: Kinsta Build Configuration

### Optie A: Start command aanpassen (Aanbevolen)

In Kinsta, ga naar je applicatie instellingen:

1. **Build Command:** (laat staan)
   ```
   npm run build
   ```

2. **Start Command:** (vervang met)
   ```
   npm run start:with-studio
   ```

Dit start zowel Next.js als Prisma Studio tegelijk.

### Optie B: Process Manager gebruiken

Als je een process manager zoals PM2 gebruikt, maak dan dit ecosystem bestand:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'nextjs',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'prisma-studio',
      script: 'npx',
      args: 'prisma studio --port 5555 --browser none',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}
```

Start command: `pm2 start ecosystem.config.js`

## 🔌 Stap 3: Port Configuration in Kinsta

Kinsta moet port **5555** openstellen voor Prisma Studio:

1. Ga naar je applicatie in Kinsta Dashboard
2. Navigeer naar **Settings** → **Advanced**
3. Voeg **port 5555** toe aan de toegestane ports (als beschikbaar)

**Let op:** Niet alle Kinsta hosting types ondersteunen custom ports. Als dit niet werkt:
- Gebruik een reverse proxy (zie Optie C hieronder)
- Of gebruik Prisma Studio alleen lokaal met de productie database

### Optie C: Reverse Proxy (als custom ports niet werken)

Voeg dit toe aan je `next.config.ts`:

```typescript
async rewrites() {
  return [
    {
      source: '/prisma-studio/:path*',
      destination: 'http://localhost:5555/:path*',
    },
  ]
}
```

Dan is Prisma Studio bereikbaar via: `https://jouw-domein.com/prisma-studio`

Update in dat geval je environment variabele:
```
PRISMA_STUDIO_URL=https://jouw-domein.com/prisma-studio
```

## 🧪 Stap 4: Testen

1. Deploy je applicatie in Kinsta
2. Log in als admin
3. Ga naar **Admin** → **Settings** → **Algemeen**
4. Scroll naar de **Danger Zone**
5. Klik op **"Open Prisma Studio"**

Dit zou Prisma Studio moeten openen in een nieuw tabblad.

## 🛠️ Troubleshooting

### Prisma Studio opent niet
**Probleem:** De URL opent niet of geeft een timeout error.

**Oplossingen:**
1. Check of Prisma Studio daadwerkelijk draait:
   ```bash
   # SSH naar je Kinsta server en run:
   ps aux | grep prisma
   ```

2. Check de logs in Kinsta:
   - Kijk of je ziet: "🚀 Starting Prisma Studio on port 5555..."

3. Controleer of port 5555 open staat (of gebruik de reverse proxy optie)

### "Unauthorized" error
**Probleem:** Je krijgt een 401 Unauthorized error.

**Oplossing:** 
- Zorg dat je ingelogd bent als admin
- Check of `AUTH_SECRET` correct is ingesteld in Kinsta

### Prisma Studio start niet
**Probleem:** Alleen Next.js start, Prisma Studio niet.

**Oplossing:**
1. Check of `start-server.sh` executable is:
   ```bash
   chmod +x start-server.sh
   ```

2. Check of Prisma correct is geïnstalleerd:
   ```bash
   npm install prisma --save-dev
   ```

## 🔒 Beveiligingstips

1. **Gebruik alleen HTTPS** - Zorg dat je altijd HTTPS gebruikt voor Prisma Studio
2. **Beperk toegang** - Alleen admins kunnen de knop zien en gebruiken
3. **Monitor toegang** - Check regelmatig de logs voor verdachte activiteit
4. **Overweeg IP whitelisting** - Als Kinsta dit ondersteunt, beperk dan toegang tot specifieke IP's

## 🆘 Support

Als je problemen hebt, check:
1. Kinsta documentatie voor custom ports
2. Next.js rewrites voor reverse proxy setup
3. Prisma Studio CLI documentatie

## 📚 Alternatief: Lokale toegang

Als je Prisma Studio liever lokaal draait met toegang tot de productie database:

1. Kopieer je `DATABASE_URL` uit Kinsta
2. Voeg toe aan je lokale `.env` file
3. Run lokaal:
   ```bash
   npm run studio
   ```

Dit is veiliger omdat Prisma Studio dan niet publiek toegankelijk is.

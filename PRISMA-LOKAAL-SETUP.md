# Prisma Studio Lokaal Gebruiken met Productie Database

## 🎯 Simpele Setup (5 minuten)

### Stap 1: Kopieer Database URL uit Kinsta

1. Ga naar Kinsta → Environment variables
2. Kopieer de waarde van `DATABASE_URL`
3. Het ziet er ongeveer zo uit:
   ```
   postgresql://user:password@host:5432/printlijst_db
   ```

### Stap 2: Voeg toe aan lokale .env

Open je lokale `.env` bestand en voeg/vervang toe:

```env
DATABASE_URL="postgresql://[de URL die je kopieerde uit Kinsta]"
```

### Stap 3: Start Prisma Studio

```bash
npm run studio
```

### Stap 4: Open in browser

Ga naar: `http://localhost:5555`

🎉 Je ziet nu je **productie database** in Prisma Studio!

## ✅ Voordelen van deze aanpak:

- ✅ Werkt altijd (geen proxy problemen)
- ✅ Sneller (directe database connectie)
- ✅ Veiliger (alleen jij hebt toegang)
- ✅ Geen extra kosten/configuratie in Kinsta

## 🔒 Beveiliging

Prisma Studio heeft geen ingebouwde authenticatie. Door het lokaal te draaien is het alleen toegankelijk vanaf jouw computer.

## 📝 Notitie

Je kunt de "Open Prisma Studio" knop uit het admin panel verwijderen als je deze lokale aanpak prefereert.

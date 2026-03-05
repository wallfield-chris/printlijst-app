-- DropTable (als deze al bestond met oud schema)
DROP TABLE IF EXISTS "ChecklistEntry";

-- CreateTable
CREATE TABLE "ChecklistEntry" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "printerCleaned" BOOLEAN NOT NULL DEFAULT false,
    "workplaceClean" BOOLEAN NOT NULL DEFAULT false,
    "returnsProcessed" BOOLEAN NOT NULL DEFAULT false,
    "wasteDisposed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistEntry_date_key" ON "ChecklistEntry"("date");

-- CreateIndex
CREATE INDEX "ChecklistEntry_date_idx" ON "ChecklistEntry"("date");

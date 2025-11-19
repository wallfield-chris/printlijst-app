-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderUuid" TEXT,
    "orderNumber" TEXT NOT NULL,
    "productUuid" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "backfile" TEXT,
    "quantity" INTEGER NOT NULL,
    "pickedQuantity" INTEGER,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "tags" TEXT,
    "customerName" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "backorder" BOOLEAN NOT NULL DEFAULT false,
    "missingFile" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "completedBy" TEXT,
    "webhookData" TEXT,
    CONSTRAINT "PrintJob_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PrintJob" ("backfile", "backorder", "completedAt", "completedBy", "customerName", "id", "notes", "orderNumber", "orderUuid", "pickedQuantity", "priority", "productName", "productUuid", "quantity", "receivedAt", "sku", "startedAt", "status", "tags", "webhookData") SELECT "backfile", "backorder", "completedAt", "completedBy", "customerName", "id", "notes", "orderNumber", "orderUuid", "pickedQuantity", "priority", "productName", "productUuid", "quantity", "receivedAt", "sku", "startedAt", "status", "tags", "webhookData" FROM "PrintJob";
DROP TABLE "PrintJob";
ALTER TABLE "new_PrintJob" RENAME TO "PrintJob";
CREATE INDEX "PrintJob_status_idx" ON "PrintJob"("status");
CREATE INDEX "PrintJob_completedAt_idx" ON "PrintJob"("completedAt");
CREATE INDEX "PrintJob_orderUuid_idx" ON "PrintJob"("orderUuid");
CREATE INDEX "PrintJob_orderNumber_idx" ON "PrintJob"("orderNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

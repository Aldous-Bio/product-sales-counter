-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" DATETIME
);

-- CreateTable
CREATE TABLE "Shop" (
    "shopDomain" TEXT NOT NULL PRIMARY KEY,
    "ianaTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "hideWhenZero" BOOLEAN NOT NULL DEFAULT true,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" DATETIME,
    "backfillStatus" TEXT NOT NULL DEFAULT 'pending',
    "backfillCursor" TEXT,
    "backfillStartedAt" DATETIME,
    "backfillCompletedAt" DATETIME,
    "backfillError" TEXT,
    "lastReconciledAt" DATETIME,
    "lastSyncError" TEXT
);

-- CreateTable
CREATE TABLE "OrderProductDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "day" DATETIME NOT NULL,
    "grossUnits" INTEGER NOT NULL DEFAULT 0,
    "refundedUnits" INTEGER NOT NULL DEFAULT 0,
    "netUnits" INTEGER NOT NULL DEFAULT 0,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "OrderProductDay_shopDomain_productId_day_idx" ON "OrderProductDay"("shopDomain", "productId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "OrderProductDay_shopDomain_orderId_productId_key" ON "OrderProductDay"("shopDomain", "orderId", "productId");

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DriverRefreshToken" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverRefreshToken_driverId_idx" ON "DriverRefreshToken"("driverId");

-- AddForeignKey
ALTER TABLE "DriverRefreshToken" ADD CONSTRAINT "DriverRefreshToken_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

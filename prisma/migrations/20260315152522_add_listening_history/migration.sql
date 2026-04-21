-- CreateTable
CREATE TABLE "ListeningHistory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "spotifyTrackId" TEXT NOT NULL,
    "trackName" TEXT NOT NULL,
    "artistNames" TEXT NOT NULL,
    "albumImageUrl" TEXT,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timesPlayed" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListeningHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListeningHistory_userId_idx" ON "ListeningHistory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ListeningHistory_userId_spotifyTrackId_key" ON "ListeningHistory"("userId", "spotifyTrackId");

-- AddForeignKey
ALTER TABLE "ListeningHistory" ADD CONSTRAINT "ListeningHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

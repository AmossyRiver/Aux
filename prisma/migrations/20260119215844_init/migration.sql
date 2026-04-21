-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "spotifyId" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "profileImageUrl" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTopTrack" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "spotifyTrackId" TEXT NOT NULL,
    "trackName" TEXT NOT NULL,
    "artistNames" TEXT NOT NULL,
    "albumImageUrl" TEXT,
    "rank" INTEGER NOT NULL,
    "timeRange" TEXT NOT NULL DEFAULT 'medium_term',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTopTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTopArtist" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "spotifyArtistId" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "imageUrl" TEXT,
    "genres" TEXT[],
    "rank" INTEGER NOT NULL,
    "timeRange" TEXT NOT NULL DEFAULT 'medium_term',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTopArtist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_spotifyId_key" ON "User"("spotifyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTopTrack_userId_spotifyTrackId_timeRange_key" ON "UserTopTrack"("userId", "spotifyTrackId", "timeRange");

-- CreateIndex
CREATE UNIQUE INDEX "UserTopArtist_userId_spotifyArtistId_timeRange_key" ON "UserTopArtist"("userId", "spotifyArtistId", "timeRange");

-- AddForeignKey
ALTER TABLE "UserTopTrack" ADD CONSTRAINT "UserTopTrack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTopArtist" ADD CONSTRAINT "UserTopArtist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

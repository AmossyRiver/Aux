import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
    try {
        const { userId } = await params;
        const userIdNum = parseInt(userId);

        if (isNaN(userIdNum)) {
            return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
        }

        // Get user info
        const user = await prisma.user.findUnique({
            where: { id: userIdNum },
            select: {
                id: true,
                spotifyId: true,
                displayName: true,
                profileImageUrl: true,
                email: true,
                createdAt: true
            }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Get time range from query params (default to medium_term)
        const timeRange = request.nextUrl.searchParams.get('timeRange') || 'medium_term';

        // Get top tracks
        const topTracks = await prisma.userTopTrack.findMany({
            where: { userId: userIdNum, timeRange },
            orderBy: { rank: 'asc' },
            take: 10
        });

        // Get top artists
        const topArtists = await prisma.userTopArtist.findMany({
            where: { userId: userIdNum, timeRange },
            orderBy: { rank: 'asc' },
            take: 10
        });

        // Get listening history
        const listeningHistory = await prisma.listeningHistory.findMany({
            where: { userId: userIdNum },
            orderBy: { playedAt: 'desc' },
            take: 500 // Get more to deduplicate
        });

        // Deduplicate listening history - keep only most recent listen of each track
        const trackMap = new Map<string, any>();
        for (const entry of listeningHistory) {
            if (!trackMap.has(entry.spotifyTrackId)) {
                trackMap.set(entry.spotifyTrackId, {
                    id: entry.spotifyTrackId,
                    name: entry.trackName,
                    artists: entry.artistNames.split(', ').map(name => ({ name })),
                    album: { images: entry.albumImageUrl ? [{ url: entry.albumImageUrl }] : [] },
                    playedAt: entry.playedAt,
                    timesPlayed: 0
                });
            }
            trackMap.get(entry.spotifyTrackId)!.timesPlayed += 1;
        }

        const deduplicatedHistory = Array.from(trackMap.values())
            .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())
            .slice(0, 50);

        return NextResponse.json({
            user,
            topTracks: topTracks.map(track => ({
                id: track.spotifyTrackId,
                name: track.trackName,
                artists: track.artistNames.split(', ').map(name => ({ name })),
                album: { images: track.albumImageUrl ? [{ url: track.albumImageUrl }] : [] }
            })),
            topArtists: topArtists.map(artist => ({
                id: artist.spotifyArtistId,
                name: artist.artistName,
                images: artist.imageUrl ? [{ url: artist.imageUrl }] : [],
                genres: artist.genres
            })),
            listeningHistory: deduplicatedHistory
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 });
    }
}


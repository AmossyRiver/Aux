import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { getSpotifyClient, refreshAccessToken } from '@/lib/spotify';

export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const spotifyUserId = cookieStore.get('spotify_user_id')?.value;
    const limit = request.nextUrl.searchParams.get('limit') || '20';

    if (!spotifyUserId) {
        return NextResponse.json({error: 'Not logged in'}, {status: 401});
    }

    try {
        // Get user from database
        const user = await prisma.user.findUnique({
            where: {spotifyId: spotifyUserId},
            select: { id: true, accessToken: true, tokenExpiresAt: true, refreshToken: true }
        });

        if (!user) {
            return NextResponse.json({error: 'User not found'}, {status: 404});
        }

        if (!user.accessToken) {
            return NextResponse.json({error: 'Not logged in'}, {status: 401});
        }

        // Check if token needs refresh
        let accessToken = user.accessToken;
        if (user.tokenExpiresAt && user.tokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
            console.log(`[RECENTLY-PLAYED] Token expired, refreshing...`);
            const newToken = await refreshAccessToken(user.id);
            if (!newToken) {
                return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 });
            }
            accessToken = newToken;
        }

        // Fetch recently played tracks from Spotify API using spotify.js library
        const client = getSpotifyClient(accessToken);
        const recentlyPlayed = await client.me.recentlyPlayed({limit: parseInt(limit)});

        if (!recentlyPlayed.items || recentlyPlayed.items.length === 0) {
            return NextResponse.json({error: 'No Recently Played Tracks'}, {status: 404});
        }

        // Process Each Track and Add to Database - only if it doesn't already exist for this exact time
        for (const item of recentlyPlayed.items) {
            const track = item.track;
            // Normalize the timestamp to remove milliseconds for consistent comparison
            const playedAt = new Date(item.played_at);
            playedAt.setMilliseconds(0);

            try {
                // Check if this exact play already exists (same track, same time, same user)
                const existing = await prisma.listeningHistory.findFirst({
                    where: {
                        userId: user.id,
                        spotifyTrackId: track.id,
                        playedAt: playedAt
                    }
                });

                // Only create if it doesn't already exist
                if (!existing) {
                    await prisma.listeningHistory.create({
                        data: {
                            userId: user.id,
                            spotifyTrackId: track.id,
                            trackName: track.name,
                            artistNames: track.artists.map((a: any) => a.name).join(', '),
                            albumImageUrl: track.album.images?.[0]?.url,
                            playedAt: playedAt
                        }
                    });
                    console.log(`[RECENTLY-PLAYED] Saved track: ${track.name} played at ${playedAt}`);
                } else {
                    console.log(`[RECENTLY-PLAYED] Track already exists: ${track.name} at ${playedAt}`);
                }
            } catch (error) {
                console.error('Error saving track:', error);
            }
        }

        // Fetch all listening history for this user
        const listeningHistory = await prisma.listeningHistory.findMany({
            where: { userId: user.id },
            orderBy: { playedAt: 'desc' }
        });

        // Return recently played tracks sorted by most recent with play count
        const trackMap = new Map<string, any>();
        for (const entry of listeningHistory) {
            if (!trackMap.has(entry.spotifyTrackId)) {
                trackMap.set(entry.spotifyTrackId, {
                    id: entry.spotifyTrackId,
                    name: entry.trackName,
                    artists: entry.artistNames.split(', ').map(name => ({name})),
                    album: {images: entry.albumImageUrl ? [{url: entry.albumImageUrl}] : []},
                    playedAt: entry.playedAt,
                    timesPlayed: 0
                });
            }
            trackMap.get(entry.spotifyTrackId)!.timesPlayed += 1;
        }

        const items = Array.from(trackMap.values());

        return NextResponse.json({items});

    } catch (error) {
        console.error('Error fetching recently played tracks:', error);
        return NextResponse.json({error: 'Failed to fetch recently played tracks'}, {status: 500});
    }
}


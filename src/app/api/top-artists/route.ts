import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { refreshAccessToken, getSpotifyClient } from '@/lib/spotify';

export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const spotifyUserId = cookieStore.get('spotify_user_id')?.value;
    const timeRange = request.nextUrl.searchParams.get('timeRange') || 'medium_term';

    if (!spotifyUserId) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        // Get user from database
        const user = await prisma.user.findUnique({
            where: { spotifyId: spotifyUserId },
            select: { id: true, accessToken: true, tokenExpiresAt: true, refreshToken: true }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Check if we have cached data in the database
        const cachedArtists = await prisma.userTopArtist.findMany({
            where: { userId: user.id, timeRange: timeRange },
            orderBy: { rank: 'asc' }
        });

        // If we have cached data and it's recent (less than 1 hour old), return it
        if (cachedArtists.length > 0) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const isRecent = cachedArtists[0].fetchedAt > oneHourAgo;

            if (isRecent) {
                // Convert database format to Spotify API format
                return NextResponse.json({
                    items: cachedArtists.map(artist => ({
                        id: artist.spotifyArtistId,
                        name: artist.artistName,
                        images: artist.imageUrl ? [{ url: artist.imageUrl }] : [],
                        genres: artist.genres
                    }))
                });
            }
        }

        // If no recent cache, fetch from Spotify API and update database
        if (!user.accessToken) {
            // Return what we have in cache even if old
            if (cachedArtists.length > 0) {
                return NextResponse.json({
                    items: cachedArtists.map(artist => ({
                        id: artist.spotifyArtistId,
                        name: artist.artistName,
                        images: artist.imageUrl ? [{ url: artist.imageUrl }] : [],
                        genres: artist.genres
                    }))
                });
            }
            return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
        }

        // Check if token needs refresh
        let accessToken = user.accessToken;
        if (user.tokenExpiresAt && user.tokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
            console.log(`[TOP-ARTISTS] Token expired, refreshing...`);
            const newToken = await refreshAccessToken(user.id);
            if (!newToken) {
                // Return cached data if refresh fails
                if (cachedArtists.length > 0) {
                    return NextResponse.json({
                        items: cachedArtists.map(artist => ({
                            id: artist.spotifyArtistId,
                            name: artist.artistName,
                            images: artist.imageUrl ? [{ url: artist.imageUrl }] : [],
                            genres: artist.genres
                        }))
                    });
                }
                return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 });
            }
            accessToken = newToken;
        }

        const client = getSpotifyClient(accessToken);
        const topArtists = await client.me.top('artists', { limit: 10, offset: 0, timeRange: timeRange as any });

        // Update database with fresh data
        if (topArtists.items) {
            await prisma.userTopArtist.deleteMany({
                where: { userId: user.id, timeRange: timeRange }
            });

            await prisma.userTopArtist.createMany({
                data: topArtists.items.map((artist: any, index: number) => ({
                    userId: user.id,
                    spotifyArtistId: artist.id,
                    artistName: artist.name,
                    imageUrl: artist.images?.[0]?.url,
                    genres: artist.genres || [],
                    rank: index + 1,
                    timeRange: timeRange
                }))
            });
        }

        return NextResponse.json(topArtists);
    } catch (error) {
        console.error('Error fetching top artists:', error);
        return NextResponse.json({ error: 'Failed to fetch top artists' }, { status: 500 });
    }
}

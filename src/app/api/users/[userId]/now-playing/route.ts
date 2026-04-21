import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getSpotifyClient, refreshAccessToken } from '@/lib/spotify';

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
    try {
        const { userId } = await params;
        const userIdNum = parseInt(userId);

        if (isNaN(userIdNum)) {
            return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
        }

        // Get user from database
        const user = await prisma.user.findUnique({
            where: { id: userIdNum },
            select: {
                id: true,
                accessToken: true,
                tokenExpiresAt: true,
                refreshToken: true
            }
        });

        if (!user || !user.accessToken) {
            return NextResponse.json({ isPlaying: false });
        }

        let accessToken = user.accessToken;

        // Check if token needs refresh
        if (user.tokenExpiresAt && user.tokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
            const newToken = await refreshAccessToken(user.id);
            if (newToken) {
                accessToken = newToken;
            }
        }

        if (!accessToken) {
            return NextResponse.json({ isPlaying: false });
        }

        const client = getSpotifyClient(accessToken);
        const currentlyPlaying = await client.me.getPlaybackState().catch(() => null);

        if (!currentlyPlaying || !currentlyPlaying.item) {
            return NextResponse.json({ isPlaying: false });
        }

        return NextResponse.json({
            isPlaying: currentlyPlaying.is_playing,
            item: currentlyPlaying.item,
            progress_ms: currentlyPlaying.progress_ms
        });
    } catch (error) {
        console.error('Error fetching user now playing:', error);
        return NextResponse.json({ isPlaying: false });
    }
}


// app/api/test-token-refresh/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { refreshAccessToken } from '@/lib/spotify';

export async function GET() {
    const cookieStore = await cookies();
    const spotifyUserId = cookieStore.get('spotify_user_id')?.value;

    if (!spotifyUserId) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { spotifyId: spotifyUserId },
            select: { id: true, spotifyId: true, tokenExpiresAt: true }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        console.log(`[TEST] Current token expires at: ${user.tokenExpiresAt}`);
        console.log(`[TEST] Time until expiry: ${user.tokenExpiresAt ? Math.round((user.tokenExpiresAt.getTime() - Date.now()) / 1000 / 60) + ' minutes' : 'Unknown'}`);

        // Manually refresh the token
        const newToken = await refreshAccessToken(user.id);

        if (newToken) {
            const updatedUser = await prisma.user.findUnique({
                where: { spotifyId: spotifyUserId },
                select: { id: true, spotifyId: true, tokenExpiresAt: true, accessToken: true }
            });

            return NextResponse.json({
                success: true,
                message: 'Token refreshed successfully',
                oldExpiresAt: user.tokenExpiresAt,
                newExpiresAt: updatedUser?.tokenExpiresAt,
                newTokenPrefix: updatedUser?.accessToken?.substring(0, 20) + '...',
                minutesUntilExpiry: updatedUser?.tokenExpiresAt ? Math.round((updatedUser.tokenExpiresAt.getTime() - Date.now()) / 1000 / 60) : 'Unknown'
            });
        } else {
            return NextResponse.json({
                success: false,
                message: 'Failed to refresh token',
                user: user
            }, { status: 500 });
        }
    } catch (error) {
        console.error('Test error:', error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}


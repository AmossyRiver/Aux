// app/api/me/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function GET() {
    const cookieStore = await cookies();
    const spotifyUserId = cookieStore.get('spotify_user_id')?.value;

    if (!spotifyUserId) {
        return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { spotifyId: spotifyUserId }
        });

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Return user data in Spotify API format for compatibility
        return NextResponse.json({
            id: user.spotifyId,
            display_name: user.displayName,
            email: user.email,
            images: user.profileImageUrl ? [{ url: user.profileImageUrl }] : []
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }
}

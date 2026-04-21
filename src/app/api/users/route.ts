import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                spotifyId: true,
                displayName: true,
                profileImageUrl: true,
                email: true,
                createdAt: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json({
            items: users
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}


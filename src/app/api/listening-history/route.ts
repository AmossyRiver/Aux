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
    // Get current user
    const user = await prisma.user.findUnique({
      where: { spotifyId: spotifyUserId },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch all listening history for this user, sorted by most recent
    const listeningHistory = await prisma.listeningHistory.findMany({
      where: { userId: user.id },
      orderBy: { playedAt: 'desc' },
      take: 1000 // Get up to 1000 tracks
    });

    // Map each entry - each entry in the database represents one listen
    const items = listeningHistory.map((entry, index) => ({
      id: `${entry.spotifyTrackId}-${index}`, // Unique key for each listen
      name: entry.trackName,
      artists: entry.artistNames.split(', ').map(name => ({ name })),
      album: { images: entry.albumImageUrl ? [{ url: entry.albumImageUrl }] : [] },
      playedAt: entry.playedAt,
      spotifyTrackId: entry.spotifyTrackId,
      timesPlayed: 1
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching listening history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listening history' },
      { status: 500 }
    );
  }
}


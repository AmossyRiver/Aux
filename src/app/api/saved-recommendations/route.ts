import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const spotifyUserId = cookieStore.get('spotify_user_id')?.value;
  const type = request.nextUrl.searchParams.get('type'); // 'track', 'artist', or null for all

  if (!spotifyUserId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { spotifyId: spotifyUserId },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let where: any = { userId: user.id };
    if (type) {
      where.type = type;
    }

    const savedRecommendations = await prisma.savedRecommendation.findMany({
      where,
      orderBy: { savedAt: 'desc' }
    });

    return NextResponse.json({ items: savedRecommendations });
  } catch (error) {
    console.error('Error fetching saved recommendations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch saved recommendations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const spotifyUserId = cookieStore.get('spotify_user_id')?.value;

  if (!spotifyUserId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { spotifyId, name, type, artistNames, albumImageUrl, genres, previewUrl, popularity } = body;

    if (!spotifyId || !name || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: spotifyId, name, type' },
        { status: 400 }
      );
    }

    if (!['track', 'artist'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "track" or "artist"' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { spotifyId: spotifyUserId },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if already saved
    const existing = await prisma.savedRecommendation.findUnique({
      where: {
        userId_spotifyId_type: {
          userId: user.id,
          spotifyId,
          type
        }
      }
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Recommendation already saved', saved: true },
        { status: 200 }
      );
    }

     const saved = await prisma.savedRecommendation.create({
       data: {
         userId: user.id,
         spotifyId,
         name,
         type,
         artistNames: artistNames ? String(artistNames) : null,
         albumImageUrl: albumImageUrl ? String(albumImageUrl) : null,
         genres: Array.isArray(genres) ? genres.filter(g => typeof g === 'string') : [],
         previewUrl: previewUrl ? String(previewUrl) : null,
         popularity: popularity ? Number(popularity) : null
       }
     });

    return NextResponse.json({ success: true, saved }, { status: 201 });
   } catch (error) {
     console.error('Error saving recommendation:', error);
     console.error('Error details:', error instanceof Error ? error.message : String(error));
     return NextResponse.json(
       { error: 'Failed to save recommendation', details: error instanceof Error ? error.message : String(error) },
       { status: 500 }
     );
   }
}

export async function DELETE(request: NextRequest) {
  const cookieStore = await cookies();
  const spotifyUserId = cookieStore.get('spotify_user_id')?.value;

  if (!spotifyUserId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  try {
    const { spotifyId, type } = await request.json();

    if (!spotifyId || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: spotifyId, type' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { spotifyId: spotifyUserId },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.savedRecommendation.delete({
      where: {
        userId_spotifyId_type: {
          userId: user.id,
          spotifyId,
          type
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting saved recommendation:', error);
    return NextResponse.json(
      { error: 'Failed to delete recommendation' },
      { status: 500 }
    );
  }
}


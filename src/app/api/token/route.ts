// app/api/token/route.ts
import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/spotify';

export async function GET() {
    const accessToken = await getAccessToken();
    if (!accessToken) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    return NextResponse.json({ access_token: accessToken });
}

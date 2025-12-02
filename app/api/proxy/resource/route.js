import { NextResponse } from "next/server";

export async function GET(req) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    console.error('Proxy: URL parameter missing');
    return NextResponse.json({ error: "URL missing" }, { status: 400 });
  }

  console.log('Proxy fetching:', url);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });

    if (!res.ok) {
      console.error(`Proxy failed for ${url}: ${res.status} ${res.statusText}`);
      return new NextResponse(null, { status: res.status });
    }
    
    console.log(`Proxy success for ${url}: ${res.status}, type: ${res.headers.get('content-type')}`);

    const headers = new Headers();
    
    // Copy important headers
    const contentType = res.headers.get('content-type');
    if (contentType) {
      headers.set('Content-Type', contentType);
    }
    
    // Enable CORS
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    // Cache control for better performance
    headers.set('Cache-Control', 'public, max-age=31536000');

    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, { headers });
  } catch (error) {
    console.error(`Error fetching resource ${url}:`, error);
    return new NextResponse(null, { status: 500 });
  }
}

export async function OPTIONS(req) {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
import { NextResponse } from 'next/server';

const STRAPI_API = process.env.STRAPI_API_URL || 'https://api.dreamprovider.in';
const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY;
const RAZORPAY_SECRET = process.env.RAZORPAY_SECRET;

/**
 * POST /api/visits/book
 * Books a FREE or PREMIUM property visit.
 * For premium: creates a Razorpay order first (server-side, secret stays here).
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      visitType, propertyId, visitDate, timeSlotId, timeSlotLabel,
      cityId, locationId, userId, token, amount,
    } = body;

    if (!token || !userId || !propertyId || !visitDate || !timeSlotId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ── PREMIUM: create Razorpay order first ─────────────────────────────────
    let razorpayData = null;
    if (visitType === 'premium') {
      if (!amount || amount <= 0) {
        return NextResponse.json({ error: 'Invalid visit amount' }, { status: 400 });
      }

      const credentials = Buffer.from(`${RAZORPAY_KEY}:${RAZORPAY_SECRET}`).toString('base64');
      const rzRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${credentials}` },
        body: JSON.stringify({
          amount: amount * 100,
          currency: 'INR',
          receipt: `visit_${Date.now()}`,
          notes: { type: 'premium_visit', propertyId: String(propertyId) },
        }),
      });

      if (!rzRes.ok) {
        const err = await rzRes.text();
        console.error('Razorpay order error:', err);
        return NextResponse.json({ error: 'Failed to create payment order' }, { status: 502 });
      }

      razorpayData = await rzRes.json();
    }

    // ── Both free and premium: create schedule-visit record ───────────────────
    const visitPayload = {
      data: {
        visitType,
        property: propertyId,
        visitDate,
        time_slot: timeSlotId,
        time_slot_label: timeSlotLabel || '',
        paymentStatus: visitType === 'free' ? 'not_required' : 'pending',
        user: userId,
        ...(cityId ? { city: cityId } : {}),
        ...(locationId ? { location: locationId } : {}),
        ...(razorpayData ? { raz_order_id: razorpayData.id } : {}),
      },
    };

    const visitRes = await fetch(`${STRAPI_API}/api/schedule-visits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(visitPayload),
    });

    if (!visitRes.ok) {
      const err = await visitRes.text();
      console.error('Schedule visit error:', err);
      return NextResponse.json({ error: 'Failed to create visit record' }, { status: 502 });
    }

    const visitData = await visitRes.json();
    return NextResponse.json({ visitData, razorpayData });
  } catch (err) {
    console.error('book-visit error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/visits/book?userId=&token=
 * Returns the user's scheduled visits.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const token = searchParams.get('token');

    if (!userId || !token) {
      return NextResponse.json({ error: 'Missing userId or token' }, { status: 400 });
    }

    const params = new URLSearchParams({
      'filters[users_permissions_user][id][$eq]': userId,
      'populate[property][populate][images][fields]': 'url',
      'populate[property][populate][location]': '*',
      'populate[property][populate][city]': '*',
      'sort': 'visitDate:desc'
    });

    const res = await fetch(
      `${STRAPI_API}/api/schedule-visits?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 502 });
    }

    return NextResponse.json(await res.json());
  } catch (err) {
    console.error('get-visits error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

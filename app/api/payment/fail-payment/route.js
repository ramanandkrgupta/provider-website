import { NextResponse } from 'next/server';

const STRAPI_API = process.env.STRAPI_API_URL || 'https://api.dreamprovider.in';

/**
 * POST /api/payment/fail-payment
 * Marks a booking as payment-failed in Strapi.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { bookingId, reason, token } = body;

    if (!bookingId || !token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const res = await fetch(`${STRAPI_API}/api/property-bookeds/${bookingId}/payment-failed`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason: reason || 'Payment failed' }),
    });

    return NextResponse.json(res.ok ? await res.json() : { ok: false });
  } catch (error) {
    console.error('fail-payment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';

const STRAPI_API = process.env.STRAPI_API_URL || 'https://api.dreamprovider.in';

/**
 * PUT /api/visits/confirm
 * Confirms premium visit payment after Razorpay success.
 */
export async function PUT(request) {
  try {
    const { visitId, raz_payment_id, token } = await request.json();
    if (!visitId || !raz_payment_id || !token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const res = await fetch(`${STRAPI_API}/api/schedule-visits/${visitId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        data: {
          paymentStatus: 'paid',
          raz_payment_id,
        },
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to confirm visit payment' }, { status: 502 });
    }

    return NextResponse.json(await res.json());
  } catch (err) {
    console.error('confirm-visit error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';

const STRAPI_API = process.env.STRAPI_API_URL || 'https://api.dreamprovider.in';

/**
 * POST /api/payment/confirm-payment
 * Confirms a payment with Strapi backend after Razorpay handler fires.
 * Token passed in body — never expose Razorpay secret for confirmation.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { bookingId, raz_payment_id, payment_amount, coupon_code, coupon_discount, token } = body;

    if (!bookingId || !raz_payment_id || !token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const res = await fetch(`${STRAPI_API}/api/property-bookeds/${bookingId}/confirm-payment`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        raz_payment_id,
        payment_amount,
        original_amount: payment_amount,
        ...(coupon_code ? { coupon_code, coupon_discount: coupon_discount || 0 } : {}),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('confirm-payment Strapi error:', err);
      return NextResponse.json({ error: 'Failed to confirm payment' }, { status: 502 });
    }

    return NextResponse.json(await res.json());
  } catch (error) {
    console.error('confirm-payment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

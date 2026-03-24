import { NextResponse } from 'next/server';

const STRAPI_API = process.env.STRAPI_API_URL || 'https://api.dreamprovider.in';
const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY;
const RAZORPAY_SECRET = process.env.RAZORPAY_SECRET;

/**
 * POST /api/payment/create-booking
 * Creates a Razorpay order + a booking record in Strapi.
 * All secrets stay server-side.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { amount, pricing, propertyId, userId, token, couponCode, couponDiscount, bookingType } = body;

    // Validate required fields
    if (!amount || !propertyId || !userId || !token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Create Razorpay order (server-side — only here do we use the secret)
    const credentials = Buffer.from(`${RAZORPAY_KEY}:${RAZORPAY_SECRET}`).toString('base64');

    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        amount: amount * 100, // paise
        currency: 'INR',
        receipt: `rcpt_${Date.now()}`,
        partial_payment: false,
        notes: { type: 'property_booking', propertyId: String(propertyId) },
      }),
    });

    if (!razorpayRes.ok) {
      const err = await razorpayRes.text();
      console.error('Razorpay order error:', err);
      return NextResponse.json({ error: 'Failed to create payment order' }, { status: 502 });
    }

    const razorpayData = await razorpayRes.json();

    // 2. Create booking record in Strapi
    const bookingPayload = {
      data: {
        property: propertyId,
        user: userId,
        raz_order_id: razorpayData.id,
        payment_status: { status: 'created' },
        selected_pricing: pricing,
        payment_amount: amount,
        original_amount: amount,
        booking_type: bookingType || 'booking',
        ...(couponCode ? { coupon_code: couponCode } : {}),
        ...(couponDiscount ? { coupon_discount: couponDiscount } : {}),
      },
    };

    const bookingRes = await fetch(`${STRAPI_API}/api/property-bookeds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(bookingPayload),
    });

    if (!bookingRes.ok) {
      const err = await bookingRes.text();
      console.error('Strapi booking error:', err);
      return NextResponse.json({ error: 'Failed to create booking record' }, { status: 502 });
    }

    const bookedData = await bookingRes.json();

    return NextResponse.json({ razorpayData, bookedData });
  } catch (error) {
    console.error('create-booking error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Client-side helpers for property booking.
 * ⚠️  NO secrets here — all sensitive operations go through /api/payment/* server routes.
 *     Only the public Razorpay key is used on the client.
 */

const STRAPI_PROXY = '/api/proxy/'; // proxies to https://api.dreamprovider.in/

// Public key only — safe to expose in browser
export const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY;

/**
 * Fetch available coupons.
 * Proxied through /api/proxy/ to avoid CORS and keep token handling clean.
 */
export const fetchAvailableCoupons = async (token) => {
  const res = await fetch(`${STRAPI_PROXY}api/coupons/available?type=property`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error('Failed to load coupons');
  return res.json();
};

/**
 * Validate a coupon code against the total rent.
 */
export const validateCoupon = async ({ code, amount, locationId, cityId, userId, token }) => {
  const res = await fetch(`${STRAPI_PROXY}api/coupons/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      code,
      userId,
      type: 'property',
      amount,
      ...(locationId ? { locationId } : {}),
      ...(cityId ? { cityId } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || err?.message || 'Invalid coupon code');
  }
  return res.json();
};

/**
 * Create Razorpay order + booking record.
 * Calls our own server-side route — Razorpay secret never reaches the browser.
 */
export const createPropertyBook = async ({
  amount,
  pricing,
  propertyId,
  userId,
  token,
  couponCode,
  couponDiscount,
  bookingType = 'booking',
}) => {
  const res = await fetch('/api/payment/create-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount,
      pricing,
      propertyId,
      userId,
      token,
      couponCode: couponCode || null,
      couponDiscount: couponDiscount || 0,
      bookingType,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || 'Failed to create booking');
  }
  return res.json(); // { razorpayData, bookedData }
};

/**
 * Confirm payment after Razorpay `handler` fires.
 * Calls our server-side route.
 */
export const confirmPropertyPayment = async ({
  bookingId,
  raz_payment_id,
  payment_amount,
  coupon_code,
  coupon_discount,
  token,
}) => {
  const res = await fetch('/api/payment/confirm-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingId,
      raz_payment_id,
      payment_amount,
      coupon_code: coupon_code || null,
      coupon_discount: coupon_discount || 0,
      token,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || 'Failed to confirm payment');
  }
  return res.json();
};

/**
 * Mark payment as failed.
 */
export const failPropertyPayment = async ({ bookingId, reason, token }) => {
  await fetch('/api/payment/fail-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId, reason, token }),
  }).catch(() => {}); // fire-and-forget, don't block UX
};

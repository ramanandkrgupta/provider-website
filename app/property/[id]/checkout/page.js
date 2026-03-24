'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '../../../../hooks/useAuth';
import {
  createPropertyBook,
  confirmPropertyPayment,
  failPropertyPayment,
  fetchAvailableCoupons,
  validateCoupon,
  RAZORPAY_KEY,
} from '../../../../lib/propertyBooking';
import {
  FaArrowLeft, FaCheckCircle, FaTag, FaTimes, FaWhatsapp,
  FaShieldAlt, FaChevronRight, FaSpinner, FaExclamationCircle, FaChevronDown, FaChevronUp
} from 'react-icons/fa';
import { MdLocalOffer } from 'react-icons/md';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const REAL_API = 'https://api.dreamprovider.in/';

// Load Razorpay SDK
const loadRazorpay = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function CheckoutPage() {
  const router = useRouter();
  const { id } = useParams();
  const searchParams = useSearchParams();
  const { user, token } = useAuth();

  const [property, setProperty] = useState(null);
  const [pricing, setPricing] = useState(null);
  const [propLoading, setPropLoading] = useState(true);
  const [payLoading, setPayLoading] = useState(false);

  // Coupon state
  const [couponModal, setCouponModal] = useState(false);
  const [coupons, setCoupons] = useState([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [applyingCode, setApplyingCode] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null); // { coupon, discount_amount }
  const [discountAmount, setDiscountAmount] = useState(0);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    fatherName: '',
    fatherNumber: '',
    college: '',
    course: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [expandForm, setExpandForm] = useState(true);

  // Load property + pricing from URL params
  useEffect(() => {
    const rawOption = searchParams.get('option');
    if (!rawOption) { router.back(); return; }
    try {
      const option = JSON.parse(decodeURIComponent(rawOption));
      setPricing(option);
    } catch { router.back(); return; }

    // Fetch property details
    const fetchProp = async () => {
      try {
        const url = `${REAL_API}api/properties/${id}?populate[0]=property_pricing.price_json&populate[1]=images&populate[2]=main_image&populate=*`;
        const res = await axios.get(url);
        if (res.data?.data) setProperty(res.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setPropLoading(false);
      }
    };
    fetchProp();
  }, [id, searchParams]);

  // Pre-fill form from auth user
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: user.full_name || user.username || '',
        email: user.email || '',
        phone: user.username || user.phone || '',
        fatherName: user.fatherName || '',
        fatherNumber: user.fatherNumber || '',
        college: user.college || '',
        course: user.course || '',
      }));
    }
  }, [user]);

  // Load coupons when modal opens
  useEffect(() => {
    if (!couponModal || coupons.length > 0) return;
    setCouponsLoading(true);
    fetchAvailableCoupons(token)
      .then(res => setCoupons(res.data || []))
      .catch(() => {})
      .finally(() => setCouponsLoading(false));
  }, [couponModal, token]);

  const handleInputChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Required';
    if (!formData.phone.trim() || formData.phone.length !== 10) errors.phone = 'Enter valid 10-digit number';
    if (!formData.fatherName.trim()) errors.fatherName = 'Required';
    if (!formData.fatherNumber.trim() || formData.fatherNumber.length !== 10) errors.fatherNumber = 'Enter valid 10-digit number';
    if (!formData.college.trim()) errors.college = 'Required';
    if (!formData.course.trim()) errors.course = 'Required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const getBookingAmount = () => property?.attributes?.booking_amount || 0;
  const getTotalRent = () => parseInt(pricing?.price || 0);
  const getNetRent = () => Math.max(0, getTotalRent() - discountAmount);

  const handleApplyCoupon = async (code) => {
    if (!token || !user) {
      alert('Please sign in to apply coupons.');
      return;
    }
    setCouponError('');
    setApplyingCode(code);
    try {
      const result = await validateCoupon({
        code,
        amount: getTotalRent(), // Coupon applied to total rent, not booking token
        locationId: property?.attributes?.location?.data?.id,
        cityId: property?.attributes?.city?.data?.id,
        userId: user?.id,
        token,
      });
      setAppliedCoupon(result);
      setDiscountAmount(result.discount_amount || 0);
      setCouponModal(false);
      setManualCode('');
    } catch (err) {
      setCouponError(err.message || 'Invalid coupon code');
    } finally {
      setApplyingCode(null);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setDiscountAmount(0);
  };

  const handlePayment = async () => {
    if (!validateForm()) {
      setExpandForm(true);
      return;
    }
    if (!token || !user) {
      alert('Please sign in to complete booking.');
      router.push('/login');
      return;
    }

    const loaded = await loadRazorpay();
    if (!loaded) {
      alert('Payment SDK failed to load. Please check your internet connection.');
      return;
    }

    setPayLoading(true);
    const bookingAmount = getBookingAmount();

    try {
      const { razorpayData, bookedData } = await createPropertyBook({
        amount: bookingAmount,
        pricing: pricing,
        propertyId: parseInt(id),
        userId: user.id,
        token,
        couponCode: appliedCoupon?.coupon?.code || null,
        couponDiscount: discountAmount || 0,
        bookingType: 'booking',
      });

      const options = {
        key: RAZORPAY_KEY,
        amount: bookingAmount * 100,
        currency: 'INR',
        name: 'Provider',
        description: `Booking for ${property.attributes.name}`,
        image: 'https://strapi-s3torage.s3.ap-south-1.amazonaws.com/logo_6a5d611d9f0b8c86a35e_66fad2b62a_c25f766ef4.png',
        order_id: razorpayData.id,
        prefill: {
          name: formData.name,
          email: formData.email,
          contact: formData.phone,
        },
        theme: { color: '#4F46E5' },
        modal: {
          confirm_close: true,
          ondismiss: async () => {
            await failPropertyPayment({ bookingId: bookedData.data.id, reason: 'Payment cancelled by user', token });
            setPayLoading(false);
          },
        },
        handler: async (data) => {
          try {
            await confirmPropertyPayment({
              bookingId: bookedData.data.id,
              raz_payment_id: data.razorpay_payment_id,
              payment_amount: bookingAmount,
              coupon_code: appliedCoupon?.coupon?.code || null,
              coupon_discount: discountAmount || 0,
              token,
            });
          } catch (err) {
            console.error('Confirm payment error:', err);
          } finally {
            router.replace(`/property/${id}/booking-success?bookingId=${bookedData.data.id}&paymentId=${data.razorpay_payment_id}`);
          }
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', async (response) => {
        try {
          await failPropertyPayment({ bookingId: bookedData.data.id, reason: response.error?.description || 'Payment Failed', token });
        } catch (_) {}
        setPayLoading(false);
        alert('Payment failed. Please try again.');
      });
      rzp.open();
    } catch (err) {
      console.error('Booking error:', err);
      alert('Failed to initiate booking. Please try again.');
      setPayLoading(false);
    }
  };

  // Coupon card component
  const CouponCard = ({ coupon, index }) => {
    const meetsMinOrder = getTotalRent() >= coupon.min_order_amount;
    const isApplying = applyingCode === coupon.code;
    const expiryDate = coupon.expiry ? new Date(coupon.expiry) : null;
    const now = new Date();
    const diffDays = expiryDate ? Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)) : null;

    return (
      <motion.div
        key={coupon.id}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className={`rounded-2xl border-2 overflow-hidden ${meetsMinOrder ? 'border-indigo-100 bg-white' : 'border-gray-100 bg-gray-50/50'}`}
      >
        <div className={`w-full h-1 ${meetsMinOrder ? 'bg-gradient-to-r from-indigo-500 to-violet-500' : 'bg-gray-200'}`} />
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black tracking-widest border ${meetsMinOrder ? 'bg-indigo-50 text-indigo-700 border-indigo-200 border-dashed' : 'bg-gray-100 text-gray-400 border-gray-200 border-dashed'}`}>
                <MdLocalOffer size={11} />
                {coupon.code}
              </span>
            </div>
            {diffDays !== null && diffDays <= 3 && (
              <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                Expires in {diffDays}d
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-gray-900 mb-1">
            {coupon.discount_percent}% off{coupon.max_discount ? ` up to ₹${coupon.max_discount}` : ''}
          </p>
          {coupon.description && <p className="text-xs text-gray-500 mb-3 leading-relaxed">{coupon.description}</p>}
          {coupon.min_order_amount > 0 && (
            <div className={`flex items-center gap-1.5 text-xs py-1.5 px-2 rounded-lg mb-3 ${meetsMinOrder ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
              {meetsMinOrder ? <FaCheckCircle size={11} /> : <FaExclamationCircle size={11} />}
              <span className="font-semibold">
                {meetsMinOrder ? `Min order ₹${coupon.min_order_amount} ✓` : `Need ₹${Math.ceil(coupon.min_order_amount - getTotalRent())} more to use`}
              </span>
            </div>
          )}
          <button
            onClick={() => handleApplyCoupon(coupon.code)}
            disabled={!meetsMinOrder || !!applyingCode}
            className={`w-full py-2 rounded-xl text-xs font-black tracking-wide border-2 transition-all flex items-center justify-center gap-2 ${
              meetsMinOrder && !applyingCode
                ? 'border-indigo-500 text-indigo-600 hover:bg-indigo-500 hover:text-white active:scale-95'
                : 'border-gray-200 text-gray-300 cursor-not-allowed'
            }`}
          >
            {isApplying ? <><FaSpinner className="animate-spin" size={11} /> Applying...</> : meetsMinOrder ? 'APPLY' : 'NOT ELIGIBLE'}
          </button>
        </div>
      </motion.div>
    );
  };

  if (propLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600"></div>
    </div>
  );

  if (!property || !pricing) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        <p className="text-gray-600 mb-4">Something went wrong.</p>
        <button onClick={() => router.back()} className="text-indigo-600 font-bold">Go Back</button>
      </div>
    </div>
  );

  const attr = property.attributes;
  const propertyImage = attr.main_image?.data?.attributes?.url || attr.images?.data?.[0]?.attributes?.url;
  const bookingAmount = getBookingAmount();
  const totalRent = getTotalRent();
  const netRent = getNetRent();
  const totalPackageValue = totalRent + parseInt(pricing.deposit_amount || 0) + parseInt(pricing.transportation_charge || 0);

  const InputField = ({ label, name, type = 'text', placeholder, readOnly = false, maxLength, keyboardType }) => (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
        {label} <span className="text-red-500 normal-case font-normal">*</span>
      </label>
      <input
        type={type || 'text'}
        value={formData[name]}
        onChange={(e) => handleInputChange(name, e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        maxLength={maxLength}
        className={`w-full px-4 py-3 rounded-xl border text-sm transition-all outline-none ${
          formErrors[name]
            ? 'border-red-300 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-200'
            : readOnly
            ? 'border-gray-100 bg-gray-50 text-gray-500 cursor-default'
            : 'border-gray-200 bg-white text-gray-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
        }`}
      />
      {formErrors[name] && <p className="text-xs text-red-500 mt-1 font-medium">{formErrors[name]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <FaArrowLeft className="text-gray-700" />
          </button>
          <div>
            <h1 className="text-lg font-black text-gray-900">Review Booking</h1>
            <p className="text-xs text-gray-500">Almost there!</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 pb-32 space-y-5">

        {/* Property Snippet */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-3">
          {propertyImage && (
            <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0">
              <Image src={propertyImage} alt={attr.name} fill className="object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-black text-gray-900 text-sm leading-snug truncate">{attr.name}</p>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{attr.address}</p>
            <span className="inline-block mt-2 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-700">
              {pricing.sharing_name}
            </span>
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-black text-gray-900">Price Breakdown</h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {pricing.duration === 'session' ? 'Session Rent' : pricing.duration === 'monthly' ? 'Monthly Rent' : 'Yearly Rent'}
              </span>
              <span className="text-sm font-bold text-gray-900">₹{totalRent.toLocaleString('en-IN')}</span>
            </div>

            {discountAmount > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-600 font-semibold flex items-center gap-1.5">
                    <FaTag size={11} /> Coupon ({appliedCoupon?.coupon?.code})
                  </span>
                  <span className="text-sm font-bold text-emerald-600">− ₹{discountAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Net Rent (after coupon)</span>
                  <span className="text-sm font-bold text-emerald-700">₹{netRent.toLocaleString('en-IN')}</span>
                </div>
              </>
            )}

            {pricing.deposit_amount && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  Security Deposit ({pricing.refundable ? 'Refundable' : 'Non-Refundable'})
                </span>
                <span className="text-sm font-bold text-gray-900">₹{parseInt(pricing.deposit_amount).toLocaleString('en-IN')}</span>
              </div>
            )}
            {pricing.transportation_charge && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Transport ({pricing.transportation_duration})</span>
                <span className="text-sm font-bold text-gray-900">₹{parseInt(pricing.transportation_charge).toLocaleString('en-IN')}</span>
              </div>
            )}

            <div className="h-px bg-gray-100 my-1" />

            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">Total Package Value</span>
              <span className="text-sm font-black text-gray-900">₹{totalPackageValue.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Pay Now Banner */}
          <div className="mx-5 mb-5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 p-4 text-white">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-bold opacity-90">Booking Token (Pay Now)</span>
              <span className="text-2xl font-black">₹{bookingAmount.toLocaleString('en-IN')}</span>
            </div>
            {discountAmount > 0 && (
              <div className="text-xs bg-white/20 rounded-lg px-2 py-1 mb-2">
                🎉 ₹{discountAmount.toLocaleString('en-IN')} coupon savings will be deducted from your rent at check-in
              </div>
            )}
            <p className="text-xs opacity-75">Remaining rent to be paid at the property during check-in</p>
          </div>
        </div>

        {/* Coupon Section */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-black text-gray-900">Apply Coupon</h2>
          </div>
          <div className="px-5 py-4">
            {appliedCoupon ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
                    <FaCheckCircle className="text-white" size={14} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-emerald-800 tracking-wide">{appliedCoupon.coupon?.code}</p>
                    <p className="text-xs text-emerald-600">You save ₹{discountAmount.toLocaleString('en-IN')} on rent!</p>
                  </div>
                </div>
                <button onClick={handleRemoveCoupon} className="p-1.5 rounded-full bg-red-100 hover:bg-red-200 transition-colors">
                  <FaTimes className="text-red-600" size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCouponModal(true)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-300 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <MdLocalOffer size={20} className="text-indigo-500" />
                  <span className="text-sm font-bold text-gray-800">Apply Coupon Code</span>
                </div>
                <div className="flex items-center gap-1 text-indigo-600 text-xs font-bold group-hover:gap-2 transition-all">
                  View All <FaChevronRight size={10} />
                </div>
              </button>
            )}
          </div>
        </div>

        {/* User Details Form */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setExpandForm(!expandForm)}
            className="w-full flex items-center justify-between px-5 py-4 border-b border-gray-50 hover:bg-gray-50 transition-colors"
          >
            <h2 className="font-black text-gray-900">Your Details</h2>
            {expandForm ? <FaChevronUp size={14} className="text-gray-400" /> : <FaChevronDown size={14} className="text-gray-400" />}
          </button>
          <AnimatePresence>
            {expandForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-5 py-4 space-y-4">
                  <InputField label="Full Name" name="name" placeholder="Your full name" readOnly={!!user?.full_name} />
                  <InputField label="Phone Number" name="phone" type="tel" placeholder="10-digit number" maxLength={10} readOnly={!!user?.username} />
                  <InputField label="Father's Name" name="fatherName" placeholder="Father's full name" />
                  <InputField label="Father's Mobile Number" name="fatherNumber" type="tel" placeholder="10-digit number" maxLength={10} />
                  <InputField label="College Name" name="college" placeholder="Your college / institute" />
                  <InputField label="Course Name" name="course" placeholder="Your course (e.g. B.Tech, MBA)" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Terms */}
        <p className="text-xs text-gray-400 text-center px-4 leading-relaxed">
          By clicking &quot;Pay &amp; Book&quot; you agree to our{' '}
          <Link href="/privacy" className="text-indigo-500 hover:underline">Privacy Policy</Link>
          {' '}&amp;{' '}
          <Link href="/privacy" className="text-indigo-500 hover:underline">Terms of Service</Link>.
        </p>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-100 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <div>
            <p className="text-xs text-gray-500 font-medium">Booking Token</p>
            <p className="text-xl font-black text-gray-900">₹{bookingAmount.toLocaleString('en-IN')}</p>
            {discountAmount > 0 && (
              <p className="text-[10px] text-emerald-600 font-bold">₹{discountAmount} off rent at check-in</p>
            )}
          </div>
          <button
            onClick={handlePayment}
            disabled={payLoading}
            className={`flex-1 py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-2 ${
              payLoading
                ? 'bg-indigo-300 text-white cursor-not-allowed'
                : 'bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-lg shadow-indigo-200 active:scale-95'
            }`}
          >
            {payLoading ? (
              <><FaSpinner className="animate-spin" size={16} /> Processing...</>
            ) : (
              'Pay & Book →'
            )}
          </button>
        </div>
      </div>

      {/* =================== COUPON MODAL =================== */}
      <AnimatePresence>
        {couponModal && (
          <div className="fixed inset-0 z-[300] flex items-end sm:items-center sm:justify-center">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setCouponModal(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="relative w-full sm:max-w-md sm:rounded-3xl bg-white rounded-t-[28px] max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="flex-shrink-0 border-b border-gray-100">
                <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 mb-4" />
                <div className="flex items-center justify-between px-5 pb-4">
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Apply Coupon</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Discount applies on your monthly rent (₹{totalRent.toLocaleString('en-IN')})
                    </p>
                  </div>
                  <button onClick={() => setCouponModal(false)} className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
                    <FaTimes size={14} className="text-gray-600" />
                  </button>
                </div>

                {/* Manual input */}
                <div className="flex gap-2 px-5 pb-4">
                  <input
                    type="text"
                    placeholder="Enter coupon code"
                    value={manualCode}
                    onChange={(e) => { setManualCode(e.target.value.toUpperCase()); setCouponError(''); }}
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 uppercase"
                  />
                  <button
                    onClick={() => manualCode.trim() && handleApplyCoupon(manualCode.trim())}
                    disabled={!manualCode.trim() || !!applyingCode}
                    className={`px-4 py-2.5 rounded-xl text-sm font-black transition-all ${
                      manualCode.trim() && !applyingCode
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {applyingCode === manualCode.trim().toUpperCase() ? <FaSpinner className="animate-spin" /> : 'APPLY'}
                  </button>
                </div>

                {couponError && (
                  <div className="mx-5 mb-4 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
                    <FaExclamationCircle size={12} />
                    {couponError}
                  </div>
                )}
              </div>

              {/* Coupons List */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {couponsLoading ? (
                  <div className="flex items-center justify-center py-12 text-gray-400">
                    <FaSpinner className="animate-spin mr-2" /> Finding best deals...
                  </div>
                ) : coupons.length === 0 ? (
                  <div className="text-center py-12">
                    <MdLocalOffer size={48} className="text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 font-bold">No coupons available</p>
                    <p className="text-gray-400 text-sm mt-1">Check back later for offers</p>
                  </div>
                ) : (
                  coupons.map((coupon, i) => <CouponCard key={coupon.id} coupon={coupon} index={i} />)
                )}
                <p className="text-center text-xs text-gray-400 pt-2 pb-4">
                  💡 Coupon discounts reduce your monthly rent, settled at check-in. You always pay the full booking token now.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

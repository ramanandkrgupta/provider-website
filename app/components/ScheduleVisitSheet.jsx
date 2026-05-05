'use client';

/**
 * ScheduleVisitSheet
 * A bottom sheet component that lets users schedule a Free or Premium property visit.
 * Port of the app's VisitBottomSheet.jsx + FreePremiumSheet.jsx + propPremiumVisit.jsx
 *
 * Props:
 *   isOpen        – boolean controlling visibility
 *   onClose       – () => void
 *   property      – property data object (attributes.name, .address, .city, .location, .premiumVisit)
 *   propertyId    – number
 *   token         – JWT string
 *   user          – user object
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import {
  FaTimes, FaCalendarAlt, FaClock, FaStar, FaCheckCircle,
  FaSpinner, FaChevronLeft
} from 'react-icons/fa';
import { MdVerified } from 'react-icons/md';
import { RAZORPAY_KEY } from '../../lib/propertyBooking';

const REAL_API = 'https://api.dreamprovider.in/';

const loadRazorpay = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

/** Generates the next N days starting from today */
const getDates = (n = 10) => {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
};

const DATES = getDates(10);

export default function ScheduleVisitSheet({ isOpen, onClose, property, propertyId, token, user }) {
  /* Step: 'choose' | 'free' | 'premium' | 'success' */
  const [step, setStep] = useState('choose');
  const [visitType, setVisitType] = useState('free');
  const [selectedDate, setSelectedDate] = useState(DATES[0]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [visitDesc, setVisitDesc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bookedVisit, setBookedVisit] = useState(null);

  const attr = property?.attributes || {};
  const hasPremium = attr.premiumVisit?.enable;
  const premiumPrice = attr.premiumVisit?.pricing;

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep('choose');
        setSelectedSlot(null);
        setError('');
        setBookedVisit(null);
      }, 350);
    }
  }, [isOpen]);

  // Fetch visit description once
  useEffect(() => {
    if (!isOpen || visitDesc) return;
    fetch(`${REAL_API}api/visit-description`)
      .then(r => r.json())
      .then(d => setVisitDesc(d?.data?.attributes))
      .catch(() => {});
  }, [isOpen, visitDesc]);

  // Fetch time slots when date changes (for free/premium step)
  useEffect(() => {
    if (step !== 'free' && step !== 'premium') return;
    const dateStr = selectedDate.toISOString().split('T')[0];
    setSlotsLoading(true);
    setSelectedSlot(null);
    const url = `${REAL_API}api/slot-availabilities?populate=*&filters[date][$eq]=${dateStr}`;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    fetch(url, { headers })
      .then(r => r.json())
      .then(d => setTimeSlots(d?.data?.[0]?.attributes?.time_slots?.data || []))
      .catch(() => setTimeSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, step, token]);

  const handleBookVisit = async () => {
    if (!selectedSlot) { setError('Please select a time slot.'); return; }
    if (!token || !user) { setError('Please sign in to schedule a visit.'); return; }
    setError('');
    setLoading(true);

    const currentStep = step; // 'free' | 'premium'

    try {
      if (currentStep === 'premium') {
        const loaded = await loadRazorpay();
        if (!loaded) { setError('Payment SDK failed to load.'); setLoading(false); return; }
      }

      // Call our server-side API (no secrets in browser)
      const res = await fetch('/api/visits/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitType: currentStep,
          propertyId,
          visitDate: selectedDate.toISOString().split('T')[0],
          timeSlotId: selectedSlot.id,
          timeSlotLabel: selectedSlot.attributes?.label || '',
          cityId: attr.city?.data?.id,
          locationId: attr.location?.data?.id,
          userId: user.id,
          token,
          amount: currentStep === 'premium' ? premiumPrice : 0,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to schedule visit');
      }

      const result = await res.json();

      // Free visit: done
      if (currentStep === 'free') {
        setBookedVisit(result.visitData?.data);
        setStep('success');
        setLoading(false);
        return;
      }

      // Premium visit: open Razorpay
      const { razorpayData, visitData } = result;
      const options = {
        key: RAZORPAY_KEY,
        amount: premiumPrice * 100,
        currency: 'INR',
        name: 'Provider — Premium Visit',
        description: `Premium Visit: ${attr.name}`,
        image: 'https://strapi-s3torage.s3.ap-south-1.amazonaws.com/logo_6a5d611d9f0b8c86a35e_66fad2b62a_c25f766ef4.png',
        order_id: razorpayData.id,
        prefill: { name: user?.full_name || '', contact: user?.username || '' },
        theme: { color: '#1350FF' },
        modal: {
          confirm_close: true,
          ondismiss: () => setLoading(false),
        },
        handler: async (data) => {
          try {
            await fetch('/api/visits/confirm', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                visitId: visitData?.data?.id,
                raz_payment_id: data.razorpay_payment_id,
                token,
              }),
            });
          } catch (_) {}
          setBookedVisit(visitData?.data);
          setStep('success');
          setLoading(false);
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => {
        setError('Payment failed. Please try again.');
        setLoading(false);
      });
      rzp.open();
    } catch (err) {
      setError(err.message || 'An error occurred. Please try again.');
      setLoading(false);
    }
  };

  const DateStrip = () => (
    <div className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-hide">
      {DATES.map((date, i) => {
        const isSelected = date.toDateString() === selectedDate.toDateString();
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = date.getDate();
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        return (
          <button
            key={i}
            onClick={() => setSelectedDate(date)}
            className={`flex flex-col items-center justify-center min-w-[52px] h-[68px] rounded-2xl border-2 flex-shrink-0 transition-all duration-150 ${
              isSelected
                ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-200'
                : 'bg-white border-gray-100 text-gray-600 hover:border-emerald-200'
            }`}
          >
            <span className={`text-[10px] uppercase font-bold ${isSelected ? 'text-emerald-100' : 'text-gray-400'}`}>{dayName}</span>
            <span className="text-base font-black">{dayNum}</span>
            <span className={`text-[10px] ${isSelected ? 'text-emerald-100' : 'text-gray-400'}`}>{month}</span>
          </button>
        );
      })}
    </div>
  );

  const TimeSlotGrid = ({ accentColor = 'emerald' }) => {
    if (slotsLoading) return (
      <div className="flex flex-col items-center py-10 text-gray-400">
        <FaSpinner className="animate-spin mb-2" size={24} />
        <p className="text-sm">Loading time slots...</p>
      </div>
    );
    if (!timeSlots.length) return (
      <div className="flex flex-col items-center py-10 text-gray-400 text-center">
        <FaClock size={40} className="text-gray-200 mb-3" />
        <p className="font-bold text-sm">No slots available for this date</p>
        <p className="text-xs mt-1">Try selecting a different date</p>
      </div>
    );
    return (
      <div className="grid grid-cols-3 gap-2">
        {timeSlots.map((slot) => {
          const isSelected = selectedSlot?.id === slot.id;
          return (
            <button
              key={slot.id}
              onClick={() => { setSelectedSlot(slot); setError(''); }}
              className={`relative py-2.5 px-1 rounded-xl border-2 text-xs font-bold transition-all duration-150 ${
                isSelected
                  ? accentColor === 'emerald'
                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-200'
                    : 'border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-200'
                  : 'border-gray-100 bg-white text-gray-700 hover:border-gray-300'
              }`}
            >
              {isSelected && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center ring-1 ring-white">
                  <FaCheckCircle size={9} className="text-white" />
                </span>
              )}
              {slot.attributes?.label}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[500] flex items-end sm:items-center sm:justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="relative w-full sm:max-w-lg sm:rounded-3xl max-h-[92vh] bg-white rounded-t-[28px] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* ── STEP: Choose Visit Type ─────────────────────────────────── */}
            <AnimatePresence mode="wait">
              {step === 'choose' && (
                <motion.div key="choose" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col">
                  {/* Handle */}
                  <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-4 flex-shrink-0" />
                  <div className="flex items-center justify-between px-5 pb-4 flex-shrink-0">
                    <div>
                      <h2 className="text-lg font-black text-gray-900">Schedule a Visit</h2>
                      <p className="text-xs text-gray-500">{attr.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
                      <FaTimes size={14} className="text-gray-600" />
                    </button>
                  </div>

                  <div className="px-5 pb-6 space-y-3">
                    {/* Free Visit */}
                    <button
                      onClick={() => { setVisitType('free'); setStep('free'); }}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-emerald-100 bg-emerald-50 hover:border-emerald-300 hover:bg-emerald-100 transition-all text-left group"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200 group-hover:scale-105 transition-transform">
                        <FaCalendarAlt className="text-white" size={20} />
                      </div>
                      <div className="flex-1">
                        <p className="font-black text-gray-900 text-base">Free Visit</p>
                        <p className="text-xs text-gray-500 mt-0.5">Complimentary property tour · No charges</p>
                      </div>
                      <span className="text-xs font-black text-emerald-600 bg-white border border-emerald-200 px-2.5 py-1.5 rounded-xl">FREE</span>
                    </button>

                    {/* Premium Visit (only if enabled) */}
                    {hasPremium && (
                      <button
                        onClick={() => { setVisitType('premium'); setStep('premium'); }}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 transition-all text-left group"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                          <FaStar className="text-yellow-300" size={20} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-black text-white text-base">Premium Visit</p>
                            <span className="text-[9px] font-black bg-yellow-300 text-gray-900 px-1.5 py-0.5 rounded-md">PRO</span>
                          </div>
                          <p className="text-xs text-indigo-200 mt-0.5">Enhanced tour · Priority assistance</p>
                        </div>
                        <span className="text-sm font-black text-white bg-white/20 border border-white/30 px-2.5 py-1.5 rounded-xl">₹{premiumPrice}</span>
                      </button>
                    )}

                    {!hasPremium && (
                      <p className="text-center text-xs text-gray-400 py-2">
                        Premium visit not available for this property.
                      </p>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── STEP: Free Visit Booking ───────────────────────────────── */}
              {(step === 'free' || step === 'premium') && (
                <motion.div key="booking" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col max-h-[92vh]">
                  {/* Header */}
                  <div className={`flex-shrink-0 ${step === 'free' ? 'bg-gradient-to-r from-emerald-500 to-emerald-600' : 'bg-gradient-to-r from-indigo-600 to-indigo-700'} p-5 text-white`}>
                    <div className="flex items-center gap-3 mb-1">
                      <button onClick={() => setStep('choose')} className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                        <FaChevronLeft size={12} />
                      </button>
                      <div className="flex items-center gap-2">
                        {step === 'free' ? <FaCalendarAlt size={18} /> : <FaStar size={18} className="text-yellow-300" />}
                        <h2 className="text-lg font-black">{step === 'free' ? 'Schedule Free Visit' : `Premium Visit · ₹${premiumPrice}`}</h2>
                      </div>
                      <button onClick={onClose} className="ml-auto p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                        <FaTimes size={12} />
                      </button>
                    </div>
                    <p className="text-xs opacity-75 ml-8">{attr.name}</p>
                  </div>

                  {/* Scrollable body */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 pb-32 space-y-5">
                    {/* Visit desc banner */}
                    {visitDesc && (
                      <div className={`text-xs rounded-xl px-4 py-3 border-l-4 leading-relaxed ${step === 'free' ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-indigo-50 border-indigo-400 text-indigo-800'}`}>
                        {step === 'free' ? visitDesc.freeVisitDescription : visitDesc.premiumVisitDescription}
                      </div>
                    )}

                    {/* Date strip */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <FaCalendarAlt size={14} className="text-gray-500" />
                        <span className="text-sm font-black text-gray-800">Select Date</span>
                      </div>
                      <DateStrip />
                    </div>

                    {/* Time slots */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <FaClock size={14} className="text-gray-500" />
                        <span className="text-sm font-black text-gray-800">Select Time Slot</span>
                        <span className="text-xs text-gray-400 font-normal ml-1">
                          ({selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
                        </span>
                      </div>
                      <TimeSlotGrid accentColor={step === 'free' ? 'emerald' : 'indigo'} />
                    </div>

                    {error && (
                      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-xs text-red-700 font-semibold">
                        {error}
                      </div>
                    )}
                  </div>

                  {/* Sticky bottom bar */}
                  <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-4 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
                    <div className="flex items-center gap-3">
                      <div className="text-sm">
                        {selectedSlot ? (
                          <div>
                            <p className="font-black text-gray-900">{selectedSlot.attributes?.label}</p>
                            <p className="text-xs text-gray-500">
                              {selectedDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </p>
                          </div>
                        ) : (
                          <p className="text-gray-400 text-xs font-medium">No time selected yet</p>
                        )}
                      </div>
                      <button
                        onClick={handleBookVisit}
                        disabled={loading || !selectedSlot}
                        className={`flex-1 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${
                          selectedSlot && !loading
                            ? step === 'free'
                              ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-200 active:scale-95 hover:from-emerald-600 hover:to-emerald-700'
                              : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-lg shadow-indigo-200 active:scale-95 hover:from-indigo-700 hover:to-indigo-800'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {loading
                          ? <><FaSpinner className="animate-spin" size={14} /> Processing...</>
                          : step === 'free' ? 'Book Free Visit →' : `Pay ₹${premiumPrice} & Book →`
                        }
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── STEP: Success ─────────────────────────────────────────── */}
              {step === 'success' && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center text-center p-8 py-12"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.1, type: 'spring', stiffness: 300 }}
                    className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-6"
                  >
                    <FaCheckCircle className="text-emerald-500" size={40} />
                  </motion.div>

                  <h2 className="text-2xl font-black text-gray-900 mb-2">Visit Scheduled!</h2>
                  <p className="text-gray-500 text-sm mb-6 px-4">
                    Your {visitType === 'free' ? 'free' : 'premium'} visit at <strong>{attr.name}</strong> has been confirmed.
                    Our team will reach out to you before your visit.
                  </p>

                  {selectedSlot && (
                    <div className="bg-gray-50 rounded-2xl p-4 w-full mb-6 space-y-2 text-left">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <FaCalendarAlt size={13} className="text-indigo-500" />
                        <span>
                          {selectedDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <FaClock size={13} className="text-indigo-500" />
                        <span>{selectedSlot.attributes?.label}</span>
                      </div>
                      {visitType === 'premium' && (
                        <div className="flex items-center gap-2 text-sm text-emerald-700">
                          <MdVerified size={15} className="text-emerald-500" />
                          <span className="font-bold">Payment confirmed — ₹{premiumPrice}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={onClose}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-black text-base shadow-lg shadow-indigo-200 active:scale-95 transition-all"
                  >
                    Done
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FaCheckCircle, FaHome, FaWhatsapp } from 'react-icons/fa';
import { motion } from 'framer-motion';

export default function BookingSuccessPage() {
  const router = useRouter();
  const { id } = useParams();
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('bookingId');
  const paymentId = searchParams.get('paymentId');

  const handleWhatsApp = () => {
    const message = `Hello! I have successfully booked property ID ${id}. My booking ID is ${bookingId} and payment ID is ${paymentId}. Please confirm my booking.`;
    window.open(`https://wa.me/917303831326?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-emerald-50 flex items-center justify-center p-6">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
        className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center"
      >
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 300 }}
          className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6"
        >
          <FaCheckCircle className="text-emerald-500" size={40} />
        </motion.div>

        <h1 className="text-2xl font-black text-gray-900 mb-2">Booking Confirmed!</h1>
        <p className="text-gray-500 text-sm mb-6">
          Your booking token has been received. Our team will contact you shortly to confirm your room.
        </p>

        {bookingId && (
          <div className="bg-gray-50 rounded-2xl p-4 mb-6 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Booking ID</span>
              <span className="font-black text-gray-900">#{bookingId}</span>
            </div>
            {paymentId && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Payment ID</span>
                <span className="font-bold text-gray-700 text-xs break-all">{paymentId}</span>
              </div>
            )}
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-sm text-amber-800 text-left">
          <p className="font-bold mb-1">📋 What&apos;s Next?</p>
          <ul className="text-xs space-y-1 text-amber-700">
            <li>• We&apos;ll verify your details and contact you within 24 hours</li>
            <li>• Remaining rent to be paid at time of check-in</li>
            <li>• Keep your booking ID handy</li>
          </ul>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleWhatsApp}
            className="w-full py-3.5 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-green-200"
          >
            <FaWhatsapp size={18} /> Confirm on WhatsApp
          </button>
          <Link
            href="/"
            className="block w-full py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all"
          >
            <FaHome size={16} /> Back to Home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

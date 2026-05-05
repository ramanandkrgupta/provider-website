import React, { useEffect, useState } from 'react';
import { Calendar, Clock, MapPin, Star } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '../../hooks/useAuth';

const ScheduledVisits = () => {
    const { user, token } = useAuth();
    const [visits, setVisits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const loadVisits = async () => {
            if (!user || !token) return;

            try {
                setLoading(true);
                const res = await fetch(`/api/visits/book?userId=${user.id}&token=${token}`);
                if (!res.ok) throw new Error('Failed to fetch scheduled visits');
                const result = await res.json();
                setVisits(result.data || []);
            } catch (err) {
                console.error("Failed to fetch scheduled visits:", err);
                setError("Failed to load scheduled visits.");
            } finally {
                setLoading(false);
            }
        };

        if (user && token) {
            loadVisits();
        }
    }, [user, token]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-10 text-red-500">
                {error}
            </div>
        );
    }

    if (visits.length === 0) {
        return (
            <div className="text-center py-10 text-gray-500">
                <p>No scheduled visits found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {visits.map((visit) => {
                const attr = visit.attributes;
                const property = attr.property?.data;
                const propertyAttr = property?.attributes;

                return (
                    <div key={visit.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                        <div className="flex flex-col sm:flex-row gap-4">
                            {/* Image Thumbnail */}
                            <div className="w-full sm:w-32 h-32 relative flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                                {propertyAttr?.images?.data?.[0]?.attributes?.url ? (
                                    <img
                                        src={propertyAttr.images.data[0].attributes.url}
                                        alt={propertyAttr.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                                        <MapPin size={24} />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-semibold text-lg text-gray-900">
                                        {propertyAttr?.name || 'Property Name Unavailable'}
                                    </h3>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                                            attr.visitType === 'premium' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                        }`}>
                                            {attr.visitType === 'premium' ? 'Premium Visit' : 'Free Visit'}
                                        </span>
                                        <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                                            attr.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                            attr.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                                'bg-yellow-100 text-yellow-800'
                                            }`}>
                                            {attr.status ? attr.status.charAt(0).toUpperCase() + attr.status.slice(1) : 'Pending'}
                                        </span>
                                    </div>
                                </div>

                                <p className="text-gray-500 text-sm mt-1 mb-3">
                                    {propertyAttr?.location?.data?.attributes?.name}, {propertyAttr?.city?.data?.attributes?.name}
                                </p>

                                <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                                    <div className="flex items-center gap-1">
                                        <Calendar size={16} className="text-indigo-500" />
                                        <span>{new Date(attr.visitDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock size={16} className="text-indigo-500" />
                                        <span>{attr.time_slot_label || attr.time_slot}</span>
                                    </div>
                                    {attr.visitType === 'premium' && (
                                        <div className="flex items-center gap-1 text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-md">
                                            <Star size={14} />
                                            <span>Payment: {attr.paymentStatus === 'paid' ? 'Paid' : 'Pending'}</span>
                                        </div>
                                    )}
                                </div>

                                {property?.id && (
                                    <div className="mt-4">
                                        <Link
                                            href={`/property/${property.id}`}
                                            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                                        >
                                            View Property Details &rarr;
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ScheduledVisits;

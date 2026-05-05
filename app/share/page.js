'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Head from 'next/head';

function ShareRedirect() {
  const searchParams = useSearchParams();
  const propertyId = searchParams.get('property');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    if (propertyId) {
      // Setup the fallback logic
      const isAndroid = /Android/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

      // Attempt to open the app via Intent or custom scheme
      if (isAndroid) {
        // Android intent to open the app directly
        const intentUrl = `intent://providerapp.in/share?property=${propertyId}#Intent;scheme=https;package=provider.in;S.browser_fallback_url=https://play.google.com/store/apps/details?id=provider.in;end;`;
        
        // Slight delay to allow UI to render before redirecting
        setTimeout(() => {
          window.location.href = intentUrl;
        }, 500);
      } else if (isIOS) {
        // Try to open using custom scheme or universal link for iOS
        const appUrl = `provider.in://property/${propertyId}`;
        
        setTimeout(() => {
          window.location.href = appUrl;
        }, 500);
      }
    }
  }, [propertyId]);

  if (!mounted) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-6">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Opening Provider App...
        </h1>
        
        <p className="text-gray-600 mb-8">
          You are being redirected to the property details in our app. If the app doesn't open automatically, please click below.
        </p>

        <div className="space-y-4">
          <a
            href="https://play.google.com/store/apps/details?id=provider.in"
            className="block w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
          >
            Download for Android
          </a>
          
          {propertyId && (
            <button
              onClick={() => {
                const isAndroid = /Android/i.test(navigator.userAgent);
                if (isAndroid) {
                  window.location.href = `intent://providerapp.in/share?property=${propertyId}#Intent;scheme=https;package=provider.in;end;`;
                } else {
                  window.location.href = `provider.in://property/${propertyId}`;
                }
              }}
              className="block w-full py-3 px-4 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
            >
              Open App Manually
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <>
      <Head>
        <title>Provider - Property Details</title>
        <meta name="description" content="Check out this property on Provider app" />
      </Head>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="animate-pulse flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500">Loading property details...</p>
          </div>
        </div>
      }>
        <ShareRedirect />
      </Suspense>
    </>
  );
}

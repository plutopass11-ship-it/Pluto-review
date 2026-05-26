'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import './login.css';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if already authenticated
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.status === 'approved') {
          const returnUrl = localStorage.getItem('parallax_return_url') || '/';
          window.location.href = returnUrl;
          return;
        }
        if (data.authenticated && data.status === 'pending') {
          window.location.href = '/pending-approval';
          return;
        }
        setLoading(false);
        loadGoogleScript();
      })
      .catch(() => {
        setLoading(false);
        loadGoogleScript();
      });
  }, []);

  function loadGoogleScript() {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogleSignIn;
    document.head.appendChild(script);
  }

  function initializeGoogleSignIn() {
    /* global google */
    google.accounts.id.initialize({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      callback: handleGoogleResponse,
    });
    google.accounts.id.renderButton(
      document.getElementById('google-signin-btn'),
      { theme: 'filled_black', size: 'large', width: 320, shape: 'pill', text: 'signin_with' }
    );
  }

  async function handleGoogleResponse(response) {
    setError('');
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: response.credential }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed. Please try again.');
        return;
      }

      if (data.status === 'approved') {
        const returnUrl = localStorage.getItem('parallax_return_url') || '/';
        window.location.href = returnUrl;
      } else if (data.status === 'pending') {
        window.location.href = '/pending-approval';
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    }
  }

  if (loading) {
    return <div className="login-page" />;
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <Image
            src="/parallax-icon.jpeg"
            alt="Parallax"
            width={64}
            height={64}
            priority
          />
        </div>
        <h1 className="login-brand">Parallax</h1>
        <p className="login-subtitle">Sign in to access your project review.</p>
        <hr className="login-divider" />
        <div id="google-signin-btn" className="google-signin-wrapper"></div>
        {error && <div className="login-error">{error}</div>}
        <p className="login-footer">Your access will be reviewed by an administrator.</p>
      </div>
    </div>
  );
}

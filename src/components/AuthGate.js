'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function AuthGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null); // 'approved' | 'pending' | 'rejected' | null
  const [userInfo, setUserInfo] = useState(null);

  useEffect(() => {
    const returnUrl = window.location.pathname + window.location.search;

    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => {
        if (!data.authenticated) {
          localStorage.setItem('parallax_return_url', returnUrl);
          window.location.href = '/login';
          return;
        }

        const user = {
          email: data.user?.email || '',
          name: data.user?.name || '',
          picture: data.user?.picture || '',
        };

        setUserInfo(user);
        setStatus(data.status);

        if (data.status === 'pending') {
          localStorage.setItem('parallax_return_url', returnUrl);
          window.location.href = '/pending-approval';
          return;
        }

        if (data.status === 'approved') {
          sessionStorage.setItem('parallax_user', JSON.stringify(user));
          setLoading(false);
        } else if (data.status === 'rejected') {
          setLoading(false);
        } else {
          // Unknown status — treat as unauthenticated
          localStorage.setItem('parallax_return_url', returnUrl);
          window.location.href = '/login';
        }
      })
      .catch(() => {
        localStorage.setItem('parallax_return_url', returnUrl);
        window.location.href = '/login';
      });
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-color)',
      }}>
        <Loader2
          size={32}
          style={{
            color: 'var(--accent-cyan)',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        background: 'var(--bg-color)',
      }}>
        <div className="glass-panel" style={{
          maxWidth: '440px',
          width: '100%',
          padding: '48px 40px',
          textAlign: 'center',
        }}>
          <div style={{
            width: 56,
            height: 56,
            margin: '0 auto 20px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
          }}>
            ✕
          </div>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '12px',
          }}>
            Access Denied
          </h2>
          <p style={{
            fontSize: '0.9rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}>
            Your access request has been denied by the administrator.
            Please contact the project owner if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  return children;
}

'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import './pending.css';

export default function PendingApprovalPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    checkAuthStatus();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  async function checkAuthStatus() {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();

      if (!data.authenticated) {
        window.location.href = '/login';
        return;
      }

      if (data.status === 'approved') {
        const returnUrl = localStorage.getItem('parallax_return_url') || '/';
        window.location.href = returnUrl;
        return;
      }

      setUser({
        name: data.user?.name || 'User',
        email: data.user?.email || '',
        picture: data.user?.picture || '',
      });
      setLoading(false);

      // Start polling every 5 seconds
      intervalRef.current = setInterval(pollStatus, 5000);
    } catch (err) {
      window.location.href = '/login';
    }
  }

  async function pollStatus() {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();

      if (!data.authenticated) {
        window.location.href = '/login';
        return;
      }

      if (data.status === 'approved') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        const returnUrl = localStorage.getItem('parallax_return_url') || '/';
        window.location.href = returnUrl;
      }
    } catch (err) {
      // Silently retry on next poll
    }
  }

  if (loading) {
    return <div className="pending-page" />;
  }

  return (
    <div className="pending-page">
      <div className="pending-card">
        <div className="pending-avatar">
          {user?.picture ? (
            <Image
              src={user.picture}
              alt={user.name}
              width={80}
              height={80}
              unoptimized
            />
          ) : (
            <div style={{
              width: 80,
              height: 80,
              background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              fontWeight: 600,
              color: '#fff',
            }}>
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
          )}
        </div>

        <div className="pending-user-info">
          <h2>{user?.name}</h2>
          <p>{user?.email}</p>
        </div>

        <div className="pending-status">
          <span className="pending-status-dot" />
          Awaiting Approval
        </div>

        <p className="pending-message">
          Your access request has been sent to the administrator.
          You will be redirected automatically once approved.
        </p>

        <div className="pending-spinner">
          <span className="pending-spinner-dot" />
          <span className="pending-spinner-dot" />
          <span className="pending-spinner-dot" />
        </div>
      </div>
    </div>
  );
}

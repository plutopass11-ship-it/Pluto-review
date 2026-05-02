'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker
            .register('/sw.js')
            .then((reg) => {
                console.log('Parallax SW registered:', reg.scope);
            })
            .catch((err) => {
                console.error('Parallax SW registration failed:', err);
            });
    }, []);

    return null;
}

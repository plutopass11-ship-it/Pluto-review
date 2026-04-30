import { Loader2 } from 'lucide-react';

export default function Loading() {
    return (
        <div style={{ display: 'flex', width: '100%', height: '100vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', color: '#64748b' }}>
            <Loader2 size={48} className="spin" style={{ opacity: 0.5 }} />
            <p style={{ fontSize: '1.2rem', fontWeight: 500 }}>Loading project data...</p>
        </div>
    );
}

import AuthGate from '@/components/AuthGate';

export default function SharedLayout({ children }) {
  return (
    <div className="shared-client-layout">
      <AuthGate>
        {children}
      </AuthGate>
    </div>
  );
}

export default function SharedLayout({ children }) {
  // This layout is intentionally minimal and does NOT include the sidebar
  return (
    <div className="shared-client-layout">
      {children}
    </div>
  );
}

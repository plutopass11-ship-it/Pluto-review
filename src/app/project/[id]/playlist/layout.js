/**
 * Playlist uses the parent layout — no custom layout needed.
 * The sidebar is hidden via CSS :has(.playlist-container) rules.
 */
export default function PlaylistLayout({ children }) {
    return <>{children}</>;
}

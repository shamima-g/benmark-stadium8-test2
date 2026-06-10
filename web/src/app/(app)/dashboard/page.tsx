/**
 * Dashboard (/dashboard) — Importer landing surface.
 *
 * Placeholder owned by Epic 1, Story 3 only to provide the role-specific
 * landing target that post-login routing redirects to (R1 §7) and that the
 * route-protection layer gates. The File Log list and dashboard content are
 * built by a later epic; this minimal page exists so the redirect resolves to a
 * real route and the protected shell has something to render.
 */
export default function DashboardPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Your File Log overview will appear here.
      </p>
    </div>
  );
}

import { AdminHeader } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="page-shell">
      <div className="grid gap-6 lg:grid-cols-[288px_minmax(0,1fr)]">
        <AdminSidebar />
        <div className="min-w-0 space-y-6">
          <AdminHeader />
          {children}
        </div>
      </div>
    </main>
  );
}

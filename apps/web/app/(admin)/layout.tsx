import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AdminAuthGuard } from "@/components/auth/admin-auth-guard";

export default function AdminLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <AdminAuthGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="min-w-0 flex-1 overflow-x-hidden bg-background p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </AdminAuthGuard>
  );
}

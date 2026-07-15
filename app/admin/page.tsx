import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { getAdminDashboardData } from "@/services/admin";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export default async function AdminPage() {
  await requireAdminSession();
  const dashboard = await getAdminDashboardData();
  const stats = dashboard.data;

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">
            Dashboard
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Panel SFSTORE</h1>
        </div>

        {dashboard.error ? (
          <div className="mt-8 rounded-3xl border border-[#8B5E3C]/20 bg-white/70 p-5 text-sm font-semibold text-[#8B5E3C]">
            {dashboard.error}
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Pedidos totales" value={stats.totalOrders.toString()} />
          <StatCard label="Pedidos pendientes" value={stats.pendingOrders.toString()} />
          <StatCard label="Ventas registradas" value={currencyFormatter.format(stats.registeredSales)} />
          <StatCard label="Productos activos" value={stats.activeProducts.toString()} />
        </div>

        <section className="mt-10 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-6 shadow-sm">
          <h2 className="text-2xl font-semibold">Ultimos 5 pedidos</h2>
          {stats.latestOrders.length === 0 ? (
            <p className="mt-4 text-sm text-[#1F1F1F]/60">
              Todavia no hay pedidos registrados.
            </p>
          ) : (
            <div className="mt-6 space-y-3">
              {stats.latestOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] p-4 md:flex-row md:items-center"
                >
                  <div>
                    <p className="font-semibold">{order.order_number}</p>
                    <p className="text-sm text-[#1F1F1F]/60">
                      {order.customers?.full_name ?? "Cliente sin nombre"}
                    </p>
                  </div>
                  <div className="text-sm font-semibold text-[#8B5E3C]">
                    {currencyFormatter.format(order.total)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm">
      <p className="text-sm font-semibold text-[#8B5E3C]">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}

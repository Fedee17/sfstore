import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { getAdminAnalyticsData } from "@/services/admin";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const paymentMethodLabels: Record<string, string> = {
  transfer: "Transferencia",
  mercadopago: "Mercado Pago",
};

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  paid: "Pagado",
  preparing: "En preparacion",
  shipped: "Enviado",
  completed: "Completado",
  cancelled: "Cancelado",
};

export default async function AdminAnalyticsPage() {
  await requireAdminSession();
  const analytics = await getAdminAnalyticsData();
  const data = analytics.data;

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex min-w-0 flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">
              Analytics
            </p>
            <h1 className="mt-3 break-words text-4xl font-semibold">
              Metricas comerciales
            </h1>
          </div>
          <p className="max-w-xl text-sm leading-6 text-[#1F1F1F]/65 md:text-right">
            Ventas reales: pedidos con pago aprobado o estado pagado/completado,
            excluyendo cancelados.
          </p>
        </div>

        {analytics.error ? (
          <div className="mt-8 rounded-3xl border border-[#8B5E3C]/20 bg-white/70 p-5 text-sm font-semibold text-[#8B5E3C]">
            {analytics.error}
          </div>
        ) : null}

        {data ? (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Ventas totales"
                value={currencyFormatter.format(data.totalSales)}
              />
              <MetricCard
                label="Ventas del mes"
                value={currencyFormatter.format(data.currentMonthSales)}
              />
              <MetricCard
                label="Pedidos pendientes"
                value={data.pendingOrders.toString()}
              />
              <MetricCard
                label="Ticket promedio"
                value={currencyFormatter.format(data.averageTicket)}
              />
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <Panel title="Productos mas vendidos">
                {data.topProducts.length === 0 ? (
                  <EmptyState text="Todavia no hay ventas aprobadas." />
                ) : (
                  <div className="space-y-3">
                    {data.topProducts.map((product) => (
                      <div
                        key={`${product.productSlug}-${product.productName}`}
                        className="grid min-w-0 gap-3 rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
                      >
                        <div className="min-w-0">
                          <p className="break-words font-semibold">
                            {product.productName}
                          </p>
                          <p className="mt-1 break-all text-xs text-[#1F1F1F]/50">
                            {product.productSlug}
                          </p>
                        </div>
                        <div className="text-sm font-semibold text-[#8B5E3C] sm:text-right">
                          <p>{product.quantity} vendidos</p>
                          <p>{currencyFormatter.format(product.total)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Stock bajo / sin stock">
                {data.lowStockProducts.length === 0 &&
                data.outOfStockProducts.length === 0 ? (
                  <EmptyState text="No hay productos con stock bajo." />
                ) : (
                  <div className="space-y-4">
                    <StockList
                      label="Sin stock"
                      products={data.outOfStockProducts}
                    />
                    <StockList
                      label="Stock bajo"
                      products={data.lowStockProducts}
                    />
                  </div>
                )}
              </Panel>

              <Panel title="Pedidos por estado">
                {data.ordersByStatus.length === 0 ? (
                  <EmptyState text="Todavia no hay pedidos registrados." />
                ) : (
                  <div className="space-y-3">
                    {data.ordersByStatus.map((status) => (
                      <SimpleRow
                        key={status.status}
                        label={statusLabels[status.status] ?? status.status}
                        value={`${status.orders} pedidos`}
                      />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Ventas por metodo de pago">
                {data.salesByPaymentMethod.length === 0 ? (
                  <EmptyState text="Todavia no hay ventas aprobadas." />
                ) : (
                  <div className="space-y-3">
                    {data.salesByPaymentMethod.map((payment) => (
                      <SimpleRow
                        key={payment.method}
                        label={
                          paymentMethodLabels[payment.method] ??
                          payment.method
                        }
                        value={`${payment.orders} pedidos · ${currencyFormatter.format(
                          payment.total,
                        )}`}
                      />
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-[#8B5E3C]/15 bg-white/75 p-5 shadow-sm">
      <p className="text-sm font-semibold text-[#8B5E3C]">{label}</p>
      <p className="mt-3 break-words text-3xl font-semibold">{value}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-6 shadow-sm">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] p-4 text-sm text-[#1F1F1F]/60">
      {text}
    </p>
  );
}

function SimpleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-2 rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] p-4 sm:flex-row sm:items-center">
      <p className="break-words font-semibold">{label}</p>
      <p className="break-words text-sm font-semibold text-[#8B5E3C] sm:text-right">
        {value}
      </p>
    </div>
  );
}

function StockList({
  label,
  products,
}: {
  label: string;
  products: {
    id: string;
    name: string;
    slug: string;
    stock: number;
    status: string;
  }[];
}) {
  if (products.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#8B5E3C]">
        {label}
      </p>
      <div className="mt-3 space-y-3">
        {products.map((product) => (
          <div
            key={product.id}
            className="grid min-w-0 gap-3 rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <div className="min-w-0">
              <p className="break-words font-semibold">{product.name}</p>
              <p className="mt-1 break-all text-xs text-[#1F1F1F]/50">
                {product.slug}
              </p>
            </div>
            <div className="text-sm font-semibold text-[#8B5E3C] sm:text-right">
              <p>{product.stock} unidades</p>
              <p>{statusLabels[product.status] ?? product.status}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

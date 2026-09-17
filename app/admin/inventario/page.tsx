import Link from "next/link";

import { AdminNav } from "@/components/admin/admin-nav";
import {
  GetNavigationForm,
  GetNavigationSubmitButton,
} from "@/components/admin/get-navigation-form";
import { requireAdminSession } from "@/lib/admin-session";
import {
  INVENTORY_MOVEMENT_TYPES,
  listInventoryMovements,
  type InventoryMovement,
  type InventoryMovementType,
} from "@/services/inventory";

type InventorySearchParams = Record<string, string | string[] | undefined>;

const movementLabels: Record<InventoryMovementType, string> = {
  purchase: "Compra",
  sale: "Venta",
  adjustment: "Ajuste",
  return: "Devolucion",
  reservation: "Reserva",
  release: "Liberacion",
};

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

function getParam(params: InventorySearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isMovementType(value: string): value is InventoryMovementType {
  return INVENTORY_MOVEMENT_TYPES.includes(value as InventoryMovementType);
}

function MovementReference({ movement }: { movement: InventoryMovement }) {
  if (movement.movement_type === "purchase" && movement.purchase_id) {
    return (
      <Link
        href={`/admin/compras/${movement.purchase_id}`}
        className="font-semibold text-[#556B2F] underline-offset-4 hover:underline"
      >
        {movement.purchases?.supplier_name_snapshot ?? "Ver compra"}
      </Link>
    );
  }

  if (movement.movement_type === "sale" && movement.order_id) {
    return (
      <span>
        Pedido {movement.orders?.order_number ?? movement.order_id.slice(0, 8)}
      </span>
    );
  }

  return <span>-</span>;
}

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams?: Promise<InventorySearchParams>;
}) {
  await requireAdminSession();
  const params = searchParams ? await searchParams : {};
  const search = getParam(params, "search").trim();
  const product = getParam(params, "product").trim();
  const typeParam = getParam(params, "type").trim();
  const from = getParam(params, "from").trim();
  const to = getParam(params, "to").trim();
  const type = isMovementType(typeParam) ? typeParam : undefined;
  const result = await listInventoryMovements({
    search: search || undefined,
    productId: product || undefined,
    type,
    from: from || undefined,
    to: to || undefined,
  });
  const movements = result.data ?? [];
  const hasFilters = Boolean(search || product || type || from || to);

  return (
    <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
      <AdminNav />
      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">
          Admin
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Inventario</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#1F1F1F]/60">
          El stock del producto es el saldo operativo actual. Este historial refleja
          los movimientos realmente registrados; no reconstruye cambios anteriores.
        </p>

        <GetNavigationForm className="mt-8 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm">
          {product ? <input type="hidden" name="product" value={product} /> : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5 xl:items-end">
            <label className="grid gap-2 xl:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
                Buscar producto
              </span>
              <input
                name="search"
                defaultValue={search}
                placeholder="Nombre, slug o SKU"
                className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 text-sm outline-none transition focus:border-[#556B2F]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
                Tipo
              </span>
              <select
                name="type"
                defaultValue={type ?? ""}
                className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 text-sm outline-none transition focus:border-[#556B2F]"
              >
                <option value="">Todos</option>
                {INVENTORY_MOVEMENT_TYPES.map((movementType) => (
                  <option key={movementType} value={movementType}>
                    {movementLabels[movementType]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
                Desde
              </span>
              <input
                name="from"
                type="date"
                defaultValue={from}
                className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 text-sm outline-none transition focus:border-[#556B2F]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8B5E3C]">
                Hasta
              </span>
              <input
                name="to"
                type="date"
                defaultValue={to}
                className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 text-sm outline-none transition focus:border-[#556B2F]"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <GetNavigationSubmitButton
              pendingLabel="Filtrando..."
              className="h-12 rounded-2xl bg-[#556B2F] px-6 text-sm font-semibold text-white transition hover:bg-[#465826] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Aplicar filtros
            </GetNavigationSubmitButton>
            {hasFilters ? (
              <Link
                href="/admin/inventario"
                className="flex h-12 items-center rounded-2xl border border-[#8B5E3C]/30 px-6 text-sm font-semibold text-[#8B5E3C] transition hover:border-[#8B5E3C]"
              >
                Limpiar
              </Link>
            ) : null}
          </div>
        </GetNavigationForm>

        {result.error ? (
          <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {result.error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3 text-sm text-[#1F1F1F]/60">
          <span className="rounded-full border border-[#8B5E3C]/15 bg-white/60 px-4 py-2">
            {movements.length} movimiento{movements.length === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border border-[#8B5E3C]/15 bg-white/60 px-4 py-2">
            Se muestran hasta 200 movimientos recientes
          </span>
        </div>

        {movements.length === 0 ? (
          <div className="mt-8 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold">Sin movimientos</h2>
            <p className="mt-3 text-sm text-[#1F1F1F]/60">
              No hay movimientos registrados con estos filtros.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-3">
            {movements.map((movement) => (
              <article
                key={movement.id}
                className="grid gap-4 rounded-3xl border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm lg:grid-cols-[1.15fr_0.55fr_0.55fr_0.8fr_1.2fr] lg:items-center"
              >
                <div className="min-w-0">
                  <p className="break-words font-semibold">
                    {movement.products?.name ?? "Producto no disponible"}
                  </p>
                  <p className="mt-1 text-xs text-[#1F1F1F]/50">
                    {dateFormatter.format(new Date(movement.created_at))}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.08em] text-[#1F1F1F]/45">Tipo</p>
                  <p className="mt-1 font-semibold text-[#8B5E3C]">
                    {movementLabels[movement.movement_type]}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.08em] text-[#1F1F1F]/45">Cantidad</p>
                  <p className="mt-1 font-semibold">{movement.quantity}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.08em] text-[#1F1F1F]/45">Saldo</p>
                  <p className="mt-1 font-semibold">
                    {movement.previous_stock} → {movement.new_stock}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#1F1F1F]/45">Motivo / referencia</p>
                  <p className="mt-1 break-words text-sm">
                    {movement.reason || "Sin motivo"}
                  </p>
                  <p className="mt-1 break-words text-xs text-[#1F1F1F]/55">
                    <MovementReference movement={movement} />
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

import "server-only";

import { requireAdminSession } from "@/lib/admin-session";
import { buildGlobalSearch } from "@/lib/admin/global-search";
import { getAdminProducts } from "@/services/admin";
import { getCommercialList } from "@/services/commercial-history";
import { listCustomerOrders } from "@/services/customer-orders";
import { listSuppliers } from "@/services/suppliers";

/** Searches every admin module with its own existing search; each module succeeds or fails on its own. */
export async function searchAdmin(term: string) {
  await requireAdminSession();
  const [products, orders, sales, purchases, suppliers] = await Promise.allSettled([
    getAdminProducts({ search: term }).then(result => { if (result.error) throw new Error("PRODUCTS_SEARCH_FAILED"); return result.data ?? []; }),
    listCustomerOrders({ search: term }),
    getCommercialList({ kind: "sales", search: term }).then(result => result.sales),
    getCommercialList({ kind: "purchases", search: term }).then(result => result.purchases),
    listSuppliers({ search: term }),
  ]);
  return buildGlobalSearch(term, { products, orders, sales, purchases, suppliers });
}

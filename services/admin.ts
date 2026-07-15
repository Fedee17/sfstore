import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type AdminCustomer = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  province: string | null;
  city: string | null;
  address: string | null;
  postal_code: string | null;
};

export type AdminOrderItem = {
  id: string;
  product_name: string;
  product_slug: string;
  category_name: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
};

export type AdminOrder = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  shipping_method: string;
  shipping_carrier: string | null;
  shipping_province: string | null;
  shipping_city: string | null;
  shipping_address: string | null;
  shipping_postal_code: string | null;
  subtotal: number;
  discount: number;
  shipping_cost: number;
  total: number;
  notes: string | null;
  created_at: string;
  customers: AdminCustomer | null;
  order_items?: AdminOrderItem[];
};

export type AdminProduct = {
  id: string;
  category_id?: string;
  name: string;
  slug: string;
  short_description?: string;
  description?: string | null;
  status: string;
  price: number;
  transfer_price?: number | null;
  compare_at_price?: number | null;
  cost?: number | null;
  stock: number;
  sku?: string | null;
  featured: boolean;
  categories: {
    name: string;
    slug: string;
  } | null;
  product_attributes?: {
    id: string;
    name: string;
    value: string;
    sort_order: number;
  }[];
  product_images?: {
    id: string;
    url: string;
    alt: string | null;
    sort_order: number;
    is_primary: boolean;
  }[];
};

export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

export type AdminProductFilters = {
  search?: string;
  category?: string;
  status?: string;
  stock?: "low" | "out";
  featured?: boolean;
};

export type AdminResult<T> = {
  data: T | null;
  error: string | null;
};

export type AdminAnalyticsData = {
  totalSales: number;
  currentMonthSales: number;
  totalOrders: number;
  pendingOrders: number;
  paidOrders: number;
  averageTicket: number;
  topProducts: {
    productName: string;
    productSlug: string;
    quantity: number;
    total: number;
  }[];
  lowStockProducts: {
    id: string;
    name: string;
    slug: string;
    stock: number;
    status: string;
  }[];
  outOfStockProducts: {
    id: string;
    name: string;
    slug: string;
    stock: number;
    status: string;
  }[];
  salesByPaymentMethod: {
    method: string;
    orders: number;
    total: number;
  }[];
  ordersByStatus: {
    status: string;
    orders: number;
  }[];
};

type RelationOne<T> = T | T[] | null;

type AdminOrderRow = Omit<AdminOrder, "customers"> & {
  customers: RelationOne<AdminCustomer>;
};

type AdminProductCategory = {
  name: string;
  slug: string;
};

type AdminProductAttribute = NonNullable<AdminProduct["product_attributes"]>[number];
type AdminProductImage = NonNullable<AdminProduct["product_images"]>[number];

type AdminProductRow = Omit<
  AdminProduct,
  "categories" | "product_attributes" | "product_images"
> & {
  categories: RelationOne<AdminProductCategory>;
  product_attributes?: AdminProductAttribute[] | null;
  product_images?: AdminProductImage[] | null;
};

function firstRelation<T>(relation: RelationOne<T>) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function normalizeAdminOrder(row: AdminOrderRow): AdminOrder {
  return {
    ...row,
    customers: firstRelation(row.customers),
  };
}

function normalizeAdminProduct(row: AdminProductRow): AdminProduct {
  return {
    ...row,
    categories: firstRelation(row.categories),
    product_attributes: row.product_attributes ?? undefined,
    product_images: row.product_images ?? undefined,
  };
}

async function safeRead<T>(read: () => Promise<T>): Promise<AdminResult<T>> {
  try {
    return { data: await read(), error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "No se pudieron leer los datos de Supabase.",
    };
  }
}

export async function getAdminOrders(): Promise<AdminResult<AdminOrder[]>> {
  return safeRead(async () => {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        status,
        payment_method,
        payment_status,
        shipping_method,
        shipping_carrier,
        shipping_province,
        shipping_city,
        shipping_address,
        shipping_postal_code,
        subtotal,
        discount,
        shipping_cost,
        total,
        notes,
        created_at,
        customers (
          id,
          full_name,
          phone,
          email,
          province,
          city,
          address,
          postal_code
        ),
        order_items (
          id,
          product_name,
          product_slug,
          category_name,
          unit_price,
          quantity,
          subtotal
        )
      `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return ((data ?? []) as unknown as AdminOrderRow[]).map(normalizeAdminOrder);
  });
}

export async function getAdminProducts(
  filters: AdminProductFilters = {},
): Promise<AdminResult<AdminProduct[]>> {
  return safeRead(async () => {
    const supabase = getSupabaseAdminClient();
    let query = supabase
      .from("products")
      .select(
        `
        id,
        category_id,
        name,
        slug,
        short_description,
        description,
        status,
        price,
        transfer_price,
        compare_at_price,
        cost,
        stock,
        sku,
        featured,
        categories (
          name,
          slug
        ),
        product_images (
          id,
          url,
          alt,
          sort_order,
          is_primary
        )
      `,
      )
      .order("created_at", { ascending: false });

    const search = filters.search?.trim();

    if (search) {
      const escapedSearch = search.replaceAll("%", "\\%").replaceAll("_", "\\_");
      query = query.or(
        `name.ilike.%${escapedSearch}%,slug.ilike.%${escapedSearch}%,sku.ilike.%${escapedSearch}%`,
      );
    }

    if (filters.category) {
      query = query.eq("category_id", filters.category);
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    if (filters.stock === "out") {
      query = query.eq("stock", 0);
    }

    if (filters.stock === "low") {
      query = query.gt("stock", 0).lte("stock", 3);
    }

    if (filters.featured) {
      query = query.eq("featured", true);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    return ((data ?? []) as unknown as AdminProductRow[]).map(
      normalizeAdminProduct,
    );
  });
}

export async function getAdminCategories(): Promise<AdminResult<AdminCategory[]>> {
  return safeRead(async () => {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug, is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as AdminCategory[];
  });
}

export async function getAdminProductById(
  id: string,
): Promise<AdminResult<AdminProduct | null>> {
  return safeRead(async () => {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        id,
        category_id,
        name,
        slug,
        short_description,
        description,
        status,
        price,
        transfer_price,
        compare_at_price,
        cost,
        stock,
        sku,
        featured,
        categories (
          name,
          slug
        ),
        product_attributes (
          id,
          name,
          value,
          sort_order
        ),
        product_images (
          id,
          url,
          alt,
          sort_order,
          is_primary
        )
      `,
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data
      ? normalizeAdminProduct(data as unknown as AdminProductRow)
      : null;
  });
}

export async function getAdminDashboardData() {
  const [ordersResult, productsResult] = await Promise.all([
    getAdminOrders(),
    getAdminProducts(),
  ]);

  const orders = ordersResult.data ?? [];
  const products = productsResult.data ?? [];

  return {
    data: {
      totalOrders: orders.length,
      pendingOrders: orders.filter((order) => order.status === "pending")
        .length,
      registeredSales: orders.reduce((total, order) => total + order.total, 0),
      activeProducts: products.filter((product) => product.status === "active")
        .length,
      latestOrders: orders.slice(0, 5),
    },
    error: ordersResult.error ?? productsResult.error,
  };
}

function isRealSale(order: AdminOrder) {
  if (order.status === "cancelled") {
    return false;
  }

  return (
    order.payment_status === "approved" ||
    order.status === "paid" ||
    order.status === "completed"
  );
}

function isSameCurrentMonth(dateValue: string, currentDate = new Date()) {
  const date = new Date(dateValue);

  return (
    date.getFullYear() === currentDate.getFullYear() &&
    date.getMonth() === currentDate.getMonth()
  );
}

function addToGroupedTotal<T extends string>(
  grouped: Map<T, { orders: number; total: number }>,
  key: T,
  total: number,
) {
  const current = grouped.get(key) ?? { orders: 0, total: 0 };
  grouped.set(key, {
    orders: current.orders + 1,
    total: current.total + total,
  });
}

export async function getAdminAnalyticsData(): Promise<
  AdminResult<AdminAnalyticsData>
> {
  return safeRead(async () => {
    const [ordersResult, productsResult] = await Promise.all([
      getAdminOrders(),
      getAdminProducts(),
    ]);

    if (ordersResult.error) {
      throw new Error(ordersResult.error);
    }

    if (productsResult.error) {
      throw new Error(productsResult.error);
    }

    const orders = ordersResult.data ?? [];
    const products = productsResult.data ?? [];
    const realSalesOrders = orders.filter(isRealSale);
    const totalSales = realSalesOrders.reduce(
      (total, order) => total + order.total,
      0,
    );
    const currentMonthSales = realSalesOrders
      .filter((order) => isSameCurrentMonth(order.created_at))
      .reduce((total, order) => total + order.total, 0);
    const pendingOrders = orders.filter((order) => order.status === "pending")
      .length;
    const paidOrders = realSalesOrders.length;
    const productSales = new Map<
      string,
      {
        productName: string;
        productSlug: string;
        quantity: number;
        total: number;
      }
    >();
    const salesByPaymentMethod = new Map<
      string,
      { orders: number; total: number }
    >();
    const ordersByStatus = new Map<string, { orders: number }>();

    for (const order of orders) {
      const statusCount = ordersByStatus.get(order.status) ?? { orders: 0 };
      ordersByStatus.set(order.status, { orders: statusCount.orders + 1 });

      if (!isRealSale(order)) {
        continue;
      }

      addToGroupedTotal(salesByPaymentMethod, order.payment_method, order.total);

      for (const item of order.order_items ?? []) {
        const key = item.product_slug || item.product_name;
        const current = productSales.get(key) ?? {
          productName: item.product_name,
          productSlug: item.product_slug,
          quantity: 0,
          total: 0,
        };

        productSales.set(key, {
          ...current,
          quantity: current.quantity + item.quantity,
          total: current.total + item.subtotal,
        });
      }
    }

    const stockProducts = products.filter(
      (product) => product.status !== "archived",
    );

    return {
      totalSales,
      currentMonthSales,
      totalOrders: orders.length,
      pendingOrders,
      paidOrders,
      averageTicket: paidOrders > 0 ? totalSales / paidOrders : 0,
      topProducts: Array.from(productSales.values())
        .sort((left, right) => right.quantity - left.quantity)
        .slice(0, 8),
      lowStockProducts: stockProducts
        .filter((product) => product.stock > 0 && product.stock <= 3)
        .sort((left, right) => left.stock - right.stock)
        .slice(0, 8)
        .map((product) => ({
          id: product.id,
          name: product.name,
          slug: product.slug,
          stock: product.stock,
          status: product.status,
        })),
      outOfStockProducts: stockProducts
        .filter((product) => product.stock === 0)
        .sort((left, right) => left.name.localeCompare(right.name))
        .slice(0, 8)
        .map((product) => ({
          id: product.id,
          name: product.name,
          slug: product.slug,
          stock: product.stock,
          status: product.status,
        })),
      salesByPaymentMethod: Array.from(salesByPaymentMethod.entries()).map(
        ([method, data]) => ({
          method,
          orders: data.orders,
          total: data.total,
        }),
      ),
      ordersByStatus: Array.from(ordersByStatus.entries()).map(
        ([status, data]) => ({
          status,
          orders: data.orders,
        }),
      ),
    };
  });
}

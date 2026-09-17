export const MAX_MONEY_CENTS = 999_999_999_999;
export const MAX_PURCHASE_QUANTITY = 1_000_000;

export type PurchaseCalculationLineInput = {
  productId: string;
  quantity: number;
  unitPurchaseCost: string;
};

export type PurchaseCalculationLine = PurchaseCalculationLineInput & {
  unitPurchaseCostCents: number;
  supplierLineTotalCents: number;
  allocatedShippingTotalCents: number;
  allocatedShippingPerUnitMicros: number;
  effectiveUnitCostCents: number;
  effectiveLineTotalCents: number;
};

export type PurchaseCalculation = {
  lines: PurchaseCalculationLine[];
  supplierSubtotalCents: number;
  shippingCostCents: number;
  totalCostCents: number;
  totalUnits: number;
};

function checkedNumber(value: bigint, fieldName: string) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} supera el rango numerico seguro.`);
  }

  return Number(value);
}

function roundDivision(numerator: bigint, denominator: bigint) {
  return (numerator + denominator / BigInt(2)) / denominator;
}

export function parseMoneyToCents(value: string, fieldName = "Importe") {
  const normalized = value.trim().replace(",", ".");

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${fieldName} debe ser un importe positivo con hasta 2 decimales.`);
  }

  const [wholePart, decimalPart = ""] = normalized.split(".");
  const cents =
    BigInt(wholePart) * BigInt(100) + BigInt(decimalPart.padEnd(2, "0"));

  if (cents > BigInt(MAX_MONEY_CENTS)) {
    throw new Error(`${fieldName} supera el maximo permitido.`);
  }

  return Number(cents);
}

export function centsToDatabaseMoney(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error("El importe interno debe expresarse en centavos enteros.");
  }

  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function calculatePurchaseDraft({
  lines,
  shippingCost,
}: {
  lines: PurchaseCalculationLineInput[];
  shippingCost: string;
}): PurchaseCalculation {
  if (lines.length === 0) {
    throw new Error("La compra debe tener al menos un producto.");
  }

  const seenProductIds = new Set<string>();
  const parsedLines = lines.map((line, index) => {
    const productId = line.productId.trim();

    if (!productId) {
      throw new Error(`Falta el producto en la linea ${index + 1}.`);
    }

    if (seenProductIds.has(productId)) {
      throw new Error("No se puede repetir un producto en la misma compra.");
    }

    seenProductIds.add(productId);

    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > MAX_PURCHASE_QUANTITY
    ) {
      throw new Error(`La cantidad de la linea ${index + 1} no es valida.`);
    }

    const unitPurchaseCostCents = parseMoneyToCents(
      line.unitPurchaseCost,
      `Costo de la linea ${index + 1}`,
    );
    const supplierLineTotal =
      BigInt(unitPurchaseCostCents) * BigInt(line.quantity);

    if (supplierLineTotal > BigInt(MAX_MONEY_CENTS)) {
      throw new Error(`El total de la linea ${index + 1} supera el maximo permitido.`);
    }

    return {
      ...line,
      productId,
      unitPurchaseCostCents,
      supplierLineTotalCents: Number(supplierLineTotal),
      originalIndex: index,
    };
  });

  const shippingCostCents = parseMoneyToCents(shippingCost, "Costo de envio");
  const totalUnits = parsedLines.reduce(
    (total, line) => total + line.quantity,
    0,
  );
  const totalUnitsBigInt = BigInt(totalUnits);
  const allocations = parsedLines.map((line) => {
    const numerator = BigInt(shippingCostCents) * BigInt(line.quantity);

    return {
      productId: line.productId,
      originalIndex: line.originalIndex,
      baseCents: numerator / totalUnitsBigInt,
      remainder: numerator % totalUnitsBigInt,
    };
  });
  const floorTotal = allocations.reduce(
    (total, allocation) => total + allocation.baseCents,
    BigInt(0),
  );
  const centsToDistribute = BigInt(shippingCostCents) - floorTotal;
  const allocationOrder = [...allocations].sort((first, second) => {
    if (first.remainder !== second.remainder) {
      return first.remainder > second.remainder ? -1 : 1;
    }

    const productOrder = first.productId.localeCompare(second.productId);
    return productOrder || first.originalIndex - second.originalIndex;
  });
  const awardedIndexes = new Set(
    allocationOrder
      .slice(0, Number(centsToDistribute))
      .map((allocation) => allocation.originalIndex),
  );

  const resultLines = parsedLines.map((line) => {
    const allocation = allocations[line.originalIndex];
    const allocatedShipping =
      allocation.baseCents +
      (awardedIndexes.has(line.originalIndex) ? BigInt(1) : BigInt(0));
    const effectiveLineTotal =
      BigInt(line.supplierLineTotalCents) + allocatedShipping;
    const quantity = BigInt(line.quantity);

    return {
      productId: line.productId,
      quantity: line.quantity,
      unitPurchaseCost: line.unitPurchaseCost,
      unitPurchaseCostCents: line.unitPurchaseCostCents,
      supplierLineTotalCents: line.supplierLineTotalCents,
      allocatedShippingTotalCents: checkedNumber(
        allocatedShipping,
        "Envio asignado",
      ),
      allocatedShippingPerUnitMicros: checkedNumber(
        roundDivision(allocatedShipping * BigInt(10_000), quantity),
        "Envio unitario",
      ),
      effectiveUnitCostCents: checkedNumber(
        roundDivision(effectiveLineTotal, quantity),
        "Costo efectivo unitario",
      ),
      effectiveLineTotalCents: checkedNumber(
        effectiveLineTotal,
        "Costo efectivo de linea",
      ),
    };
  });
  const supplierSubtotalCents = resultLines.reduce(
    (total, line) => total + line.supplierLineTotalCents,
    0,
  );
  const totalCostCents = supplierSubtotalCents + shippingCostCents;

  if (supplierSubtotalCents > MAX_MONEY_CENTS || totalCostCents > MAX_MONEY_CENTS) {
    throw new Error("El total de la compra supera el maximo permitido.");
  }

  const allocatedShippingTotal = resultLines.reduce(
    (total, line) => total + line.allocatedShippingTotalCents,
    0,
  );

  if (allocatedShippingTotal !== shippingCostCents) {
    throw new Error("No se pudo reconciliar exactamente el costo de envio.");
  }

  return {
    lines: resultLines,
    supplierSubtotalCents,
    shippingCostCents,
    totalCostCents,
    totalUnits,
  };
}

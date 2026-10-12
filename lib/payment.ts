export const transferPayment = {
  alias: process.env.NEXT_PUBLIC_TRANSFER_ALIAS ?? "fedearmando.21",
  holder: process.env.NEXT_PUBLIC_TRANSFER_HOLDER ?? "Federico Ezequiel Armando",
  provider: process.env.NEXT_PUBLIC_TRANSFER_PROVIDER ?? "Naranja X",
  taxId: process.env.NEXT_PUBLIC_TRANSFER_TAX_ID ?? "20-44606930-0",
  note: "Reemplazar/verificar datos reales antes de lanzar.",
} as const;

const location = {
  streetAddress: "Juan de Garay 2090",
  addressLocality: "San Francisco",
  addressRegion: "Córdoba",
  addressCountry: "AR",
} as const;

export const brand = {
  name: "SFSTORE Importados",
  categories: ["Perfumes", "Mates"],
  whatsapp: "3564646475",
  instagram: "sfstore.importados",
  location,
  address: `${location.streetAddress}, ${location.addressLocality}, ${location.addressRegion}, Argentina`,
  hours: "Lunes a sábado, de 17:30 a 20:30 hs",
  openingHours: { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], opens: "17:30", closes: "20:30" },
  priceRange: "$2.000–$150.000",
  colors: {
    primary: "#0072CE",
    deepBlue: "#003B73",
    accentRed: "#E52620",
    background: "#F7F9FC",
    surface: "#FFFFFF",
    text: "#102033",
    muted: "#EEF2F6",
    border: "#DCE3EA",
    whatsapp: "#25D366",
    // Colores legacy mantenidos temporalmente para compatibilidad con partes no públicas/admin.
    olive: "#0072CE",
    leather: "#003B73",
    cream: "#F7F9FC",
    softBlack: "#102033",
  },
} as const;

export const brandLinks = {
  whatsapp: `https://wa.me/549${brand.whatsapp}`,
  instagram: `https://instagram.com/${brand.instagram}`,
  maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(brand.address)}`,
} as const;

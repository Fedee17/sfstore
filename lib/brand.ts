export const brand = {
  name: "SFSTORE Importados",
  categories: ["Perfumes", "Mates"],
  whatsapp: "3564646475",
  instagram: "sfstore.importados",
  address: "Juan de Garay 2090, Cordoba, Argentina",
  hours: "17:00 a 21:00 hs",
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
  maps: "https://www.google.com/maps/search/?api=1&query=Juan%20de%20Garay%202090%2C%20Cordoba%2C%20Argentina",
} as const;

import { buildWhatsAppUrl } from "@/lib/whatsapp";

export function WhatsAppFloatingButton() {
  const href = buildWhatsAppUrl(
    "Hola SFSTORE, quiero hacer una consulta desde la web.",
  );

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Consultar por WhatsApp"
      className="fixed bottom-5 right-4 z-50 inline-flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 text-sm font-semibold text-white shadow-xl shadow-[#102033]/20 transition hover:bg-[#1DA851] focus:outline-none focus:ring-2 focus:ring-[#0072CE] focus:ring-offset-2 focus:ring-offset-[#F7F9FC] sm:right-6 sm:px-5"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-6 w-6 shrink-0"
        fill="currentColor"
      >
        <path d="M20.52 3.48A11.82 11.82 0 0 0 12.1 0C5.57 0 .25 5.32.25 11.86c0 2.09.55 4.14 1.59 5.95L.15 24l6.34-1.66a11.88 11.88 0 0 0 5.61 1.43h.01c6.54 0 11.86-5.32 11.86-11.86 0-3.17-1.23-6.15-3.45-8.43Zm-8.41 18.28h-.01a9.84 9.84 0 0 1-5.01-1.37l-.36-.21-3.76.99 1-3.67-.24-.38a9.83 9.83 0 0 1-1.5-5.26c0-5.43 4.42-9.85 9.86-9.85 2.63 0 5.1 1.03 6.96 2.89a9.8 9.8 0 0 1 2.88 6.96c0 5.44-4.42 9.86-9.82 9.86Zm5.4-7.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.48-1.76-1.65-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.91-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.87 1.21 3.07c.15.2 2.09 3.19 5.07 4.47.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
      </svg>
      <span className="hidden sm:inline">WhatsApp</span>
    </a>
  );
}


import type { MetadataRoute } from "next";

// Faz o site virar "app": dá para instalar no celular, tablet e computador.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OS digital GC — Gabriel Campos",
    short_name: "GC Lab",
    description: "Ordens de serviço, quadro de etapas e financeiro do laboratório Gabriel Campos.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

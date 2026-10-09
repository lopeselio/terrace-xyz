import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Terrace",
    short_name: "Terrace",
    description: "Predict the scores. Beat your mates. Keep your record.",
    start_url: "/",
    display: "standalone",
    background_color: "#F7F8F5",
    theme_color: "#7A1F3D",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

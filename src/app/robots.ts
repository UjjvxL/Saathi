import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private, signed-in areas and one-time links are never indexed.
        disallow: ["/api/", "/dashboard", "/p/", "/profiles/", "/join", "/confirm", "/reset-password"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}

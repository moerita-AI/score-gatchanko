import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/score-gatchanko/",
    },
    sitemap: "https://moerita-ai.github.io/score-gatchanko/sitemap.xml",
  };
}

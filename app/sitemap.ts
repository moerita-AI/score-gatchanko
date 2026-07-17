import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://moerita-ai.github.io/score-gatchanko/",
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}

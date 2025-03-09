import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  return [
    {
      url: `${baseUrl}/es-AR`,
      lastModified: new Date(),
      alternates: {
        languages: {
          "es-AR": `${baseUrl}/es-AR`,
          "en-US": `${baseUrl}/en-US`,
        },
      },
    },
    {
      url: `${baseUrl}/es-AR/community`,
      lastModified: new Date(),
      alternates: {
        languages: {
          "es-AR": `${baseUrl}/es-AR/community`,
          "en-US": `${baseUrl}/en-US/community`,
        },
      },
    },
    {
      url: `${baseUrl}/es-AR/come-meet-us`,
      lastModified: new Date(),
      alternates: {
        languages: {
          "es-AR": `${baseUrl}/es-AR/come-meet-us`,
          "en-US": `${baseUrl}/en-US/come-meet-us`,
        },
      },
    },
  ];
}

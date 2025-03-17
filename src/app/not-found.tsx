import { routing } from "@src/i18n/routing";
import { getLocale, getTranslations } from "next-intl/server";
import { Nunito_Sans } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
});

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations("notFound");

  return (
    <html lang={routing.defaultLocale}>
      <body className={`${nunitoSans.variable} font-sans antialiased`}>
        <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 bg-white">
          <div className="max-w-lg p-8 bg-white shadow-lg rounded-lg">
            <div className="flex justify-center mb-8">
              <Image
                src="/assets/img/redentor_logo.png"
                className="h-24 w-24 dark:invert dark:mix-blend-luminosity"
                width={96}
                height={96}
                alt="Redentor church logo"
                priority
              />
            </div>
            <h1 className="text-4xl font-bold mb-4 text-gray-900">
              {t("title")}
            </h1>
            <p className="mb-8 text-lg text-gray-600">
              {t("description")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                key={locale}
                href={`/${locale}`}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {t("backToHome")}
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

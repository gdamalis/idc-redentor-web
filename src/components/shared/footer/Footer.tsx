import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Mail, MapPin } from "lucide-react";

import { SubscribeForm } from "@src/components/shared/subscribe-form/SubscribeForm";
import SocialLinks from "../social-links/SocialLinks";
import packageJson from "../../../../package.json";

type FooterProps = {
  content: {
    logo: { url: string; title: string };
    shortDescription: string;
    socialLinks: { url: string; platform: string }[];
    location?: {
      addressLine1: string;
      neighborhood: string;
      city: string;
      country: string;
      googleMapsUrl: string;
    };
  };
  subscribeContent: {
    title: string;
    shortDescription: string;
    inputPlaceholder: string;
    ctaText: string;
    successMessage: string;
  };
};

export const Footer = ({ content, subscribeContent }: FooterProps) => {
  const t = useTranslations();

  const quickLinks = [
    { href: "/", label: t("common.home") },
    { href: "/community", label: t("common.community") },
    { href: "/blog", label: t("common.blog") },
    { href: "/come-meet-us", label: t("common.join-us") },
  ];

  return (
    <footer className="bg-slate-900 text-white pt-16 pb-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Image
                src={content.logo.url}
                alt={content.logo.title}
                width={64}
                height={64}
                className="h-16 w-auto"
              />
              <div className="flex flex-col">
                <span className="font-serif font-bold text-xl leading-none">
                  {t("navbar.church-name")}
                </span>
                <span className="font-sans text-sm font-medium tracking-widest uppercase text-white/70">
                  {t("navbar.church-subtitle")}
                </span>
              </div>
            </div>
            <Typography
              component="p"
              variant="body1"
              className="text-slate-400 text-sm leading-relaxed max-w-xs"
            >
              {content.shortDescription}
            </Typography>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-serif font-bold text-lg mb-6">
              {t("footer.explore")}
            </h3>
            <ul className="space-y-3">
              {quickLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-slate-400 hover:text-primary transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-serif font-bold text-lg mb-6">
              {t("footer.visit-us")}
            </h3>
            <ul className="space-y-4 text-slate-400">
              {content.location && (
                <li className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <a
                    href={content.location.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    {content.location.addressLine1}
                    <br />
                    {content.location.neighborhood &&
                      content.location.neighborhood + ", "}
                    {content.location.city}
                    <br />
                    {content.location.country}
                  </a>
                </li>
              )}
              <li className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-primary shrink-0" />
                <a
                  href="mailto:info@idcredentor.com"
                  className="hover:text-primary transition-colors"
                >
                  info@idcredentor.com
                </a>
              </li>
            </ul>
          </div>

          {/* Social & Subscribe */}
          <div>
            <h3 className="font-serif font-bold text-lg mb-6">
              {t("footer.follow-us")}
            </h3>
            <SocialLinks 
              links={content.socialLinks} 
              variant="footer"
              className="mb-6"
            />
            <div className="mt-4">
              <SubscribeForm content={subscribeContent} />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-8 text-center text-slate-500 text-sm">
          <div className="flex flex-col md:flex-row justify-between items-center gap-2">
            <p>
              &copy; {new Date().getFullYear()} {t("footer.copyright")} | v
              {packageJson.version}
            </p>
            <p>{t("footer.poweredBy")}</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

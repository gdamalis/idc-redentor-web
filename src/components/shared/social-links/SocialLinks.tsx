import React, { JSX } from "react";
import { Facebook, Instagram, Youtube } from "lucide-react";

type SocialIcons = {
  [key: string]: React.ComponentType<{ className?: string }>;
};

const socialIcons: SocialIcons = {
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
};

type SocialLinksProps = {
  readonly className?: string;
  readonly links: { url: string; platform: string }[];
  readonly variant?: "default" | "footer";
  readonly iconClassName?: string;
  readonly linkClassName?: string;
};

export default function SocialLinks({
  className = "",
  links,
  variant = "default",
  iconClassName,
  linkClassName,
}: SocialLinksProps) {
  const defaultLinkStyles = 
    variant === "footer"
      ? "bg-slate-800 p-3 rounded-full hover:bg-primary hover:text-white transition-all hover:-translate-y-1"
      : "text-gray-400 hover:text-gray-500";

  const defaultIconStyles =
    variant === "footer" ? "w-5 h-5" : "h-6 w-6";

  return (
    <div className={`flex gap-4 ${className}`}>
      {links.map((item) => {
        const Icon = socialIcons[item.platform.toLowerCase()];

        if (!Icon) return null;

        return (
          <a
            key={item.platform}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName || defaultLinkStyles}
          >
            <span className="sr-only">{item.platform}</span>
            <Icon className={iconClassName || defaultIconStyles} />
          </a>
        );
      })}
    </div>
  );
}

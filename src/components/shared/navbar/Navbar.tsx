"use client";

import { useState, useEffect } from "react";
import { Link } from "@src/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { cn } from "@src/utils/cn";
import { Button } from "@src/components/ui/button";
import LanguageSwitcher from "@src/components/shared/language-switcher/LanguageSwitcher";
import type { MenuItem } from "@src/types/MenuItem";

interface NavbarProps {
  menuItems?: MenuItem[];
}

export const Navbar = ({ menuItems = [] }: NavbarProps) => {
  const t = useTranslations();
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled
          ? "bg-background/80 backdrop-blur-md shadow-sm py-4"
          : "bg-transparent py-6",
      )}
    >
      <div className="container mx-auto px-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <Image
            src={
              isScrolled
                ? "/assets/img/redentor_logo.png"
                : "/assets/img/redentor_logo_light.png"
            }
            alt={t("common.homepage")}
            width={48}
            height={48}
            className="h-12 w-auto transition-transform group-hover:scale-105"
            priority
          />
          <div className="flex flex-col">
            <span
              className={cn(
                "font-serif font-bold text-lg leading-none",
                isScrolled ? "text-foreground" : "text-white",
              )}
            >
              {t("navbar.church-name")}
            </span>
            <span
              className={cn(
                "font-sans text-sm font-medium tracking-widest uppercase",
                isScrolled ? "text-primary" : "text-white/90",
              )}
            >
              {t("navbar.church-subtitle")}
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          {menuItems.map((item) => (
            <Link
              key={item.groupLink.slug}
              href={`/${item.groupLink.slug}`}
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary relative after:content-[''] after:absolute after:left-0 after:-bottom-1 after:h-[2px] after:w-0 after:bg-primary after:transition-all hover:after:w-full",
                isScrolled ? "text-foreground/80" : "text-white/90",
              )}
            >
              {item.groupName}
            </Link>
          ))}

          <LanguageSwitcher isScrolled={isScrolled} />

          <Link href="/come-meet-us">
            <Button
              variant={isScrolled ? "default" : "secondary"}
              className={cn(
                "rounded-full px-6 font-semibold",
                !isScrolled &&
                  "bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm",
              )}
            >
              {t("common.join-us")}
            </Button>
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <div className="flex items-center gap-4 md:hidden">
          <LanguageSwitcher isScrolled={isScrolled} />
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "p-2 rounded-md",
              isScrolled ? "text-foreground" : "text-white",
            )}
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 bg-background border-b border-border p-4 md:hidden flex flex-col gap-4 animate-in slide-in-from-top-5 shadow-xl">
          {menuItems.map((item) => (
            <Link
              key={item.groupLink.slug}
              href={`/${item.groupLink.slug}`}
              className="text-lg font-medium py-2 border-b border-border/50 text-foreground/80 hover:text-primary"
              onClick={() => setIsOpen(false)}
            >
              {item.groupName}
            </Link>
          ))}
          <Link href="/come-meet-us" onClick={() => setIsOpen(false)}>
            <Button className="w-full rounded-full">
              {t("common.join-us")}
            </Button>
          </Link>
        </div>
      )}
    </nav>
  );
};

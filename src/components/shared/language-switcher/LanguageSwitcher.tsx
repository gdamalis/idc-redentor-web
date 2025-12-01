"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ChevronDownIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import { i18n, type Locale } from "@src/i18n/config";
import { Link, usePathname } from "@src/i18n/routing";
import { useLocale } from "next-intl";
import { cn } from "@src/utils/cn";

type LanguageSwitcherProps = {
  isScrolled?: boolean;
};

export default function LanguageSwitcher({
  isScrolled = false,
}: LanguageSwitcherProps) {
  const pathname = usePathname();
  const currentLocale = useLocale();

  return (
    <Menu as="div" className="relative inline-block text-left">
      <div>
        <MenuButton
          className={cn(
            "inline-flex w-full justify-center items-center gap-x-1.5 px-3 py-2 text-sm font-semibold cursor-pointer transition-colors hover:text-primary relative after:content-[''] after:absolute after:left-0 after:-bottom-1 after:h-[2px] after:w-0 after:bg-primary after:transition-all hover:after:w-full",
            isScrolled ? "text-foreground/80" : "text-white/90",
          )}
        >
          <GlobeAltIcon
            aria-hidden="true"
            className="size-5 transition-colors"
          />
          {currentLocale?.split("-")[0]?.toUpperCase()}
          <ChevronDownIcon
            aria-hidden="true"
            className="size-5 transition-colors"
          />
        </MenuButton>
      </div>

      <MenuItems
        transition
        className="absolute right-0 z-10 mt-2 origin-top-right rounded-md  shadow-lg ring-1 bg-white ring-gray-700/5 dark:ring-white/5 transition focus:outline-none data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-leave:duration-75 data-enter:ease-out data-leave:ease-in"
      >
        <ul>
          {i18n.locales
            .filter((e) => e !== currentLocale)
            .map((locale) => {
              return (
                <li key={locale}>
                  <MenuItem>
                    <Link
                      href={pathname}
                      locale={locale as Locale}
                      scroll={false}
                      className="w-full text-left block px-4 py-2 text-sm text-gray-700 dark:text-white data-[focus]:rounded-md data-[focus]:bg-gray-100 dark:data-[focus]:bg-gray-700 dark:data-[focus]:text-white data-[focus]:text-gray-900 data-[focus]:outline-none"
                    >
                      {locale?.split("-")[0]?.toUpperCase()}
                    </Link>
                  </MenuItem>
                </li>
              );
            })}
        </ul>
      </MenuItems>
    </Menu>
  );
}

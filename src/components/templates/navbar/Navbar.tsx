import { Disclosure, DisclosureButton } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'next-i18next';
import Image from 'next/image';
import Link from 'next/link';

import { LanguageSelector } from '@src/components/features/language-selector';
import { MainMenuMobile } from '@src/components/shared/main-menu';
import { MainMenuDesktop } from '@src/components/shared/main-menu/MainMenuDesktop';

const menuItems = [
  { href: '/comunidad', label: 'Comunidad' },
  { href: '/blog', label: 'Blog' },
  { href: '/quien-es-jesus', label: '¿Quién es Jesús?' },
  { href: '/conectemos', label: 'Conectemos' },
];

export const Navbar = () => {
  const { t } = useTranslation();

  return (
    <Disclosure as="nav" className="bg-white shadow">
      <div className="mx-auto max-w-7xl px-2 sm:px-6 lg:px-8">
        <div className="relative flex h-16 justify-between">
          <div className="flex items-center sm:hidden">
            {/* Mobile menu button */}
            <DisclosureButton className="group relative inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500">
              <span className="absolute -inset-0.5" />
              <span className="sr-only">Open main menu</span>
              <Bars3Icon aria-hidden="true" className="block h-6 w-6 group-data-[open]:hidden" />
              <XMarkIcon aria-hidden="true" className="hidden h-6 w-6 group-data-[open]:block" />
            </DisclosureButton>
          </div>
          <div className="flex items-center justify-center sm:items-stretch">
            <div className="flex flex-shrink-0 items-center">
              <Link href="/" title={t('common.homepage')}>
                <Image
                  src="/assets/img/redentor_logo.png"
                  width={60}
                  height={80}
                  alt="Redentor church logo"
                />
              </Link>
            </div>
          </div>
          <MainMenuDesktop menuItems={menuItems} />
          <div className="flex items-center pr-2 sm:ml-6 sm:pr-0">
            <LanguageSelector />
          </div>
        </div>
      </div>

      <MainMenuMobile menuItems={menuItems} />
    </Disclosure>
  );
};

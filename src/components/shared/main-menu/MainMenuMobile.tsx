import { DisclosureButton, DisclosurePanel } from '@headlessui/react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';

import { MenuItem } from '@src/types/MenuItem';

type MainMenuMobileProps = {
  menuItems: MenuItem[];
};

export const MainMenuMobile = ({ menuItems }: MainMenuMobileProps) => {
  const router = useRouter();
  const [currentPath, setCurrentPath] = React.useState(router.pathname);

  React.useEffect(() => {
    setCurrentPath(router.pathname);
  }, [router.pathname]);

  return (
    <DisclosurePanel className="sm:hidden">
      <div className="space-y-1 pb-4 pt-2">
        {menuItems.map(item => (
          <DisclosureButton
            key={item.label}
            as={Link}
            href={item.href}
            className={`${
              currentPath === item.href
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700'
            } block border-l-4 py-2 pl-3 pr-4 text-base font-medium`}
          >
            {item.label}
          </DisclosureButton>
        ))}
        {/* Current: "bg-indigo-50 border-indigo-500 text-indigo-700", Default: "border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700" */}
      </div>
    </DisclosurePanel>
  );
};

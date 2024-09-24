import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';

import { MenuItem } from '@src/types/MenuItem';

type MainMenuDesktopProps = {
  menuItems: MenuItem[];
};

export const MainMenuDesktop = ({ menuItems }: MainMenuDesktopProps) => {
  const router = useRouter();
  const [currentPath, setCurrentPath] = React.useState(router.pathname);

  React.useEffect(() => {
    setCurrentPath(router.pathname);
  }, [router.pathname]);

  return (
    <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
      {/* Current: "border-indigo-500 text-gray-900", Default: "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700" */}
      {menuItems.map(item => (
        <Link
          key={item.label}
          href={item.href}
          className={`${
            currentPath === item.href
              ? 'border-indigo-500 text-gray-900'
              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
          } inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
};

type ClassNames = (...classes: (string | boolean | undefined)[]) => string;

export const classNames: ClassNames = (...classes) => {
  return classes.filter(Boolean).join(' ');
};

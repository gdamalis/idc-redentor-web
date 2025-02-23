type SubscribeFormProps = {
  title?: string;
  description?: string;
  ctaText: string;
  placeholder: string;
  ctaSrLabel: string;
  size?: "sm" | "lg";
  className?: string;
};

const getSizeClasses = (size: "sm" | "lg") => {
  switch (size) {
    case "sm":
      return {
        input: "sm:w-56 sm:text-sm sm:leading-6",
        button: "sm:w-36 sm:px-4 sm:py-2 sm:text-sm sm:font-semibold",
      };
    case "lg":
      return {
        input: "sm:w-96 sm:text-lg sm:leading-8",
        button: "sm:w-44 sm:px-6 sm:py-3 sm:text-lg sm:font-semibold",
      };
  }
};

export const SubscribeForm = ({
  title,
  description,
  ctaText,
  ctaSrLabel,
  placeholder,
  size = "sm",
  className = "",
}: SubscribeFormProps) => {
  const sizeClasses = getSizeClasses(size);

  return (
    <div className={`mt-10 xl:mt-0 ${className}`}>
      {title && (
        <h3 className="text-sm font-semibold leading-6 text-gray-900">
          {title}
        </h3>
      )}
      {description && (
        <p className="mt-2 text-sm leading-6 text-gray-900">{description}</p>
      )}
      <form className="flex sm:max-w-md">
        <label htmlFor="email-address" className="sr-only">
          {ctaSrLabel}
        </label>
        <input
          id="email-address"
          name="email-address"
          type="email"
          required
          placeholder={placeholder}
          autoComplete="email"
          className={`w-full min-w-0 appearance-none rounded-l-2xl rounded-r-none border-0 bg-white px-3 py-1.5 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-1 focus:ring-inset focus:ring-blue-600 sm:w-56 ${sizeClasses.input}`}
        />
        <div className="sm:flex-shrink-0">
          <button
            type="submit"
            className={`flex w-full text-nowrap items-center justify-center rounded-r-2xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${sizeClasses.button}`}
          >
            {ctaText}
          </button>
        </div>
      </form>
    </div>
  );
};

import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";

type ComponentCtaProps = {
  content: {
    headline: string;
    ctaText: string;
    targetPage?: {
      slug: string;
    };
    urlParameters?: string;
  };
};

export const ComponentCta = ({ content }: ComponentCtaProps) => {
  const queryParams = content?.urlParameters ? `?${content.urlParameters}` : '';
  const targetUrl = content?.targetPage?.slug
    ? `/${content.targetPage.slug}${queryParams}`
    : '#';

  return (
    <div className="bg-blue-700">
      <div className="px-6 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Typography
            component="h2"
            variant="h2"
            className="text-3xl tracking-tight text-white md:text-4xl"
          >
            {content?.headline}
          </Typography>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              href={targetUrl}
              className="rounded-3xl  px-3.5 py-2.5 text-sm font-semibold bg-white text-blue-600 shadow-sm hover:bg-blue-50 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {content?.ctaText}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

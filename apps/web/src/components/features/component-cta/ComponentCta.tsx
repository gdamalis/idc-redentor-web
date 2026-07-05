import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import type { InspectorProps } from "@src/components/shared/contentful-preview/useLivePreview";

type ComponentCtaProps = {
  content: {
    headline: string;
    ctaText: string;
    targetPage?: {
      slug: string;
    };
    urlParameters?: string;
    sys: { id: string };
  };
  inspectorProps?: InspectorProps;
};

export const ComponentCta = ({ content, inspectorProps }: ComponentCtaProps) => {
  const queryParams = content?.urlParameters ? `?${content.urlParameters}` : '';
  const targetUrl = content?.targetPage?.slug
    ? `/${content.targetPage.slug}${queryParams}`
    : '#';

  return (
    <div className="bg-primary">
      <div className="px-6 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Typography doesn't forward extra props to its DOM node — wrap it
              so the inspector attributes still reach the DOM (mirrors the
              SectionHeader wrapping pattern used in OurMissionSection). */}
          <div
            {...inspectorProps?.({
              entryId: content.sys.id,
              fieldId: "headline",
            })}
          >
            <Typography
              component="h2"
              variant="h2"
              className="text-3xl tracking-tight text-white md:text-4xl"
            >
              {content?.headline}
            </Typography>
          </div>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              href={targetUrl}
              className="rounded-3xl  px-3.5 py-2.5 text-sm font-semibold bg-white text-primary shadow-sm hover:bg-primary/10 hover:text-white hover:outline-white hover:outline focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-primary"
              {...inspectorProps?.({
                entryId: content.sys.id,
                fieldId: "ctaText",
              })}
            >
              {content?.ctaText}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

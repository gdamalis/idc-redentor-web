"use client";

import { BLOCKS, Document } from "@contentful/rich-text-types";
import {
  CommonNode,
  documentToReactComponents,
} from "@contentful/rich-text-react-renderer";
import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import Image from "next/image";
import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Button } from "@src/components/ui/button";
import type { InspectorProps } from "@src/components/shared/contentful-preview/useLivePreview";
import { useTranslations } from "next-intl";
import { trackEvent } from "@src/lib/analytics";

const options = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (node: CommonNode, children: ReactNode) => (
      <Typography
        component="p"
        variant="body1"
        className="text-lg md:text-xl text-white max-w-2xl mx-auto leading-relaxed [text-shadow:_0_2px_8px_rgb(0_0_0_/_60%)]"
      >
        {children}
      </Typography>
    ),
  },
};

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 },
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

type OurMissionCtaProps = {
  content: {
    headline: string;
    subHeadline: string;
    body: {
      json: Document;
    };
    ctaText: string;
    targetPage: {
      slug: string;
    };
    image: {
      title: string;
      url: string;
    };
    sys: { id: string };
  };
  inspectorProps?: InspectorProps;
};

export const OurMissionCta = ({ content, inspectorProps }: OurMissionCtaProps) => {
  const t = useTranslations("OurMissionCta");
  const bodyText = documentToReactComponents(content.body.json, options);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image with Parallax-like effect */}
      <div
        className="absolute inset-0 z-0"
        {...inspectorProps?.({ entryId: content.sys.id, fieldId: "image" })}
      >
        <Image
          src={content.image.url}
          alt={content.image.title}
          fill
          className="object-cover"
          priority
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-background" />
      </div>

      {/* Content */}
      <div className="relative z-10 px-4 text-center text-white max-w-4xl mx-auto mt-16">
        <motion.div
          initial="initial"
          animate="animate"
          variants={stagger}
          className="space-y-6"
        >
          <motion.span
            variants={fadeInUp}
            className="inline-block py-1 px-3 rounded-full bg-primary/90 backdrop-blur-sm text-sm font-medium tracking-wide uppercase mb-4"
          >
            {t("welcome-home")}
          </motion.span>

          <motion.h1
            variants={fadeInUp}
            className="font-serif text-5xl md:text-7xl font-bold leading-tight"
          >
            <span
              {...inspectorProps?.({
                entryId: content.sys.id,
                fieldId: "headline",
              })}
            >
              {content.headline}
            </span>
            <br />
            <span
              className="italic"
              {...inspectorProps?.({
                entryId: content.sys.id,
                fieldId: "subHeadline",
              })}
            >
              {content.subHeadline}
            </span>
          </motion.h1>

          <motion.div
            variants={fadeInUp}
            className="max-w-3xl mx-auto backdrop-blur-sm bg-black/20 p-6 rounded-2xl border border-white/10"
            {...inspectorProps?.({ entryId: content.sys.id, fieldId: "body" })}
          >
            {bodyText}
          </motion.div>

          <motion.div
            variants={fadeInUp}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8"
          >
            <Link 
              href="/come-meet-us"
              onClick={() => trackEvent("join_us_click", {
                click_location: "hero_cta",
                page_path: window.location.pathname,
              })}
            >
              <Button
                size="lg"
                className="rounded-full px-8 text-lg h-14 bg-primary hover:bg-primary/90"
              >
                {t("join-us-sunday")}
              </Button>
            </Link>
            <Link href={`/${content.targetPage.slug}`}>
              <Button
                size="lg"
                className="rounded-full px-8 text-lg h-14 bg-black/20 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm [text-shadow:_0_2px_8px_rgb(0_0_0_/_60%)]"
                {...inspectorProps?.({
                  entryId: content.sys.id,
                  fieldId: "ctaText",
                })}
              >
                {content.ctaText}
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

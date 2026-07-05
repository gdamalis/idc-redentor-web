"use client";

import { motion } from "framer-motion";
import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import { Container } from "@src/components/ui/container";
import { SectionHeader } from "@src/components/ui/section-header";
import {
  sectionDescriptionOptions,
  cardDescriptionOptions,
} from "@lib/contentful/rich-text-options";
import type { ContentCollection } from "@lib/contentful/types";
import type { InspectorProps } from "@src/components/shared/contentful-preview/useLivePreview";

interface OurMissionSectionProps {
  content: ContentCollection;
  inspectorProps?: InspectorProps;
}

export const OurMissionSection = ({
  content,
  inspectorProps,
}: OurMissionSectionProps) => {
  const description = content.description
    ? documentToReactComponents(
        content.description.json,
        sectionDescriptionOptions,
      )
    : null;

  return (
    <section className="py-24 bg-background">
      <Container>
        {/* SectionHeader doesn't forward extra props to its DOM node — wrap it
            so the inspector attributes still reach the DOM without touching
            SectionHeader's API (it's shared by other callers). */}
        <div
          {...inspectorProps?.({
            entryId: content.sys?.id ?? "",
            fieldId: "title",
          })}
        >
          <SectionHeader title={content.title} description={description} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {content.creedItems.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2 }}
              className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1 group"
            >
              <h3
                className="font-serif text-2xl font-bold mb-3"
                {...inspectorProps?.({
                  entryId: item.sys?.id ?? "",
                  fieldId: "title",
                })}
              >
                {item.title}
              </h3>

              <div
                {...inspectorProps?.({
                  entryId: item.sys?.id ?? "",
                  fieldId: "description",
                })}
              >
                {item.description &&
                  documentToReactComponents(
                    item.description.json,
                    cardDescriptionOptions,
                  )}
              </div>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
};

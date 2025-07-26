import {
  CommonNode,
  documentToReactComponents,
} from "@contentful/rich-text-react-renderer";
import { BLOCKS } from "@contentful/rich-text-types";
import { Container } from "@src/components/ui/container";
import { Typography } from "@src/components/ui/typography";
import { ReactNode } from "react";

const options = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (node: CommonNode, children: ReactNode) => (
      <Typography
        component="p"
        variant="body1"
        className="text-xl md:text-2xl dark:text-white"
      >
        {children}
      </Typography>
    ),
  },
};

type InfoCommunityProps = {
  content: {
    headline: string;
    body: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      json: any;
    };
  };
};

export default function InfoCommunity({
  content,
}: Readonly<InfoCommunityProps>) {
  const bodyText = documentToReactComponents(content?.body.json, options);

  return (
    <div className="bg-blue-600/20 ">
      <Container className="max-w-5xl py-16 text-center md:space-y-6 sm:py-24">
        {bodyText}
      </Container>
    </div>
  );
}

import { Container } from "@src/components/ui/container";
import { getTranslations } from "next-intl/server";
import { PostActions } from "@src/components/features/blog-post-details/PostActions";
import type { Sermon } from "@src/types/Sermon";
import type { Likes } from "@src/service/like.service";
import {
  getAudioLanguageNotice,
  type AudioLanguageNotice,
} from "@src/utils/sermon/audioLanguage";
import { i18n, isValidLocale } from "@src/i18n/config";
import { SermonHeader } from "./SermonHeader";
import { SermonAudioPlayer } from "./SermonAudioPlayer";
import { SermonContent } from "./SermonContent";
import { PdfDownloadButton } from "./PdfDownloadButton";
import { ScriptureReferences } from "./ScriptureReferences";
import { RelatedSermons } from "./RelatedSermons";

interface SermonDetailsProps {
  readonly sermon: Sermon;
  readonly relatedSermons: Sermon[];
  readonly locale: string;
  readonly likes?: Likes;
}

const AUDIO_LANGUAGE_KEYS = {
  es: "audio-language.es",
  en: "audio-language.en",
  bilingual: "audio-language.bilingual",
} as const satisfies Record<Exclude<AudioLanguageNotice, null>, string>;

export default async function SermonDetails({
  sermon,
  relatedSermons,
  locale,
  likes,
}: SermonDetailsProps) {
  if (!sermon) return null;

  const t = await getTranslations("Sermons");
  const pageLocale = isValidLocale(locale) ? locale : i18n.defaultLocale;
  const audioLanguageNotice = getAudioLanguageNotice(
    sermon.audioLanguages,
    pageLocale,
  );

  return (
    <Container className="pt-28 pb-20 lg:py-32">
      <div className="mx-auto max-w-2xl flex flex-col gap-y-4">
        {/* 1. Header */}
        <SermonHeader sermon={sermon} />

        {/* 2. Audio player (when audio present) */}
        {sermon.audio && (
          <SermonAudioPlayer
            src={sermon.audio.url}
            title={sermon.title}
            durationSeconds={sermon.durationSeconds}
          />
        )}

        {/* 3. Audio-language notice — driven ENTIRELY by `audioLanguages`.
            Renders only when the audio's language differs from the page's, so a
            Spanish sermon on the Spanish page stays clean. This SUPERSEDES the old
            hardcoded `audio-in-spanish` note, which told every en-US reader the
            audio was Spanish even when it was not (ICR-146 AC4). */}
        {sermon.audio && audioLanguageNotice && (
          <p className="text-sm text-muted-foreground">
            {t(AUDIO_LANGUAGE_KEYS[audioLanguageNotice])}
          </p>
        )}

        {/* 4. PDF summary download */}
        {sermon.pdfSummary && (
          <PdfDownloadButton pdfSummary={sermon.pdfSummary} />
        )}

        {/* 5. Rich-text body (may embed per-preacher audio/PDF for multi-preacher services) */}
        {sermon.content && (
          <SermonContent content={sermon.content} audioTitleFallback={sermon.title} />
        )}

        {/* 6. Scripture references */}
        {sermon.scriptureReferences && sermon.scriptureReferences.length > 0 && (
          <ScriptureReferences refs={sermon.scriptureReferences} />
        )}

        {/* 7. Like + Share */}
        <PostActions
          slug={sermon.slug}
          basePath="predicas"
          likeKey={`predicas/${sermon.slug}`}
          title={sermon.title}
          featuredImageUrl={sermon.featuredImage?.url ?? ""}
          likes={likes}
        />

        {/* 8. Related sermons */}
        {relatedSermons.length > 0 && (
          <RelatedSermons sermons={relatedSermons as NonNullable<Sermon["relatedSermons"]>} locale={locale} />
        )}
      </div>
    </Container>
  );
}

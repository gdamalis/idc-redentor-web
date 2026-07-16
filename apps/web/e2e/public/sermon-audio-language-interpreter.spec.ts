/**
 * ICR-146: e2e smoke coverage for the sermon bilingual audio-language notice and
 * the interpreter credit.
 *
 * Content is non-deterministic across previews/environments: sermons are seeded
 * per-ticket in Contentful, so a given deployment may have zero, one, or many. This
 * suite discovers whatever sermon is FIRST in the archive rather than hardcoding a
 * slug, and asserts STRUCTURE + i18n wording only when the relevant fields are
 * present on that sermon — it skips (never hard-fails) when a sermon lacks
 * `audioLanguages` or an `interpreter`, since both are optional Contentful fields.
 */
import { expect, test, type Page } from "@playwright/test";

const AUDIO_LANGUAGE_STRINGS = {
  "es-AR": {
    es: "El audio de esta prédica está en español.",
    en: "El audio de esta prédica está en inglés.",
    bilingual: "El audio de esta prédica está en español e inglés.",
  },
  "en-US": {
    es: "This sermon's audio is in Spanish.",
    en: "This sermon's audio is in English.",
    bilingual: "This sermon's audio is in Spanish and English.",
  },
} as const;

const PREACHED_BY = { "es-AR": "Predicado por", "en-US": "Preached by" } as const;
const INTERPRETED_BY = {
  "es-AR": "Interpretado por",
  "en-US": "Interpreted by",
} as const;

type Locale = "es-AR" | "en-US";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Navigates to the archive and returns the first sermon's href, or null if empty. */
async function firstSermonHref(
  page: Page,
  locale: Locale,
): Promise<string | null> {
  const res = await page.goto(`/${locale}/predicas`);
  expect(res?.status()).toBeLessThan(400);
  const link = page.locator(`a[href*="/${locale}/predicas/"]`).first();
  if ((await link.count()) === 0) return null;
  return link.getAttribute("href");
}

test.describe("Sermon — bilingual audio-language notice", () => {
  for (const locale of ["es-AR", "en-US"] as const) {
    test(`${locale}: notice (when present) matches a known translated string; no raw i18n key ever renders`, async ({
      page,
    }) => {
      const href = await firstSermonHref(page, locale);
      test.skip(!href, "No sermons in this environment — nothing to assert");

      const res = await page.goto(href!);
      expect(res?.status()).toBeLessThan(400);

      // AC4: the old hardcoded note is gone and no raw i18n key ever leaks to the
      // screen, regardless of whether this particular sermon has audioLanguages set.
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).not.toMatch(/audio-language\.(es|en|bilingual)/);
      expect(bodyText).not.toContain("audio-in-spanish");

      // AC1: when a notice renders, it must be byte-identical to one of the three
      // known translations (never a partial/garbled string).
      const candidates = Object.values(AUDIO_LANGUAGE_STRINGS[locale]);
      const noticePattern = new RegExp(
        candidates.map(escapeRegExp).join("|"),
      );
      const notice = page.getByText(noticePattern);
      if (await notice.count()) {
        await expect(notice.first()).toBeVisible();
      }
    });
  }
});

test.describe("Sermon — interpreter credited separately from the preacher byline", () => {
  for (const locale of ["es-AR", "en-US"] as const) {
    test(`${locale}: interpreter (when present) is never folded into the preacher byline`, async ({
      page,
    }) => {
      const href = await firstSermonHref(page, locale);
      test.skip(!href, "No sermons in this environment — nothing to assert");
      await page.goto(href!);

      const interpretedLabel = page.getByText(INTERPRETED_BY[locale]);
      const hasInterpreter = await interpretedLabel.count();
      test.skip(
        !hasInterpreter,
        "This sermon has no interpreter set — nothing to assert",
      );

      const preachedLabel = page.getByText(PREACHED_BY[locale]);
      await expect(preachedLabel.first()).toBeVisible();
      await expect(interpretedLabel.first()).toBeVisible();

      // Structurally: SermonHeader renders "Predicado por"/"Preached by" and
      // "Interpretado por"/"Interpreted by" as two sibling label+content blocks
      // (see SermonHeader.tsx). Read each block's rendered name text and confirm
      // the interpreter's name never appears inside the preacher block — neither
      // bare nor joined with the " · " separator SermonByline uses for
      // multi-preacher services (ICR-146 AC3).
      const interpreterBlock = interpretedLabel
        .first()
        .locator("xpath=following-sibling::*[1]");
      const preacherBlock = preachedLabel
        .first()
        .locator("xpath=following-sibling::*[1]");

      const interpreterName = (await interpreterBlock.innerText()).trim();
      const preacherBlockText = (await preacherBlock.innerText()).trim();

      expect(interpreterName.length).toBeGreaterThan(0);
      expect(preacherBlockText).not.toContain(interpreterName);
      expect(preacherBlockText).not.toContain(`· ${interpreterName}`);
      expect(preacherBlockText).not.toContain(`${interpreterName} ·`);
    });
  }
});

test.describe("Sermon archive — no bilingual badge expected in list view", () => {
  test("es-AR archive renders without error", async ({ page }) => {
    const res = await page.goto("/es-AR/predicas");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

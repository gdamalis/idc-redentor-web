// ICR-146: express bilingual/interpreted sermon audio.
//
// Adds two ADDITIVE, OPTIONAL, NON-LOCALIZED fields to `sermon`:
//   audioLanguages — Array<Symbol>, items validated in ["es-AR", "en-US"]. Bilingual = both.
//   interpreter    — Link<Entry> -> author. Structurally mirrors `preacher`, but is deliberately
//                    NOT `additionalPreachers`: an interpreter did not preach.
//
// Both are OPTIONAL by design: the 4 existing Spanish-only sermons must stay valid with the field
// entirely absent (the read path defaults absent => ["es-AR"]). Making either field required would
// force a data migration just to keep existing content valid.
//
// NON-LOCALIZED by design: one recording carries both languages, so one value serves both locale
// pages. (Contentful stores non-localized values under the default-locale key, `es-AR`.)
//
// Idempotent: guards on field presence before createField, so a re-run is a no-op.
//
// Applied to `staging` by run.mjs. Promoted to `production` by a HUMAN via Contentful Merge —
// and that promotion MUST happen BEFORE this branch's code is deployed, because the code queries
// these fields and Contentful fails the WHOLE query if they do not exist. See the plan's
// "Deployment ordering" section.
//
// Usage: node scripts/contentful/run.mjs 13 [--dry-run]

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });

  const sermon = items.find((type) => type.sys.id === "sermon");
  if (!sermon) return;

  const hasField = (id) => sermon.fields.some((field) => field.id === id);
  const sermonType = migration.editContentType("sermon");

  if (!hasField("audioLanguages")) {
    sermonType
      .createField("audioLanguages")
      .name("Audio languages")
      .type("Array")
      .localized(false)
      .required(false)
      .items({
        type: "Symbol",
        validations: [{ in: ["es-AR", "en-US"] }],
      });
  }

  if (!hasField("interpreter")) {
    sermonType
      .createField("interpreter")
      .name("Interpreter")
      .type("Link")
      .linkType("Entry")
      .localized(false)
      .required(false)
      .validations([{ linkContentType: ["author"] }]);
  }
};

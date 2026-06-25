// ICR-69 (T10): remove dead fields. menuGroup.featuredPages is queried nowhere; formField.validation
// is requested in getContactForm's query but never mapped or read by any component (the query line is
// dropped in the same commit). Idempotent (guarded by field presence).

module.exports = async function (migration, { makeRequest }) {
  const { items } = await makeRequest({
    method: "GET",
    url: "/content_types?limit=1000",
  });
  const byId = Object.fromEntries(items.map((t) => [t.sys.id, t]));
  const hasField = (typeId, fieldId) =>
    (byId[typeId]?.fields || []).some((f) => f.id === fieldId);

  if (hasField("menuGroup", "featuredPages")) {
    migration.editContentType("menuGroup").deleteField("featuredPages");
  }
  if (hasField("formField", "validation")) {
    migration.editContentType("formField").deleteField("validation");
  }
};

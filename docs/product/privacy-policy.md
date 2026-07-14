# Privacy Policy — canonical copy

> **This file is the source of truth for the privacy policy published at `/es-AR/privacidad` and
> `/en-US/privacy`.** The live page is a Contentful entry (`churchInfoTopic`, id `2nFd6sF9w0BbrhWrYklPVD`),
> which only a **human** can edit — so this doc is where the policy gets reviewed, diffed, and versioned.
> When the policy changes, change it _here_ first, then publish (see § Publishing runbook).
> The copy below is deliberately, verifiably true about what the site does — see § Why this copy says what
> it says.

## Publishing runbook (human-only)

1. Open Contentful → space `vg9le24yw8hb` → environment **`production`** → entry `2nFd6sF9w0BbrhWrYklPVD`.
2. **es-AR `name`:** change `Politica de Privacidad` → `Política de Privacidad` (add the accent).
3. **es-AR `body`:** replace the whole field with the **es-AR** copy below. Delete the old opening H3
   heading `Política de Privacidad (Español)` — it duplicated the title and pointlessly tagged the language
   of a page that is already served per-locale. The page renders its title from `name`.
4. **en-US `body`:** replace the whole field with the **en-US** copy below. Delete its duplicate
   `Privacy Policy` heading too.
5. **Set the effective date** in both locales to the date you actually publish, if it is not
   `14 de julio de 2026` / `July 14, 2026`.
6. **Publish** — verify `fieldStatus` shows _both_ locales published, then load `/es-AR/privacidad` and
   `/en-US/privacy` and confirm the section headings render as **headings** (not literal `##`), and that
   the footer links still resolve.

> **Warning:** paste as rich text — Contentful converts `##` to H2 and `**` to bold on paste; do not leave
> literal markdown characters in the field.

## Why this copy says what it says

Every claim below traces to a line of source. Where an earlier draft of the ticket disagreed with the
code, the code wins.

| Claim                                                                                                                | Source                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Contact form stores `name`/`email`/`subject`/`message`                                                               | `apps/web/src/service/contact.service.ts:11-18` (Mongo `website.contact` + `createdAt`)                                              |
| Newsletter email lives at **Resend**, not in our database                                                            | `apps/web/src/service/subscribe.service.ts:29`                                                                                       |
| Blog likes generate a random UUID, not tied to identity                                                              | `apps/web/src/app/api/likes/route.ts:64` (`crypto.randomUUID()`)                                                                     |
| Six named processors: Resend, MongoDB Atlas, Vercel, Google, Sentry, Contentful                                      | See table below                                                                                                                      |
| `_visitor_id` cookie is httpOnly, set only on first like, 1-year lifetime                                            | `apps/web/src/app/api/likes/route.ts:82-88` (`60*60*24*365`)                                                                         |
| Declining analytics stops GA **cookies** only — not GTM cookieless pings, Vercel Analytics/Speed Insights, or Sentry | `apps/web/src/app/[locale]/layout.tsx:26-40,108-109`; `apps/web/instrumentation-client.ts`; `docs/architecture/gtm-ga4-setup.md:509` |
| Nothing is ever auto-deleted (no TTL, no purge path)                                                                 | Grep of `apps/web/src` for `expireAfterSeconds`/`deleteMany`/`deleteOne` against `website.contact`/`website.likes`: zero hits        |
| Sentry's PII posture is locked (no identities, no form contents)                                                     | `apps/web/src/utils/sentry/options.ts:91-92` (`sendDefaultPii: false`, `dataCollection.userInfo: false`)                             |

**Only these six are named — deliberately, and two others are not.** SendGrid and Mailchimp both exist in
the codebase, and both are excluded from the policy on purpose:

- **SendGrid** — the alternate transactional-email adapter (`apps/web/src/service/mailing/sendgrid.adapter.ts`).
  `SENDGRID_API_KEY` is set in **no** Vercel environment (Production, Preview, staging, Development), so the
  adapter physically cannot send mail: it is dead config. The live provider is Resend.
- **Mailchimp** — the legacy newsletter integration. No code path reads it any more; the dependency and its
  `MAILCHIMP_*` env vars are pending removal (ICR-110).

Naming either in the policy would disclose a data flow that **does not occur** — the same category of false
statement this document exists to remove. If SendGrid is ever given a live API key, the policy must name it
**before** that key is set.

## Maintenance triggers

This copy becomes wrong — and must be revised — if any of the following happen:

- The mail provider changes away from **Resend** — e.g. SendGrid is given a live `SENDGRID_API_KEY`, or a
  new provider is added.
- A TTL or purge path is added to `website.contact` or `website.likes` (today, nothing is auto-deleted).
- **Vercel Analytics/Speed Insights** or **Sentry** become consent-gated (today, both are always on).
- A new third-party script or processor is added to the site.
- Sentry's `sendDefaultPii` is flipped on (today it is locked `false`).

---

# es-AR

> **h1 (Contentful `name`, es-AR):** `Política de Privacidad`

**Fecha de vigencia: 14 de julio de 2026**

En la Iglesia de Cristo Redentor queremos que sepa exactamente qué información recopila este sitio web,
para qué la usamos y con quién la compartimos. Esta política describe lo que el sitio realmente hace hoy.
Si algo cambia, actualizaremos esta página y su fecha de vigencia.

## 1. Qué información recopilamos

Recopilamos únicamente lo que usted nos envía y lo mínimo necesario para que el sitio funcione:

- **Formulario de contacto:** su nombre, su correo electrónico, el asunto y el mensaje que escribe.
- **Suscripción al boletín:** únicamente su correo electrónico.
- **"Me gusta" en el blog:** cuando marca un artículo por primera vez, generamos un identificador
  aleatorio (por ejemplo `a3f8c1e2-…`) y lo guardamos en una cookie llamada `_visitor_id`. Ese
  identificador no contiene su nombre, su correo ni su dirección IP: sirve solo para que un mismo
  visitante no cuente dos veces el mismo "me gusta".

No le pedimos que cree una cuenta, no guardamos contraseñas y no almacenamos su dirección IP ni su
navegador junto a los mensajes o los "me gusta".

## 2. Cómo usamos su información

- Para responder sus consultas y ponernos en contacto con usted.
- Para enviarle el boletín, si usted lo pidió.
- Para contar los "me gusta" de cada artículo.
- Para entender de forma general cómo se usa el sitio y detectar errores.

No vendemos su información y no la usamos para publicidad.

## 3. Con quién compartimos su información

Para que el sitio funcione dependemos de proveedores externos, y algunos de ellos reciben datos suyos.
Estos son todos:

- **Resend** — entrega los correos del formulario de contacto y administra la lista del boletín. Si se
  suscribe, su correo electrónico queda guardado en Resend, no en nuestra base de datos.
- **MongoDB Atlas** — es la base de datos donde guardamos los mensajes del formulario de contacto y los
  registros de "me gusta".
- **Vercel** — aloja el sitio, por lo que recibe cada solicitud que su navegador hace. También provee las
  herramientas de estadísticas de uso y de rendimiento que el sitio utiliza.
- **Google** — provee las herramientas de analítica del sitio (Google Tag Manager y Google Analytics), y
  el mapa de la página "Vení a conocernos" se carga desde Google Maps, por lo que Google recibe esa
  solicitud cuando usted visita esa página.
- **Sentry** — recibe informes técnicos de errores y de rendimiento cuando algo falla. Está configurado
  para **no** enviarle datos personales: no recibe el contenido de los formularios ni su identidad, solo
  información técnica del error.
- **Contentful** — provee los textos y las imágenes del sitio desde su red de distribución de contenidos.

Cualquier proveedor que le entrega contenido a su navegador (Vercel, Contentful, Google Maps) recibe
inevitablemente su dirección IP y datos básicos de su navegador como parte de esa entrega técnica.

Además, podemos compartir información si la ley nos obliga a hacerlo.

## 4. Cookies y almacenamiento local

- **`_visitor_id`** — cookie que se crea solo cuando usted marca su primer "me gusta". Dura **un año**, no
  es accesible desde JavaScript y solo evita los "me gusta" duplicados.
- **`_ga` y `_ga_*`** — cookies de Google Analytics. Se crean **solo si usted acepta** las cookies de
  analítica en el aviso del sitio.
- **`analytics-consent`** — se guarda en el almacenamiento local de su navegador para recordar la
  elección que hizo en ese aviso.

## 5. Analítica y su elección de consentimiento

Cuando usted visita el sitio le mostramos un aviso para aceptar o rechazar las cookies de analítica.
Queremos ser precisos sobre qué hace y qué no hace ese botón:

- **Si rechaza:** Google **no guarda cookies de analítica** en su navegador.
- **Aun si rechaza:** Google sigue recibiendo señales básicas y anónimas de la visita (sin cookies), y las
  herramientas de estadísticas y rendimiento de **Vercel** y el monitoreo de errores de **Sentry** siguen
  funcionando, porque no dependen de cookies.

En otras palabras: rechazar detiene las **cookies** de analítica, pero no detiene toda la medición. Se lo
decimos claramente en lugar de prometerle algo que el sitio no hace.

## 6. Cuánto tiempo conservamos su información

Hoy **no borramos automáticamente** los mensajes del formulario de contacto ni los registros de "me
gusta": se conservan hasta que los eliminamos manualmente. Preferimos decirle esto antes que prometerle un
plazo de eliminación que hoy no podríamos cumplir.

Si se suscribió al boletín, su correo permanece en la lista hasta que usted se da de baja.

## 7. Sus derechos y cómo eliminar sus datos

Usted puede pedirnos en cualquier momento que le mostremos, corrijamos o eliminemos la información que
tenemos sobre usted. Escríbanos a **info@idcredentor.org** y lo hacemos manualmente.

Para dejar de recibir el boletín, use el enlace para darse de baja que aparece al pie de cada correo, o
escríbanos a la misma dirección.

Para borrar la cookie `_visitor_id` puede eliminar las cookies de este sitio desde su navegador.

## 8. Seguridad

Usamos conexiones cifradas y proveedores con acceso restringido para proteger su información. Aun así,
ningún método de transmisión o de almacenamiento es completamente seguro, y no podemos garantizar una
protección absoluta.

## 9. Cambios en esta política

Podemos actualizar esta política. Cuando lo hagamos, publicaremos la nueva versión en esta página y
cambiaremos la fecha de vigencia que aparece arriba.

## 10. Contacto

Si tiene preguntas sobre esta política o sobre cómo tratamos su información, escríbanos:

Iglesia de Cristo Redentor
Tte. Gral. Juan Domingo Perón 4385, Buenos Aires, Argentina
info@idcredentor.org

---

# en-US

> **h1 (Contentful `name`, en-US):** `Privacy Policy`

**Effective date: July 14, 2026**

At Iglesia de Cristo Redentor we want you to know exactly what information this website collects, what we
use it for, and who we share it with. This policy describes what the site actually does today. If that
changes, we will update this page and its effective date.

## 1. What information we collect

We collect only what you send us, and the minimum the site needs to work:

- **Contact form:** your name, your email address, the subject, and the message you write.
- **Newsletter signup:** your email address only.
- **Blog likes:** the first time you like an article we generate a random identifier (for example
  `a3f8c1e2-…`) and store it in a cookie called `_visitor_id`. That identifier contains no name, email, or
  IP address — it exists only so the same visitor cannot like the same post twice.

We do not ask you to create an account, we do not store passwords, and we do not store your IP address or
browser alongside your messages or your likes.

## 2. How we use your information

- To answer your questions and get back to you.
- To send you the newsletter, if you asked for it.
- To count the likes on each article.
- To understand in general terms how the site is used, and to detect errors.

We do not sell your information and we do not use it for advertising.

## 3. Who we share your information with

Running this site depends on outside providers, and some of them receive your data. These are all of them:

- **Resend** — delivers the emails from the contact form and manages the newsletter list. If you
  subscribe, your email address is stored at Resend, not in our own database.
- **MongoDB Atlas** — the database where we store contact-form messages and like records.
- **Vercel** — hosts the site, so it receives every request your browser makes. It also provides the
  usage-statistics and performance tools the site uses.
- **Google** — provides the site's analytics tools (Google Tag Manager and Google Analytics), and the map
  on our "Come meet us" page loads from Google Maps, so Google receives that request when you visit that
  page.
- **Sentry** — receives technical error and performance reports when something goes wrong. It is
  configured **not** to send it personal data: it does not receive your form contents or your identity,
  only technical information about the error.
- **Contentful** — serves the site's text and images from its content delivery network.

Any provider that delivers content to your browser (Vercel, Contentful, Google Maps) necessarily receives
your IP address and basic browser information as part of that technical delivery.

We may also share information if the law requires us to.

## 4. Cookies and local storage

- **`_visitor_id`** — a cookie created only when you give your first like. It lasts **one year**, is not
  readable by JavaScript, and only prevents duplicate likes.
- **`_ga` and `_ga_*`** — Google Analytics cookies. They are created **only if you accept** analytics
  cookies in the site's banner.
- **`analytics-consent`** — stored in your browser's local storage to remember the choice you made in that
  banner.

## 5. Analytics and your consent choice

When you visit the site we show a banner asking you to accept or decline analytics cookies. We want to be
precise about what that button does and does not do:

- **If you decline:** Google does **not** store analytics cookies in your browser.
- **Even if you decline:** Google still receives basic, anonymous signals about the visit (without
  cookies), and **Vercel**'s usage and performance tools and **Sentry**'s error monitoring keep running,
  because they do not rely on cookies.

In other words: declining stops analytics **cookies**, but it does not stop all measurement. We would
rather tell you that plainly than promise something the site does not do.

## 6. How long we keep your information

Today we do **not** automatically delete contact-form messages or like records: they are kept until we
remove them by hand. We would rather tell you this than promise a deletion window we could not currently
honour.

If you subscribed to the newsletter, your email stays on the list until you unsubscribe.

## 7. Your rights and how to delete your data

You can ask us at any time to show you, correct, or delete the information we hold about you. Write to
**info@idcredentor.org** and we will do it manually.

To stop receiving the newsletter, use the unsubscribe link at the bottom of any newsletter email, or write
to the same address.

To remove the `_visitor_id` cookie, you can clear this site's cookies in your browser.

## 8. Security

We use encrypted connections and access-restricted providers to protect your information. Even so, no
method of transmission or storage is completely secure, and we cannot guarantee absolute protection.

## 9. Changes to this policy

We may update this policy. When we do, we will publish the new version on this page and change the
effective date shown above.

## 10. Contact

If you have questions about this policy or about how we handle your information, write to us:

Iglesia de Cristo Redentor
Tte. Gral. Juan Domingo Perón 4385, Buenos Aires, Argentina
info@idcredentor.org

---

**Last reviewed:** 2026-07-14

# GTM & GA4 Setup Guide

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `scripts/contentful/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

This document covers the full configuration of Google Tag Manager (GTM) and Google Analytics 4 (GA4) for the IDC Redentor website, including custom events, reports, explorations, and dashboards.

---

## Table of Contents

- [GTM \& GA4 Setup Guide](#gtm--ga4-setup-guide)
  - [Table of Contents](#table-of-contents)
  - [Architecture Overview](#architecture-overview)
  - [Custom Events Reference](#custom-events-reference)
  - [1. GTM Setup](#1-gtm-setup)
    - [1.1 Create the GTM Container](#11-create-the-gtm-container)
    - [1.2 Create the Google Tag](#12-create-the-google-tag)
    - [1.3 Create Data Layer Variables](#13-create-data-layer-variables)
    - [1.4 Create Custom Event Triggers](#14-create-custom-event-triggers)
    - [1.5 Create GA4 Event Tags](#15-create-ga4-event-tags)
      - [Tag 1: Newsletter Subscribe](#tag-1-newsletter-subscribe)
      - [Tag 2: Contact Form Submit](#tag-2-contact-form-submit)
      - [Tag 3: Join Us Click](#tag-3-join-us-click)
      - [Tag 4: Related Article Click](#tag-4-related-article-click)
    - [1.6 Preview, Test, and Publish](#16-preview-test-and-publish)
  - [2. GA4 Property Setup](#2-ga4-property-setup)
    - [2.1 Enhanced Measurement](#21-enhanced-measurement)
    - [2.2 Register Custom Dimensions](#22-register-custom-dimensions)
    - [2.3 Data Retention](#23-data-retention)
    - [2.4 Google Signals](#24-google-signals)
    - [2.5 Internal Traffic Filter](#25-internal-traffic-filter)
  - [3. GA4 Reports, Explorations, and Dashboards](#3-ga4-reports-explorations-and-dashboards)
    - [3.1 Requirement-to-Report Mapping](#31-requirement-to-report-mapping)
      - [Time spent on each page during a session](#time-spent-on-each-page-during-a-session)
      - [Location of connections](#location-of-connections)
      - [New subscribers and from where they did it](#new-subscribers-and-from-where-they-did-it)
      - [Blog traffic count and time spent on articles](#blog-traffic-count-and-time-spent-on-articles)
      - [People navigating to more articles after reading the first one](#people-navigating-to-more-articles-after-reading-the-first-one)
      - [Join Us button clicks (interest in reaching out)](#join-us-button-clicks-interest-in-reaching-out)
      - [Contact form messages](#contact-form-messages)
    - [3.2 Building the Explorations (Step-by-Step)](#32-building-the-explorations-step-by-step)
      - [Exploration 1: Newsletter Subscribers](#exploration-1-newsletter-subscribers)
      - [Exploration 2: Blog Performance](#exploration-2-blog-performance)
      - [Exploration 3: Article-to-Article Navigation](#exploration-3-article-to-article-navigation)
      - [Exploration 4: Join Us Interest](#exploration-4-join-us-interest)
      - [Exploration 5: Contact Form Funnel](#exploration-5-contact-form-funnel)
    - [3.3 Recommended Looker Studio Dashboard](#33-recommended-looker-studio-dashboard)
  - [4. Testing and Validation](#4-testing-and-validation)
    - [GTM Validation](#gtm-validation)
    - [GA4 Validation](#ga4-validation)
    - [Browser Console Validation](#browser-console-validation)
    - [Post-Launch Monitoring](#post-launch-monitoring)
  - [5. Consent Mode v2](#5-consent-mode-v2)
    - [5.1 How It Works](#51-how-it-works)
    - [5.2 Consent Categories](#52-consent-categories)
    - [5.3 Code Architecture](#53-code-architecture)
    - [5.4 GTM Configuration for Consent Mode](#54-gtm-configuration-for-consent-mode)
    - [5.5 Testing Consent Mode](#55-testing-consent-mode)
      - [In GTM Preview Mode](#in-gtm-preview-mode)
      - [In the Browser Console](#in-the-browser-console)
      - [Verify Cookie Behavior](#verify-cookie-behavior)
    - [5.6 Visitor Experience](#56-visitor-experience)

---

## Architecture Overview

The website sends data to GA4 through two channels:

1. **Enhanced Measurement** (automatic) -- GA4 automatically tracks page views, scrolls, outbound clicks, and form interactions via the Google tag.
2. **Custom `dataLayer.push()` events** (from React components) -- 4 custom events are pushed to the dataLayer, picked up by GTM triggers, and forwarded to GA4 via GA4 Event tags.

```
Next.js App
  └── layout.tsx (GoogleTagManager component loads GTM)
       └── GTM Container
            ├── Google tag (fires on all pages, sends page_view + Enhanced Measurement)
            └── GA4 Event tags (fire on custom triggers from dataLayer)
                 ├── newsletter_subscribe
                 ├── contact_form_submit
                 ├── join_us_click
                 └── related_article_click

React Components push events via:
  trackEvent("event_name", { param: "value" })
    → window.dataLayer.push({ event: "event_name", param: "value" })
      → GTM Custom Event Trigger matches event name
        → GA4 Event tag sends event + parameters to GA4
```

---

## Custom Events Reference

These are the 4 custom events implemented in the codebase. Each event is pushed to the dataLayer only when the specific user action succeeds.

| Event Name              | When It Fires                                            | Parameters                                                                               | Source Components                 |
| ----------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------- |
| `newsletter_subscribe`  | After subscribe API returns success                      | `subscribe_location` (`"banner"`), `page_path`                                           | `SubscribeBanner.tsx`             |
| `contact_form_submit`   | After contact form server action returns `success: true` | `form_subject` (the selected dropdown value)                                             | `ContactForm.tsx`                 |
| `join_us_click`         | When user clicks any "Join Us" CTA button                | `click_location` (`"navbar"`, `"navbar_mobile"`, or `"hero_cta"`), `page_path`           | `Navbar.tsx`, `OurMissionCta.tsx` |
| `related_article_click` | When user clicks a related article link from a blog post | `source_article` (current slug), `target_article` (clicked slug), `target_article_title` | `RelatedArticleLink.tsx`          |

---

## 1. GTM Setup

### 1.1 Create the GTM Container

1. Go to [tagmanager.google.com](https://tagmanager.google.com)
2. Create a new **account** (or use an existing one)
3. Create a new **container** for the website (platform: Web)
4. Copy the **Container ID** (format: `GTM-XXXXXXX`)
5. Set it in your `.env.local` file:

```
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX
```

> The GTM snippet is already integrated in the codebase via `@next/third-parties/google` in `src/app/[locale]/layout.tsx`. No manual script insertion is needed.

### 1.2 Create the Google Tag

The old "Google Analytics: GA4 Configuration" tag type has been retired. Google now uses a unified **"Google tag"** type.

1. In GTM, go to **Tags > New**
2. Click **Tag Configuration** and select **"Google tag"**
3. Enter your **Tag ID**: your GA4 Measurement ID (`G-XXXXXXXXXX`)
4. Under **Configuration settings**, leave empty for now (shared parameters can be added later if needed)
5. Set the **Trigger** to **"Initialization - All Pages"** (this built-in trigger ensures the Google tag fires before any event tags)
6. Name the tag: `Google tag - GA4`
7. Save

> **Note**: The Google tag handles pageview tracking automatically. You do NOT need a separate tag for `page_view` events -- Enhanced Measurement in GA4 takes care of that.

### 1.3 Create Data Layer Variables

Before creating event tags, define the Data Layer Variables that extract custom parameters from `dataLayer.push()` calls.

1. Go to **Variables > User-Defined Variables > New**
2. Choose **"Data Layer Variable"** as the variable type
3. Create the following variables (one variable per row):

| Variable Name                | Data Layer Variable Name |
| ---------------------------- | ------------------------ |
| `dlv - subscribe_location`   | `subscribe_location`     |
| `dlv - page_path`            | `page_path`              |
| `dlv - click_location`       | `click_location`         |
| `dlv - form_subject`         | `form_subject`           |
| `dlv - source_article`       | `source_article`         |
| `dlv - target_article`       | `target_article`         |
| `dlv - target_article_title` | `target_article_title`   |

For each variable, set **Data Layer Version** to **"Version 2"** (this is the default).

### 1.4 Create Custom Event Triggers

Go to **Triggers > New** and create these triggers, all of type **"Custom Event"**:

| Trigger Name                 | Event name (exact match) |
| ---------------------------- | ------------------------ |
| `CE - newsletter_subscribe`  | `newsletter_subscribe`   |
| `CE - contact_form_submit`   | `contact_form_submit`    |
| `CE - join_us_click`         | `join_us_click`          |
| `CE - related_article_click` | `related_article_click`  |

Leave "Use regex matching" **unchecked**. Each trigger fires when the `dataLayer` receives a push with the matching `event` key.

### 1.5 Create GA4 Event Tags

For each custom event, create a tag of type **"Google Analytics: GA4 Event"**.

#### Tag 1: Newsletter Subscribe

1. Tags > New > Tag Configuration > **Google Analytics: GA4 Event**
2. **Measurement ID**: `G-FW3DKVVG3C` (same as your Google tag)
3. **Event Name**: `newsletter_subscribe`
4. Under **Event Parameters**, click "Add Row" for each:
   - Parameter Name: `subscribe_location` -- Value: `{{dlv - subscribe_location}}`
   - Parameter Name: `page_path` -- Value: `{{dlv - page_path}}`
5. **Trigger**: `CE - newsletter_subscribe`
6. Name: `GA4 Event - Newsletter Subscribe`

#### Tag 2: Contact Form Submit

1. Tag Configuration > **Google Analytics: GA4 Event**
2. **Measurement ID**: `G-FW3DKVVG3C`
3. **Event Name**: `contact_form_submit`
4. Event Parameters:
   - Parameter Name: `form_subject` -- Value: `{{dlv - form_subject}}`
5. **Trigger**: `CE - contact_form_submit`
6. Name: `GA4 Event - Contact Form Submit`

#### Tag 3: Join Us Click

1. Tag Configuration > **Google Analytics: GA4 Event**
2. **Measurement ID**: `G-FW3DKVVG3C`
3. **Event Name**: `join_us_click`
4. Event Parameters:
   - Parameter Name: `click_location` -- Value: `{{dlv - click_location}}`
   - Parameter Name: `page_path` -- Value: `{{dlv - page_path}}`
5. **Trigger**: `CE - join_us_click`
6. Name: `GA4 Event - Join Us Click`

#### Tag 4: Related Article Click

1. Tag Configuration > **Google Analytics: GA4 Event**
2. **Measurement ID**: `G-FW3DKVVG3C`
3. **Event Name**: `related_article_click`
4. Event Parameters:
   - Parameter Name: `source_article` -- Value: `{{dlv - source_article}}`
   - Parameter Name: `target_article` -- Value: `{{dlv - target_article}}`
   - Parameter Name: `target_article_title` -- Value: `{{dlv - target_article_title}}`
5. **Trigger**: `CE - related_article_click`
6. Name: `GA4 Event - Related Article Click`

### 1.6 Preview, Test, and Publish

1. Click **Preview** in GTM to enter debug mode
2. Open your site in the preview browser -- verify the Google tag fires on page load
3. Trigger each custom event (subscribe, submit contact form, click Join Us, click a related article)
4. Confirm each GA4 Event tag fires with the correct parameters in the GTM debug panel
5. In GA4, go to **Admin > DebugView** to see events arriving in real-time
6. Once everything is verified, go back to GTM and click **Submit** to publish the container

---

## 2. GA4 Property Setup

### 2.1 Enhanced Measurement

1. Go to **Admin > Data streams** and select your web stream
2. Click **Enhanced measurement**
3. Enable all toggles:
   - Page views
   - Scrolls
   - Outbound clicks
   - Site search
   - Form interactions
   - Video engagement
   - File downloads

These events are tracked automatically without any code changes.

### 2.2 Register Custom Dimensions

Custom dimensions must be registered in GA4 before they appear in reports. Without this step, your custom event parameters will be collected but won't be available for filtering or reporting.

1. Go to **Admin > Custom definitions > Create custom dimension**
2. Create the following dimensions (all **Event-scoped**):

| Event Parameter Name   | Display Name         | Scope |
| ---------------------- | -------------------- | ----- |
| `subscribe_location`   | Subscribe Location   | Event |
| `click_location`       | Click Location       | Event |
| `source_article`       | Source Article       | Event |
| `target_article`       | Target Article       | Event |
| `target_article_title` | Target Article Title | Event |
| `form_subject`         | Form Subject         | Event |

> It can take up to 24-48 hours for new custom dimensions to start appearing in reports after creation.

### 2.3 Data Retention

1. Go to **Admin > Data settings > Data retention**
2. Set **Event data retention** to **14 months** (the maximum for standard GA4 properties)
3. Toggle ON **"Reset user data on new activity"**

This affects how long data is available in Explorations (standard reports are unaffected and show aggregated data indefinitely).

### 2.4 Google Signals

1. Go to **Admin > Data settings > Data collection**
2. Enable **Google signals data collection**
3. Acknowledge the data collection terms

This enables cross-device tracking and demographic reporting.

### 2.5 Internal Traffic Filter

Exclude your team's traffic from reports so it doesn't skew data:

1. Go to **Admin > Data streams > select your web stream**
2. Click **Configure tag settings > Show more > Define internal traffic**
3. Click **Create** and add a rule:
   - Rule name: `Office / Team`
   - `traffic_type` value: `internal`
   - IP address match type: "IP address equals" (or "IP address is in range")
   - Enter your team's IP addresses
4. Go to **Admin > Data settings > Data filters**
5. Find the "Internal Traffic" filter and set it to **Active** (it starts in "Testing" mode)

---

## 3. GA4 Reports, Explorations, and Dashboards

### 3.1 Requirement-to-Report Mapping

Here is how each business requirement maps to a GA4 report or exploration.

#### Time spent on each page during a session

- **Where**: Reports > Engagement > Pages and screens
- **Metric**: "Average engagement time" grouped by "Page path and screen class"
- **Setup needed**: None -- this is a default report

#### Location of connections

- **Where**: Reports > Demographics > Demographic details
- **Dimensions**: Country, City, Region
- **Setup needed**: None -- GA4 automatically determines geo location from IP

#### New subscribers and from where they did it

- **Where**: Explore > Free-form exploration (see [Section 3.2](#exploration-1-newsletter-subscribers))
- **Event**: `newsletter_subscribe`
- **Dimensions**: `Subscribe Location`, `Page path`
- **Metrics**: Event count
- **What it answers**: How many subscriptions happened, from which form (banner vs footer), on which page

#### Blog traffic count and time spent on articles

- **Where**: Reports > Engagement > Pages and screens
- **Filter**: Add filter where "Page path" contains `/blog/`
- **Metrics**: Views, Average engagement time, Engaged sessions
- **Also**: Free-form exploration for deeper analysis (see [Section 3.2](#exploration-2-blog-performance))

#### People navigating to more articles after reading the first one

- **Where**: Explore > Free-form exploration + Funnel exploration (see [Section 3.2](#exploration-3-article-to-article-navigation))
- **Event**: `related_article_click`
- **What it answers**: Raw count of article-to-article clicks, and the percentage of blog readers who click through to another article

#### Join Us button clicks (interest in reaching out)

- **Where**: Explore > Free-form exploration (see [Section 3.2](#exploration-4-join-us-interest))
- **Event**: `join_us_click`
- **Dimensions**: `Click Location`, `Page path`
- **What it answers**: Total interest by button location (navbar, hero, mobile) and which page users were on when they clicked

#### Contact form messages

- **Where**: Explore > Funnel exploration (see [Section 3.2](#exploration-5-contact-form-funnel))
- **Event**: `contact_form_submit`
- **What it answers**: How many visitors to the "Come Meet Us" page actually submit the form (conversion rate), broken down by subject

### 3.2 Building the Explorations (Step-by-Step)

All explorations are created in GA4 under **Explore > Create a new exploration**.

#### Exploration 1: Newsletter Subscribers

1. Click **Explore > Blank** (or Free-form template)
2. Name it: `Newsletter Subscribers`
3. **Variables panel** (left side):
   - Dimensions: Add `Event name`, `Subscribe Location`, `Page path and screen class`
   - Metrics: Add `Event count`
4. **Tab Settings** (right side):
   - Rows: `Subscribe Location`, `Page path and screen class`
   - Values: `Event count`
   - Filters: `Event name` exactly matches `newsletter_subscribe`
5. Save

This shows a table of subscription counts broken down by form location and the page users were on.

#### Exploration 2: Blog Performance

1. Create a new **Free-form** exploration
2. Name it: `Blog Performance`
3. **Variables panel**:
   - Dimensions: `Page path and screen class`, `Page title`
   - Metrics: `Views`, `Average engagement time`, `Engaged sessions`, `Engagement rate`
4. **Tab Settings**:
   - Rows: `Page path and screen class`
   - Values: `Views`, `Average engagement time`
   - Filters: `Page path and screen class` contains `/blog/`
   - Sort: `Views` descending
5. Save

#### Exploration 3: Article-to-Article Navigation

**Part A -- Raw counts (Free-form):**

1. Create a new **Free-form** exploration
2. Name it: `Article-to-Article Navigation`
3. **Variables panel**:
   - Dimensions: `Source Article`, `Target Article`, `Target Article Title`
   - Metrics: `Event count`
4. **Tab Settings**:
   - Rows: `Source Article`, `Target Article Title`
   - Values: `Event count`
   - Filters: `Event name` exactly matches `related_article_click`
   - Sort: `Event count` descending
5. Save

**Part B -- Conversion rate (Funnel):**

1. Create a new **Funnel exploration**
2. Name it: `Blog Reader Engagement Funnel`
3. **Steps**:
   - Step 1: `page_view` with condition `Page path` contains `/blog/` AND does NOT exactly match `/blog` (exclude listing page)
   - Step 2: `related_article_click` (no additional conditions)
4. This shows what percentage of blog article readers click through to another article
5. Save

#### Exploration 4: Join Us Interest

1. Create a new **Free-form** exploration
2. Name it: `Join Us Button Clicks`
3. **Variables panel**:
   - Dimensions: `Click Location`, `Page path and screen class`
   - Metrics: `Event count`
4. **Tab Settings**:
   - Rows: `Click Location`
   - Values: `Event count`
   - Filters: `Event name` exactly matches `join_us_click`
5. Save

This shows which "Join Us" button placement drives the most clicks (navbar vs hero CTA vs mobile).

#### Exploration 5: Contact Form Funnel

1. Create a new **Funnel exploration**
2. Name it: `Contact Form Conversion Funnel`
3. **Steps**:
   - Step 1: `page_view` with condition `Page path` contains `/come-meet-us`
   - Step 2: `contact_form_submit` (no additional conditions)
4. Save

This shows the conversion rate: of everyone who visits the "Come Meet Us" page, how many actually send a message.

**Alternative view**: For a breakdown by subject, create a Free-form exploration with `Event name` = `contact_form_submit`, rows = `Form Subject`, values = `Event count`.

### 3.3 Recommended Looker Studio Dashboard

For a consolidated, shareable view, create a **Looker Studio** dashboard connected to the GA4 property.

1. Go to [lookerstudio.google.com](https://lookerstudio.google.com)
2. Create a new report and add your GA4 property as a data source

Recommended layout:

| Section                        | Chart Type     | Data                                                                                                                         |
| ------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Scorecard row**              | Scorecards (4) | Total Sessions, Total Subscribers (`newsletter_subscribe` event count), Total Contact Form Submissions, Total Join Us Clicks |
| **Sessions over time**         | Line chart     | Sessions by date, last 30 days                                                                                               |
| **Top blog articles**          | Bar chart      | Blog page paths by views and average engagement time                                                                         |
| **Subscriber sources**         | Pie chart      | `subscribe_location` breakdown (banner vs footer_form)                                                                       |
| **Visitor geography**          | Geo chart      | Sessions by country/city                                                                                                     |
| **Article-to-article flow**    | Table          | Source Article, Target Article, Event count                                                                                  |
| **Join Us clicks by location** | Bar chart      | `click_location` breakdown (navbar, hero_cta, navbar_mobile)                                                                 |
| **Contact form funnel**        | Scorecard pair | Page views on `/come-meet-us` vs `contact_form_submit` count, with calculated conversion rate                                |

---

## 4. Testing and Validation

Use this checklist to verify the full setup before going live:

### GTM Validation

- [ ] Open GTM and click **Preview** to enter debug mode
- [ ] Open the site in the preview browser tab
- [ ] Verify the **Google tag** fires on page load (check the "Tags Fired" panel)
- [ ] Navigate between pages and confirm `page_view` events appear
- [ ] Trigger each custom event and verify the corresponding GA4 Event tag fires:
  - [ ] Subscribe via the banner form -- `GA4 Event - Newsletter Subscribe` fires with `subscribe_location: "banner"`
  - [ ] Subscribe via the footer form -- fires with `subscribe_location: "footer_form"`
  - [ ] Click "Join Us" in the desktop navbar -- `GA4 Event - Join Us Click` fires with `click_location: "navbar"`
  - [ ] Click "Join Us" in the mobile menu -- fires with `click_location: "navbar_mobile"`
  - [ ] Click "Join Us Sunday" in the hero -- fires with `click_location: "hero_cta"`
  - [ ] Submit the contact form on `/come-meet-us` -- `GA4 Event - Contact Form Submit` fires with `form_subject`
  - [ ] Click a related article on a blog post -- `GA4 Event - Related Article Click` fires with `source_article`, `target_article`, `target_article_title`

### GA4 Validation

- [ ] Go to **Admin > DebugView** in GA4 to see events in real-time while in GTM preview mode
- [ ] Verify all custom event parameters appear correctly in DebugView
- [ ] After publishing GTM, check **Reports > Real-time** to see live events
- [ ] Wait 24-48 hours, then verify custom dimensions appear in Explorations

### Browser Console Validation

Open DevTools console and inspect the dataLayer:

```javascript
// Check dataLayer contents
console.log(window.dataLayer);

// Filter for custom events only
window.dataLayer.filter((e) => e.event && !e.event.startsWith("gtm."));
```

### Post-Launch Monitoring

- [ ] After 24 hours: verify data flows into standard reports (Pages and screens, Demographics)
- [ ] After 48 hours: verify custom dimensions are available in Explorations
- [ ] Create the 5 explorations documented in [Section 3.2](#32-building-the-explorations-step-by-step)
- [ ] Set up the Looker Studio dashboard documented in [Section 3.3](#33-recommended-looker-studio-dashboard)

---

## 5. Consent Mode v2

Google requires Consent Mode v2 for any site using GA4. This section documents how consent is implemented on this site.

### 5.1 How It Works

Consent Mode v2 does **not** block GTM from loading. Instead, it tells GTM whether it is allowed to set cookies and fire tags that require consent. When consent is denied, GTM sends **cookieless pings** to GA4, which uses them for **behavioral modeling** (estimated metrics). When consent is granted, full cookie-based tracking activates.

The implementation has two parts:

1. **Default consent script** (inline in `<head>`, runs before GTM): Sets the initial consent state based on the visitor's saved preference in `localStorage`. If no preference is saved, consent defaults to `denied`.
2. **Consent banner** (React client component): Shows on first visit, allows the visitor to accept or decline. Their choice is saved to `localStorage` and applied via `gtag('consent', 'update', ...)`.

### 5.2 Consent Categories

This site uses the following consent categories:

| Category             | Default  | Can user change?   | Purpose                                    |
| -------------------- | -------- | ------------------ | ------------------------------------------ |
| `analytics_storage`  | `denied` | Yes (via banner)   | Controls GA4 cookies (`_ga`, `_ga_*`)      |
| `ad_storage`         | `denied` | No (always denied) | Not applicable -- this is a church, no ads |
| `ad_user_data`       | `denied` | No (always denied) | Not applicable                             |
| `ad_personalization` | `denied` | No (always denied) | Not applicable                             |

Only `analytics_storage` is presented to visitors. The ad-related categories are permanently denied since this is a church website with no advertising.

### 5.3 Code Architecture

**Files involved:**

- `apps/web/src/app/[locale]/layout.tsx` -- Contains the inline consent default script in `<head>` (before GTM) and renders the `<ConsentBanner />` component
- `apps/web/src/lib/consent.ts` -- Utility functions: `getConsentPreference()`, `setConsentPreference()`, `updateGtagConsent()`
- `apps/web/src/components/shared/consent-banner/ConsentBanner.tsx` -- The banner UI component
- `apps/web/public/locales/es-AR.json` and `en-US.json` -- Translations under the `"Consent"` key

**Flow:**

1. Page loads, inline script in `<head>` executes synchronously:
   - Reads `localStorage` key `analytics-consent`
   - If `"granted"`: sets `analytics_storage: 'granted'` as default
   - Otherwise: sets `analytics_storage: 'denied'` as default with `wait_for_update: 500`
2. GTM loads (after the consent script)
3. `ConsentBanner` component mounts:
   - If `localStorage` has a saved preference: applies it via `updateGtagConsent()`, stays hidden
   - If no saved preference: renders the banner
4. User clicks "Accept" or "Decline":
   - Saves choice to `localStorage`
   - Calls `gtag('consent', 'update', { analytics_storage: 'granted'|'denied' })`
   - Banner hides

### 5.4 GTM Configuration for Consent Mode

In GTM, consent checking is mostly automatic for Google tags, but you should verify the setup:

1. **Enable Consent Overview**: In your GTM container, go to **Admin > Container Settings** and enable **"Enable consent overview"**. This adds a "Consent" column to the Tags list showing which consent types each tag requires.

2. **Verify the Google tag**: Click on your `Google tag - GA4` tag. In the **Consent** section (under Advanced Settings), confirm it shows `analytics_storage` as a required consent. Google tags configure this automatically.

3. **Verify GA4 Event tags**: Each GA4 Event tag (Newsletter Subscribe, Contact Form Submit, etc.) should inherit consent requirements from the Google tag. Confirm each shows `analytics_storage` in its consent section.

4. **Non-Google tags** (if added in the future): For any non-Google tags you add to GTM, you must manually configure consent in the tag's **Consent** section. Set "Require additional consent for tag to fire" and select the appropriate consent types.

### 5.5 Testing Consent Mode

#### In GTM Preview Mode

1. Click **Preview** in GTM
2. Open the site in the preview browser
3. Before interacting with the banner, check the **Consent** tab in the GTM debug panel:
   - `analytics_storage` should show `denied`
   - `ad_storage`, `ad_user_data`, `ad_personalization` should all show `denied`
4. Check the Google tag: it should have fired, but in the Tags panel it will show a consent status indicator
5. Click "Accept" on the banner
6. The Consent tab should update to show `analytics_storage: granted`
7. Check that GA4 Event tags now fire normally when you trigger custom events

#### In the Browser Console

```javascript
// Check current consent state
// (The consent state is internal to GTM, but you can verify the dataLayer pushes)

// See all consent-related pushes
window.dataLayer.filter(
  (e) => e[0] === "consent" || (e.event && e.event.includes("consent")),
);

// Verify the default consent was set
// Should see: ['consent', 'default', { analytics_storage: 'denied', ... }]

// After clicking Accept, should also see:
// ['consent', 'update', { analytics_storage: 'granted' }]
```

#### Verify Cookie Behavior

1. Open DevTools > Application > Cookies
2. Before accepting: No `_ga` or `_ga_*` cookies should be present
3. After accepting: `_ga` and `_ga_XXXXXXXXXX` cookies should appear
4. Clear `localStorage` key `analytics-consent` and reload to test the flow again

### 5.6 Visitor Experience

The consent banner is designed to be unobtrusive and match the church's welcoming tone:

- **Position**: Fixed at the bottom of the screen, centered, max-width card
- **Tone**: Warm and honest -- "We value your privacy" not "This site uses cookies"
- **Choices**: Clear and simple -- "That's fine" / "I'd rather not" (not corporate jargon)
- **Behavior**: Appears once for new visitors. Choice is remembered. Does not block content.
- **Translations**: Available in both es-AR and en-US, matching the site's bilingual support

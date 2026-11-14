# Banyan Spa landing page

Bilingual landing page for a high-end men's spa in Bangkok, in English (`/en`) and Thai (`/th`). The existing default locale is Thai. Deployment follows the repository's existing configuration.

## Design

Quiet modern luxury: forest green `#173d32`, soft white `#fafbf7`, dark botanical ink `#243d32`, sage `#e9ede4`, muted green `#626e62`, and subtle borders `#d8dfd3`. English display type is Georgia; Thai uses the project's Noto Serif Thai and IBM Plex Sans Thai. The split hero pairs a restrained headline with a large garden-facing treatment-suite concept. The treatment menu uses tabs and expandable rows. The page avoids invented testimonials, ratings, addresses, and contact details.

## Editable content

- `src/modules/landing/content.ts`: English/Thai copy, seven sample treatments, sample durations and THB prices, spa identity, and `spa.bookingUrl`.
- `src/modules/landing/LandingPage.tsx`: responsive page, keyboard-operable tabs, native disclosure controls, mobile navigation, and the native booking dialog.
- `src/modules/landing/landing.module.css`: isolated page styling. CSS Modules are excluded from the existing Tailwind loader rewrite in `next.config.ts` so Next.js can preserve their class exports.
- `src/app/[locale]/page.tsx`: public localized route and metadata. It remains excluded from indexing during review.
- `src/proxy.ts`: public locale roots keep security headers and locale handling while skipping unnecessary staff-session refresh. Staff routes still refresh their sessions.

## Booking scope

Main booking calls to action link to the existing localized public booking route (`/en/book` or `/th/book`). The existing booking system remains responsible for its opening switch, therapist catalogue, actual services and prices, availability, LINE sign-in, and reservations. The landing page does not change those settings or bypass the booking system's guards.

The sample-treatment detail buttons open a separate preview dialog. It lets the visitor select a sample treatment, preferred date, and time of day, review the selection, and copy the details. Dates before today in Bangkok are disallowed. This dialog does not request availability, collect customer contact details, contact anyone, save data, or create appointments. Both the dialog and summary explain that nothing is sent or confirmed. Sample treatment IDs are never sent to the real booking system. `spa.bookingUrl` can be changed to another booking destination or set to null to use the preview for all booking calls to action.

Before public launch, confirm the actual menu and pricing, exact address, opening hours, booking destination and policies; review Thai copy; replace concept imagery if actual premises photos are available; and deliberately enable indexing when approved.

## Concept image

Generated with the built-in imagegen tool for this website. It depicts an imagined interior and is labeled as concept imagery on the page. It is not a photograph of Banyan Spa's actual premises.

Production asset: `public/images/banyan/banyan-suite.webp` (1536 × 1024; 367,436 bytes). The optimized image is included in the repository and needs no external image service.

Exact generation prompt:

> Use case: photorealistic-natural. Create a wide 3:2 landscape architectural editorial photograph for the website of Banyan Spa, a quiet modern high-end men's wellness spa in Bangkok. This is a concept interior, not an existing location. Subject: an exquisite minimalist private treatment suite with a low massage bed dressed in white textured linens and an olive throw in the right foreground, rich smoked-oak vertical wall panels, pale honed travertine floor, warm hidden lighting, floor-to-ceiling opening onto a lush enclosed tropical courtyard with a mature banyan tree and dense emerald foliage at left. Sparse and architectural, very sophisticated, serene natural afternoon light, tactile organic materials. Muted deep green and warm grey-brown palette with ivory linen. Eye-level wide interior photography, convincing real photographic detail, premium hospitality magazine art direction. Compose interesting interior throughout, uncluttered, soft shadows, no gold ornament, no people, no candles or flowers, no text, no lettering, no logos, no watermark. Landscape orientation.

## Validation

- Next.js production build and its TypeScript check passed.
- ESLint checked the new page, landing module, and modified routing/configuration files.
- After integration with the current repository, the source test run (`vitest run src`) passed all 48 files / 258 tests. Database-dependent checks require the separate local test database and were not rerun for this page integration; no database setup or mutation was performed.
- Browser checks cover treatment tab switching, disclosure expansion, selected booking preferences in the review summary, Escape dismissal, English/Thai navigation, mobile navigation, and horizontal-overflow checks at 320, 390, 768, and 1440 pixels.
- Production browser verification avoids existing development-only Next.js devtools style-injection warnings under the app's strict CSP.
- Local screenshots are saved under `output/playwright/`.

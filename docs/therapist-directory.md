# Public therapist directory

The public booking entry points (`/en/book` and `/th/book`) use the green-and-cream therapist discovery design inspired by the linked Mandel Spa prototype. The Banyan name, local suite concept image, and existing Thai/English typography remain in use.

- Name search is case insensitive and combines with the specialty filter.
- Specialty chips come from the public therapist records, rather than a sample treatment list.
- The preferred date is passed as `day` to the selected therapist's existing booking page. It does not claim availability; the booking panel checks available times after the guest selects a treatment.
- Reset clears the search, specialty, and preferred date.
- Portraits use the existing public photo endpoint. Therapists without a photo have an initials placeholder.
- Cards lead into the existing LINE sign-in, booking, confirmation, and cancellation flow.

Only therapists returned by the existing public query are shown. The owner switch and LINE configuration still control whether booking is open. This change adds no sample therapists, location records, or database migrations.

## Verification

TypeScript, targeted ESLint, the production build, and 24 existing public-booking/translation checks passed. Browser checks used a temporary development fixture with six sample therapists and verified search, specialties, empty results, reset, date links, and no horizontal overflow at 320, 390, 768, 1024, and 1440 pixels. The fixture route was removed after verification. Desktop English and mobile Thai screenshots are in the ignored `output/playwright` directory.

Real LINE sign-in and live booking were not exercised. The local environment had no LINE credentials during this work. Development Next.js tooling produced CSP inline-style warnings; the directory itself rendered and remained interactive.

"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { careers as c, type Locale } from "./content";
import { submitApplication } from "./actions";
import styles from "./careers.module.css";

type ExperienceCode = (typeof c.experienceOptions)[number]["code"];

function BrandMark({ href }: { href: string }) {
  return (
    <a href={href} className={styles.brand} aria-label={c.brand}>
      <span className={styles.monogram} aria-hidden="true">
        {c.monogram}
      </span>
      <span>{c.brand}</span>
    </a>
  );
}

export function CareersPage({ locale }: { locale: Locale }) {
  const [submitted, setSubmitted] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "sending" | "saved" | "failed" | "limited"
  >("idle");
  const [copyStatus, setCopyStatus] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [lineId, setLineId] = useState("");
  const [experience, setExperience] = useState<ExperienceCode | "">("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);

  const f = c.form;
  const selectedExperienceLabel =
    c.experienceOptions.find((item) => item.code === experience)?.label[locale] ?? "-";

  const summaryLines = [
    `${f.lines.name[locale]}: ${name.trim()}`,
    `${f.lines.phone[locale]}: ${phone.trim()}`,
    ...(lineId.trim() ? [`${f.lines.lineId[locale]}: ${lineId.trim()}`] : []),
    `${f.lines.experience[locale]}: ${selectedExperienceLabel}`,
    ...(notes.trim() ? [`${f.lines.notes[locale]}: ${notes.trim()}`] : []),
  ];
  const summaryText = `${f.summaryTitle[locale]}\n${summaryLines.join("\n")}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveState === "sending" || !experience || !consent) return;

    setCopyStatus("");
    setSaveState("sending");

    const combinedContact = lineId.trim()
      ? `${phone.trim()} (LINE: ${lineId.trim()})`.slice(0, 120)
      : phone.trim().slice(0, 120);

    try {
      const result = await submitApplication({
        fullName: name.trim(),
        age: 25,
        contact: combinedContact,
        experience,
        hasCertificate: false,
        workType: "full_time",
        skills: notes.trim(),
        locale,
      });
      setSaveState(
        result.ok
          ? "saved"
          : result.code === "RATE_LIMITED"
            ? "limited"
            : "failed",
      );
    } catch {
      setSaveState("failed");
    }

    setSubmitted(true);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopyStatus(f.copied[locale]);
    } catch {
      setCopyStatus(f.copyFailed[locale]);
    }
  }

  function handleReset() {
    setSubmitted(false);
    setSaveState("idle");
    setCopyStatus("");
    setName("");
    setPhone("");
    setLineId("");
    setExperience("");
    setNotes("");
    setConsent(false);
  }

  return (
    <div id="top" className={styles.site}>
      <a href="#main" className={styles.skip}>
        {c.skip[locale]}
      </a>

      <div className={styles.headerWrap}>
        <header className={styles.header}>
          <BrandMark href={`/${locale}`} />
          <nav className={styles.headerNav} aria-label={c.nav.details[locale]}>
            <a href="#details" className={styles.navLink}>
              {c.nav.details[locale]}
            </a>
            <a href="#apply" className={styles.headerCta}>
              {c.nav.apply[locale]}
            </a>
          </nav>
        </header>
      </div>

      <main id="main">
        <section className={styles.heroSection} aria-labelledby="careers-title">
          <div className={styles.container}>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <p className={styles.eyebrow}>{c.hero.eyebrow[locale]}</p>
                <h1 id="careers-title" className={styles.heroTitle}>
                  {c.hero.titleLine1}
                  <br />
                  <em>{c.hero.titleLine2}</em>
                </h1>
                <p className={styles.heroSubtitle}>{c.hero.subtitle[locale]}</p>
                <p className={styles.heroIntro}>{c.hero.intro[locale]}</p>
                <p className={styles.heroLocation}>{c.hero.location[locale]}</p>
                <div className={styles.heroActions}>
                  <a href="#apply" className={styles.primaryButton}>
                    {c.hero.primaryCta[locale]}
                  </a>
                  <a href="#details" className={styles.secondaryLink}>
                    {c.hero.secondaryCta[locale]}
                  </a>
                </div>
              </div>

              <figure className={styles.heroFigure}>
                <Image
                  src="/images/careers/therapist-linen.jpg"
                  alt={c.hero.imageAlt[locale]}
                  fill
                  priority
                  referrerPolicy="no-referrer"
                  sizes="(max-width: 960px) 100vw, 560px"
                />
              </figure>
            </div>
          </div>
        </section>

        <section
          id="details"
          className={styles.twoColSection}
          aria-labelledby="details-title"
        >
          <div className={styles.container}>
            <div className={styles.twoColGrid}>
              <div>
                <p className={styles.eyebrow}>{c.details.eyebrow[locale]}</p>
                <h2 id="details-title" className={styles.sectionHeading}>
                  {c.details.title[locale]}
                </h2>
                <p className={styles.sectionIntro}>{c.details.intro[locale]}</p>
              </div>

              <div>
                <div className={styles.detailGroup}>
                  <h3 className={styles.groupTitle}>
                    {c.details.responsibilitiesTitle[locale]}
                  </h3>
                  <ul className={styles.bulletList}>
                    {c.details.responsibilities.map((item) => (
                      <li key={item.en}>{item[locale]}</li>
                    ))}
                  </ul>
                </div>

                <div className={styles.detailGroup}>
                  <h3 className={styles.groupTitle}>
                    {c.details.qualificationsTitle[locale]}
                  </h3>
                  <ul className={styles.bulletList}>
                    {c.details.qualifications.map((item) => (
                      <li key={item.en}>{item[locale]}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className={styles.sageSection}
          aria-labelledby="working-title"
        >
          <div className={styles.container}>
            <div className={styles.twoColGrid}>
              <div>
                <p className={styles.eyebrow}>{c.working.eyebrow[locale]}</p>
                <h2 id="working-title" className={styles.sectionHeading}>
                  {c.working.title[locale]}
                </h2>
                <p className={styles.sectionIntro}>{c.working.intro[locale]}</p>
              </div>

              <ul className={styles.valueList}>
                {c.working.items.map((item) => (
                  <li key={item.title.en}>
                    <h3>{item.title[locale]}</h3>
                    <p>{item.body[locale]}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section
          id="apply"
          className={styles.applySection}
          aria-labelledby="apply-title"
        >
          <div className={styles.container}>
            <div className={styles.twoColGrid}>
              <div>
                <p className={styles.eyebrow}>{c.apply.eyebrow[locale]}</p>
                <h2 id="apply-title" className={styles.sectionHeading}>
                  {c.apply.title[locale]}
                </h2>
                <p className={styles.sectionIntro}>{c.apply.intro[locale]}</p>
              </div>

              <div>
                {!submitted ? (
                  <form className={styles.form} onSubmit={handleSubmit}>
                    <div className={styles.formRow}>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          {f.name[locale]}
                          <span className={styles.requiredMark} aria-hidden="true">
                            *
                          </span>
                        </span>
                        <input
                          type="text"
                          required
                          maxLength={120}
                          autoComplete="name"
                          className={styles.input}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </label>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          {f.phone[locale]}
                          <span className={styles.requiredMark} aria-hidden="true">
                            *
                          </span>
                        </span>
                        <input
                          type="tel"
                          required
                          maxLength={60}
                          autoComplete="tel"
                          className={styles.input}
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </label>
                    </div>

                    <div className={styles.formRow}>
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          {f.lineId[locale]}
                          <span className={styles.optionalMark}>
                            {f.optional[locale]}
                          </span>
                        </span>
                        <input
                          type="text"
                          maxLength={60}
                          className={styles.input}
                          value={lineId}
                          onChange={(e) => setLineId(e.target.value)}
                        />
                      </label>

                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>
                          {f.experience[locale]}
                          <span className={styles.requiredMark} aria-hidden="true">
                            *
                          </span>
                        </span>
                        <div className={styles.selectWrap}>
                          <select
                            required
                            className={`${styles.select} ${!experience ? styles.selectEmpty : ""}`}
                            value={experience}
                            onChange={(e) =>
                              setExperience(e.target.value as ExperienceCode | "")
                            }
                          >
                            <option value="" disabled>
                              {f.experiencePlaceholder[locale]}
                            </option>
                            {c.experienceOptions.map((opt) => (
                              <option key={opt.code} value={opt.code}>
                                {opt.label[locale]}
                              </option>
                            ))}
                          </select>
                          <span className={styles.selectChevron} aria-hidden="true" />
                        </div>
                      </label>
                    </div>

                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>
                        {f.notes[locale]}
                        <span className={styles.optionalMark}>
                          {f.optional[locale]}
                        </span>
                      </span>
                      <textarea
                        rows={4}
                        maxLength={1000}
                        placeholder={f.notesPlaceholder[locale]}
                        className={styles.textarea}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </label>

                    <p className={styles.privacyNote}>
                      {f.privacyNotice[locale]}
                    </p>

                    <label className={styles.consentLabel}>
                      <input
                        type="checkbox"
                        required
                        className={styles.checkbox}
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      <span>{f.consent[locale]}</span>
                    </label>

                    <div className={styles.submitRow}>
                      <button
                        type="submit"
                        className={`${styles.primaryButton} ${styles.submitButton}`}
                        disabled={saveState === "sending"}
                      >
                        {saveState === "sending"
                          ? f.sending[locale]
                          : f.submit[locale]}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className={styles.summaryPanel} role="status">
                    <h3 className={styles.summaryTitle}>
                      {f.summaryTitle[locale]}
                    </h3>
                    <p className={styles.summaryMessage}>
                      {saveState === "saved"
                        ? f.saved[locale]
                        : saveState === "limited"
                          ? f.rateLimited[locale]
                          : f.notSaved[locale]}
                    </p>
                    <pre className={styles.summaryBox}>
                      {summaryLines.join("\n")}
                    </pre>
                    <div className={styles.summaryActions}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={handleCopy}
                      >
                        {f.copy[locale]}
                      </button>
                      {saveState === "saved" ? (
                        <button
                          type="button"
                          className={styles.textAction}
                          onClick={handleReset}
                        >
                          {f.newApplication[locale]}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.textAction}
                          onClick={() => {
                            setSubmitted(false);
                            setSaveState("idle");
                          }}
                        >
                          {f.edit[locale]}
                        </button>
                      )}
                    </div>
                    {copyStatus && (
                      <p className={styles.copyFeedback}>{copyStatus}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <div className={styles.footerWrap}>
        <footer className={styles.footer}>
          <BrandMark href={`/${locale}`} />
          <p className={styles.footerMeta}>{c.footer.department[locale]}</p>
        </footer>
      </div>
    </div>
  );
}

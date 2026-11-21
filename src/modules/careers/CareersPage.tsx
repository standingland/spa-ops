"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { careers as c, type Locale } from "./content";
import { submitApplication } from "./actions";
import styles from "./careers.module.css";

function Arrow() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function CareersPage({ locale }: { locale: Locale }) {
  const [review, setReview] = useState(false);
  const [status, setStatus] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "sending" | "saved" | "failed" | "limited">("idle");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [contact, setContact] = useState("");
  const [experience, setExperience] = useState("2");
  const [certificate, setCertificate] = useState("0");
  const [work, setWork] = useState("0");
  const [skills, setSkills] = useState("");
  const f = c.form;
  const experienceCodes = ["none", "under_1", "1_3", "3_5", "5_plus"] as const;
  const workCodes = ["full_time", "part_time"] as const;

  const summary = [
    `${f.summaryTitle[locale]}`,
    `${f.lines.name[locale]}: ${name.trim()}`,
    `${f.lines.age[locale]}: ${age.trim()}`,
    `${f.lines.contact[locale]}: ${contact.trim()}`,
    `${f.lines.experience[locale]}: ${c.experienceOptions[Number(experience)][locale]}`,
    `${f.lines.certificate[locale]}: ${c.certificateOptions[Number(certificate)][locale]}`,
    `${f.lines.work[locale]}: ${c.workOptions[Number(work)][locale]}`,
    `${f.lines.skills[locale]}: ${skills.trim() || "-"}`,
  ].join("\n");

  async function sendApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveState === "sending") return;
    setStatus("");
    setSaveState("sending");
    try {
      const result = await submitApplication({
        fullName: name,
        age: Number(age),
        contact,
        experience: experienceCodes[Number(experience)],
        hasCertificate: certificate === "1",
        workType: workCodes[Number(work)],
        skills,
        locale,
      });
      setSaveState(result.ok ? "saved" : result.code === "RATE_LIMITED" ? "limited" : "failed");
    } catch {
      setSaveState("failed");
    }
    setReview(true);
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setStatus(f.copied[locale]);
    } catch {
      setStatus(f.copyFailed[locale]);
    }
  }

  const other: Locale = locale === "th" ? "en" : "th";

  return (
    <div className={`${styles.site} ${locale === "th" ? styles.thai : ""}`}>
      <a className={styles.skip} href="#main">
        {locale === "th" ? "ข้ามไปยังเนื้อหา" : "Skip to content"}
      </a>
      <header className={styles.header}>
        <a className={styles.logo} href={`/${locale}`} aria-label="Banyan Spa">
          BANYAN<span>SPA</span>
        </a>
        <div className={styles.headerActions}>
          <a className={styles.back} href={`/${locale}`}>
            {c.nav.back[locale]}
          </a>
          <div className={styles.languages} aria-label="Language">
            <Link
              href="/en/careers"
              prefetch={false}
              lang="en"
              aria-current={locale === "en" ? "page" : undefined}
            >
              EN
            </Link>
            <span>/</span>
            <Link
              href="/th/careers"
              prefetch={false}
              lang="th"
              aria-current={locale === "th" ? "page" : undefined}
            >
              ไทย
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className={styles.hero} aria-labelledby="careers-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <span />
              {c.eyebrow[locale]}
            </span>
            <h1 id="careers-title">{c.title[locale]}</h1>
            <p>{c.intro[locale]}</p>
            <a className={styles.primary} href="#apply">
              {c.apply[locale]}
              <Arrow />
            </a>
          </div>
          <figure className={styles.heroImage}>
            <Image
              src="/images/banyan/banyan-suite.webp"
              alt={c.imageAlt[locale]}
              fill
              priority
              sizes="(max-width: 860px) 100vw, 52vw"
            />
            <figcaption>
              <span>Banyan Spa</span>
              <span>{c.concept[locale]}</span>
            </figcaption>
          </figure>
        </section>

        <section className={styles.facts} aria-label={c.eyebrow[locale]}>
          {c.facts.map((fact) => (
            <div key={fact.label.en}>
              <strong>{fact.value[locale]}</strong>
              <span>{fact.label[locale]}</span>
            </div>
          ))}
        </section>

        <section className={styles.columns}>
          <div>
            <h2>{c.requirementsTitle[locale]}</h2>
            <ul>
              {c.requirements.map((item) => (
                <li key={item.en}>{item[locale]}</li>
              ))}
            </ul>
          </div>
          <div className={styles.offer}>
            <h2>{c.offerTitle[locale]}</h2>
            <ul>
              {c.offers.map((item) => (
                <li key={item.en}>{item[locale]}</li>
              ))}
            </ul>
            <p className={styles.note}>{c.offerNote[locale]}</p>
          </div>
        </section>

        <section id="apply" className={styles.apply} aria-labelledby="apply-title">
          <div className={styles.applyCopy}>
            <h2 id="apply-title">{c.applyTitle[locale]}</h2>
            <p>{c.applyIntro[locale]}</p>
            <p className={styles.note}>{c.contactNote[locale]}</p>
          </div>
          <div className={styles.card}>
            {!review ? (
              <form onSubmit={sendApplication}>
                <div className={styles.formRow}>
                  <label>
                    {f.name[locale]}
                    <input
                      required
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    {f.age[locale]}
                    <input
                      required
                      type="number"
                      inputMode="numeric"
                      min={20}
                      max={65}
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  {f.contact[locale]}
                  <input
                    required
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                </label>
                <div className={styles.formRow}>
                  <label>
                    {f.experience[locale]}
                    <select value={experience} onChange={(e) => setExperience(e.target.value)}>
                      {c.experienceOptions.map((o, i) => (
                        <option key={o.en} value={i}>
                          {o[locale]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {f.certificate[locale]}
                    <select value={certificate} onChange={(e) => setCertificate(e.target.value)}>
                      {c.certificateOptions.map((o, i) => (
                        <option key={o.en} value={i}>
                          {o[locale]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  {f.work[locale]}
                  <select value={work} onChange={(e) => setWork(e.target.value)}>
                    {c.workOptions.map((o, i) => (
                      <option key={o.en} value={i}>
                        {o[locale]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {f.skills[locale]}
                  <textarea
                    rows={3}
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                  />
                </label>
                <button type="submit" className={styles.primaryButton} disabled={saveState === "sending"}>
                  {saveState === "sending" ? f.sending[locale] : f.submit[locale]}
                  <Arrow />
                </button>
              </form>
            ) : (
              <div className={styles.summary}>
                <h3>{f.summaryTitle[locale]}</h3>
                <pre>{summary.split("\n").slice(1).join("\n")}</pre>
                <p role="status">
                  {saveState === "saved"
                    ? f.saved[locale]
                    : saveState === "limited"
                      ? f.rateLimited[locale]
                      : f.notSaved[locale]}
                </p>
                <button type="button" className={styles.primaryButton} onClick={copySummary}>
                  {f.copy[locale]}
                  <Arrow />
                </button>
                <p role="status" className={styles.status}>
                  {status}
                </p>
                {saveState !== "saved" && (
                  <button
                    type="button"
                    className={styles.textLink}
                    onClick={() => {
                      setReview(false);
                      setSaveState("idle");
                    }}
                  >
                    {f.edit[locale]}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <a href={`/${locale}`} className={styles.logo}>
          BANYAN<span>SPA</span>
        </a>
        <p>{c.footerLine[locale]}</p>
        <span>
          © {new Date().getFullYear()} Banyan Spa. {c.rights[locale]}
        </span>
        <Link href={`/${other}/careers`} prefetch={false} lang={other}>
          {other === "th" ? "ไทย" : "English"}
        </Link>
      </footer>
    </div>
  );
}

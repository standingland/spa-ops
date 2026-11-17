'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import type { PublicTherapist } from '../queries';
import { TherapistPhoto } from './TherapistPhoto';
import { directoryCopy } from './directoryCopy';
import styles from './directory.module.css';

export function TherapistDirectory({ therapists, locale, today }: { therapists: PublicTherapist[]; locale: 'en' | 'th'; today: string }) {
  const t = directoryCopy[locale];
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [day, setDay] = useState('');
  const specialties = [...new Set(therapists.flatMap((th) => th.specialties))];
  const query = search.trim().toLocaleLowerCase(locale);
  const visible = therapists.filter((th) => th.name.toLocaleLowerCase(locale).includes(query) && (!specialty || th.specialties.includes(specialty)));
  function reset() { setSearch(''); setSpecialty(''); setDay(''); }

  return (
    <div className={styles.directory}>
      <section className={styles.hero} aria-labelledby="directory-title">
        <div className={styles.heroCopy}>
          <p className={styles.heroLabel}>{t.heroLabel}</p>
          <h1 id="directory-title">{t.heroTitle}</h1>
          <p className={styles.heroBody}>{t.heroBody}</p>
          <a className={styles.primary} href="#therapists">{t.find}<span aria-hidden="true">↗</span></a>
          <p className={styles.heroNote}><span aria-hidden="true">✳</span>{t.heroNote}</p>
        </div>
        <figure className={styles.heroImage}>
          <Image src="/images/banyan/banyan-suite.webp" alt={t.concept} fill priority sizes="(max-width: 680px) 100vw, 55vw" />
          <figcaption>{t.concept}</figcaption>
        </figure>
      </section>

      <section id="therapists" className={styles.team} aria-labelledby="team-heading">
        <div className={styles.teamIntro}>
          <div><h2 id="team-heading">{t.teamTitle}</h2><p>{t.teamBody}</p></div>
          <span className={styles.introMark} aria-hidden="true">✳</span>
        </div>
        <div className={styles.bookingLayout}>
          <aside className={styles.filters} aria-labelledby="filter-heading">
            <div className={styles.filterHeading}><h3 id="filter-heading">{t.fit}</h3><button onClick={reset}>{t.reset}</button></div>
            <div className={styles.field}>
              <label htmlFor="therapist-search">{t.search}</label>
              <input id="therapist-search" type="search" placeholder={t.searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label htmlFor="preferred-day">{t.date}</label>
              <input id="preferred-day" type="date" min={today} value={day} aria-describedby="preferred-day-hint" onChange={(e) => setDay(e.target.value && e.target.value >= today ? e.target.value : '')} />
              <p id="preferred-day-hint">{t.dateHint}</p>
            </div>
            <div className={styles.help}><span aria-hidden="true">✳</span><h3>{t.helpTitle}</h3><p>{t.helpBody}</p><span className={styles.lineNote}>{t.line}</span></div>
          </aside>
          <div className={styles.results}>
            <div className={styles.resultsTop}><h3>{t.results}</h3><span role="status" aria-live="polite">{t.count(visible.length)}</span></div>
            <div className={styles.chips} role="group" aria-label={t.specialty}>
              {['', ...specialties].map((item) => <button key={item} aria-pressed={specialty === item} onClick={() => setSpecialty(item)}>{item || t.all}</button>)}
            </div>
            {visible.length > 0 ? (
              <ul className={styles.cards} data-testid="team-wall">
                {visible.map((th) => {
                  const bio = locale === 'en' ? th.bioEn || th.bioTh : th.bioTh || th.bioEn;
                  return <li key={th.id} className={styles.card}>
                    <Link href={{ pathname: `/book/${th.id}`, ...(day ? { query: { day } } : {}) }} className={styles.cardLink} data-testid="therapist-card" aria-label={`${t.view}: ${th.name}`}>
                      <div className={styles.portrait}>
                        <TherapistPhoto id={th.id} name={th.name} hasPhoto={th.hasPhoto} className={styles.photo} />
                        {!th.hasPhoto && <span className={styles.photoNote}>{t.portrait}</span>}
                        <span className={styles.cardArrow} aria-hidden="true">↗</span>
                      </div>
                      <div className={styles.cardName}><h4>{th.name}</h4><span aria-hidden="true">✳</span></div>
                      {bio && <p className={styles.bio}>{bio}</p>}
                      <div className={styles.cardBottom}><span>{th.specialties.join(', ') || t.profile}</span><strong>{t.view}<span aria-hidden="true"> ↗</span></strong></div>
                    </Link>
                  </li>;
                })}
              </ul>
            ) : <div className={styles.empty}><h4>{t.emptyTitle}</h4><p>{therapists.length ? t.emptyBody : t.noTeam}</p>{therapists.length > 0 && <button onClick={reset} className={styles.secondary}>{t.reset}</button>}</div>}
          </div>
        </div>
      </section>

      <section className={styles.banner} aria-labelledby="rest-heading"><div><h2 id="rest-heading">{t.bannerTitle}</h2><p>{t.bannerBody}</p><Link href="/#experience" className={styles.secondary}>{t.bannerLink}<span aria-hidden="true">↗</span></Link></div><span aria-hidden="true" className={styles.bannerMark}>✳</span></section>
    </div>
  );
}

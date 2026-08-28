'use client';

// ════════════════════════════════════════════════════════════════════════════
//  BOOKING — the client's copy.
//
//  Was a stack of four grey cards, each a labelled box, in the visual language
//  of an admin form. Booking is the first thing a stranger does with a studio;
//  it should look like the studio, and the studio's own gallery is dark, serif
//  and gold.
//
//  DESIGN DECISIONS, stated:
//
//  • ONE FLOW, NUMBERED. Service → day → time → details, as a sequence rather
//    than four equal boxes. A pile of cards makes you decide where to start.
//
//  • THE CONFIRM BUTTON SAYS WHAT IT WILL DO. "Confirm Tue 2 Sep, 10:00 AM"
//    rather than "Confirm booking" — this is the last screen before a stranger
//    commits to a time, and restating the choice is what stops the wrong slot
//    being booked and then apologised for.
//
//  • REQUIRED INTAKE QUESTIONS ARE MARKED AND ENFORCED. The old page rendered
//    `label + ' *'` into the PLACEHOLDER and never checked the answer, so a
//    required question was decoration.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { fetchBookingPublic, createBooking } from '../../../lib/api';
import { formatAppointment, zoneLabel } from '@/lib/datetime';
import PublicBrandMark from '@/components/PublicBrandMark';
import PublicNextSteps from '@/components/PublicNextSteps';
import PublicFooter from '@/components/PublicFooter';
import {
  PublicShell, PublicHero, PublicStep, PublicField, PublicLoading, PublicUnavailable,
} from '@/components/public/PublicShell';

const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (iso) => new Date(String(iso).replace(' ', 'T')).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export default function BookingPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [service, setService] = useState(null);
  const [day, setDay] = useState(null);
  const [time, setTime] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [intake, setIntake] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    fetchBookingPublic(slug)
      .then((d) => {
        setData(d); setState('ok');
        setService((d.services || [])[0]?.name || null);
        document.title = `Book · ${d.brand?.name || 'Booking'}`;
      })
      .catch(() => setState('missing'));
  }, [slug]);

  const days = data?.slots || [];
  const activeDay = useMemo(() => days.find((d) => d.date === day) || days[0], [days, day]);
  const chosenService = (data?.services || []).find((s) => s.name === service);

  const book = async () => {
    setErr('');
    if (!time) { setErr('Pick a time first.'); return; }
    if (!form.name || !(form.phone || form.email)) { setErr('Please add your name and a phone number or email.'); return; }
    // Required intake questions were previously only marked in a placeholder and
    // never checked, so "required" meant nothing.
    const missing = (data?.intake || []).filter((q) => q.required && !String(intake[q.label] || '').trim());
    if (missing.length) { setErr(`Please answer: ${missing.map((q) => q.label).join(', ')}`); return; }
    setBusy(true);
    try { setDone(await createBooking(slug, { service, start_at: time, ...form, intake })); }
    catch (e) { setErr(e.message || 'Could not book that time — it may have just been taken.'); setBusy(false); }
  };

  if (state === 'loading') return <PublicLoading />;
  if (state !== 'ok') return <PublicUnavailable title="Booking unavailable" message="This booking link is incorrect, or bookings are closed." />;

  if (done) return (
    <PublicShell>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '16vh 24px 80px', textAlign: 'center' }}>
        <div style={{ width: 62, height: 62, borderRadius: 999, background: 'var(--pub-accent)', color: 'var(--pub-on-accent)', display: 'grid', placeItems: 'center', margin: '0 auto 22px', fontSize: 28 }}>✓</div>
        <h1 className="pub-h1" style={{ fontSize: 'clamp(28px,5vw,42px)' }}>You’re booked</h1>
        <p className="pub-muted" style={{ fontSize: 15.5, lineHeight: 1.65, margin: '14px 0 0' }}>
          {done.service} · {formatAppointment(done.start_at, data?.timezone, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          {data?.timezone ? ` (${zoneLabel(data.timezone)} time)` : ''}
        </p>
        <p className="pub-dim" style={{ fontSize: 13, marginTop: 10 }}>A confirmation has been sent. See you then.</p>
        {done.manage_url && (
          <a href={done.manage_url} className="pub-btn pub-btn--ghost" style={{ marginTop: 22 }}>Change or cancel this booking</a>
        )}
        <PublicNextSteps next={done.next} brand={data?.brand} style={{ marginTop: 28, justifyContent: 'center' }} />
      </div>
    </PublicShell>
  );

  return (
    <PublicShell>
      <PublicHero
        kicker={data.brand?.name ? `With ${data.brand.name}` : 'Booking'}
        title="Book a session"
        sub="Choose a service and a time that suits you."
      >
        <PublicBrandMark brand={data.brand} style={{ marginBottom: 16 }} />
      </PublicHero>

      <div className="pub-wrap pub-wrap--narrow" style={{ paddingBottom: 70 }}>
        <section className="pub-section">
          <PublicStep n="1" title="Choose a service" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            {(data.services || []).map((s, i) => (
              <button key={i} onClick={() => setService(s.name)}
                className={`pub-choice${service === s.name ? ' is-on' : ''}`} aria-pressed={service === s.name}>
                <span className="pub-choice-title">{s.name}</span>
                <span className="pub-choice-meta">{s.duration} min{s.price > 0 ? ` · $${s.price}` : ''}</span>
              </button>
            ))}
          </div>
        </section>

        {days.length === 0 ? (
          <p className="pub-empty">No open times right now — please check back soon.</p>
        ) : (
          <>
            <section className="pub-section">
              <PublicStep n="2" title="Pick a day" hint={data.timezone ? `Times in ${zoneLabel(data.timezone)}` : null} />
              <div className="pub-chips" style={{ overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 4 }}>
                {days.map((d) => (
                  <button key={d.date} onClick={() => { setDay(d.date); setTime(null); }}
                    className={`pub-chip${activeDay?.date === d.date ? ' is-on' : ''}`}
                    aria-pressed={activeDay?.date === d.date}>
                    {fmtDate(d.date)}
                  </button>
                ))}
              </div>
            </section>

            <section className="pub-section">
              <PublicStep n="3" title="Pick a time" />
              {(activeDay?.times || []).length === 0 ? (
                <p className="pub-empty" style={{ padding: '22px 0' }}>Nothing free that day — try another.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
                  {(activeDay?.times || []).map((t) => (
                    <button key={t} onClick={() => setTime(t)}
                      className={`pub-chip${time === t ? ' is-on' : ''}`}
                      style={{ textAlign: 'center', justifyContent: 'center' }} aria-pressed={time === t}>
                      {fmtTime(t)}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="pub-section">
              <PublicStep n="4" title="Your details" />
              <div className="pub-card" style={{ display: 'grid', gap: 13 }}>
                <PublicField label="Full name" required>
                  <input className="pub-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Your name" />
                </PublicField>
                <div className="pub-two">
                  <PublicField label="Phone">
                    <input className="pub-input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="For your confirmation" />
                  </PublicField>
                  <PublicField label="Email">
                    <input className="pub-input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@example.com" />
                  </PublicField>
                </div>
                <p className="pub-dim" style={{ fontSize: 11.5, margin: '-5px 0 0' }}>A phone number or an email — whichever suits you.</p>

                {(data.intake || []).map((q, i) => (
                  <PublicField key={i} label={q.label} required={!!q.required}>
                    <input className="pub-input" value={intake[q.label] || ''}
                      onChange={(e) => setIntake((s) => ({ ...s, [q.label]: e.target.value }))} />
                  </PublicField>
                ))}

                <PublicField label="Anything we should know?">
                  <textarea className="pub-input" style={{ resize: 'vertical' }} rows={3} value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
                </PublicField>

                {err && <p className="pub-err" style={{ margin: 0 }}>{err}</p>}

                {/* Says what it will do. This is the last screen before a stranger
                    commits to a time, and restating the choice is what stops the
                    wrong slot being booked and then apologised for. */}
                <button onClick={book} disabled={busy} className="pub-btn" style={{ width: '100%' }}>
                  {busy ? 'Booking…'
                    : time ? `Confirm ${fmtDate(activeDay.date)}, ${fmtTime(time)}`
                    : 'Pick a time above'}
                </button>
                {chosenService && time && (
                  <p className="pub-dim" style={{ fontSize: 12, textAlign: 'center', margin: 0 }}>
                    {chosenService.name} · {chosenService.duration} min{chosenService.price > 0 ? ` · $${chosenService.price}` : ''}
                  </p>
                )}
              </div>
            </section>
          </>
        )}

        <PublicFooter brand={data.brand} style={{ padding: '30px 0 0' }} />
      </div>
    </PublicShell>
  );
}

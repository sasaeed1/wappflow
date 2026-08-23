'use client';

// PublicNextSteps — what a client does after they succeed at something.
//
// Phase 8 (audit client-portal-6). Every conversion point in the product was a
// dead end: "Payment received", "Thanks for signing", "You're booked" — and then
// nothing. The client closed the tab, and whatever the studio wanted next (pick a
// date, see the gallery, order prints) depended on the studio remembering to send
// another message.
//
// Takes the `next` object every conversion endpoint now returns
// ({ portal, book }) and renders only what actually exists, so a studio with no
// public booking page simply gets one button instead of a broken one.

export default function PublicNextSteps({ next, brand, tone = 'light', style }) {
  const portal = next?.portal || null;
  const book = next?.book || null;
  if (!portal && !book) return null;

  const dark = tone === 'dark';
  const primary = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '11px 20px', borderRadius: 999, textDecoration: 'none',
    fontSize: 13.5, fontWeight: 700,
    background: dark ? '#e7e7ea' : '#16161a', color: dark ? '#14141a' : '#fff',
  };
  const ghost = {
    ...primary,
    background: 'transparent',
    color: dark ? '#e7e7ea' : '#16161a',
    border: `1.5px solid ${dark ? '#2a2a33' : '#d9dbe1'}`,
  };
  const who = brand?.name ? ` from ${brand.name}` : '';

  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 22, ...style }}>
      {portal && <a href={portal} style={primary}>{`Everything else${who}`}</a>}
      {book && <a href={book} style={portal ? ghost : primary}>Book a session</a>}
    </div>
  );
}

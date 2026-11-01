const { buildContext, describeVerification } = require('../services/emailTemplates/context');
const { render } = require('../services/emailTemplates/render');
const { computeActivity } = require('../services/emailTemplates/activity');
const { maskSapId, formatDuration } = require('../services/emailTemplates/helpers');
const { SCENARIOS } = require('../services/emailTemplates/fixtures');

const byId = (id) => SCENARIOS.find((s) => s.id.startsWith(id));
const build = (id) => {
  const s = byId(id);
  const ctx = buildContext({ ...s.input, env: s.env || {} });
  return { ctx, out: render(ctx) };
};

describe('email templates', () => {
  test.each(SCENARIOS.map((s) => [s.id, s]))('%s renders html + text with no unresolved placeholders', (_id, s) => {
    const out = render(buildContext({ ...s.input, env: s.env || {} }));
    expect(out.html).toMatch(/^<!doctype html>/);
    expect(out.html).not.toMatch(/undefined|\[object Object\]|NaN/);
    expect(out.text).not.toMatch(/undefined|\[object Object\]|NaN/);
    expect(out.subject).toMatch(/^Campus (entry confirmed|exit recorded) for your ward$/);
  });

  test('entry is green + entry headline; exit is amber + exit headline', () => {
    const entry = build('01').out;
    const exit = build('02').out;
    expect(entry.html).toContain('ENTRY CONFIRMED');
    expect(entry.html).toContain('Campus Entry Successful!');
    expect(exit.html).toContain('EXIT RECORDED');
    expect(exit.html).toContain('Campus Exit Recorded Successfully!');
    expect(entry.subject).toBe('Campus entry confirmed for your ward');
    expect(exit.subject).toBe('Campus exit recorded for your ward');
  });

  test('SAP ID is masked and raw id never appears', () => {
    const { out } = build('01');
    expect(maskSapId('70552000101')).toBe('•••••••0101');
    expect(out.html).not.toContain('70552000101');
    expect(out.text).not.toContain('70552000101');
  });

  test('verification label comes from the backend event, manual is never biometric', () => {
    expect(build('01').ctx.event.verification.method).toBe('Fingerprint (biometric)');
    const manual = build('06').ctx.event.verification;
    expect(manual.method).toMatch(/manual/i);
    expect(manual.biometric).toBe(false);
    expect(build('06').out.html).not.toMatch(/biometric/i);
    expect(describeVerification({ source: 'terminal', verifyMode: 0 }).biometric).toBe(false);
    expect(describeVerification({ source: 'terminal' }).label).toMatch(/not reported/);
    expect(describeVerification({}).label).toBe('Not Available');
  });

  test('missing photo / department / gate show Not Available and no broken image', () => {
    const { ctx, out } = build('05');
    expect(ctx.student.department).toBe('Not Available');
    expect(ctx.student.year).toBe('Not Available');
    expect(ctx.event.gate).toBe('Not Available');
    expect(ctx.event.terminal).toBe('Not Available');
    expect(out.html).not.toMatch(/Photograph of/);
  });

  test('contact details are omitted when not configured and never invented', () => {
    const { out } = build('05');
    expect(out.html).toContain('Need Assistance?');
    expect(out.html).not.toMatch(/mailto:|Administration:|parent portal/i);
    const configured = build('01').out;
    expect(configured.html).toContain('support@example.edu');
  });

  test('dynamic values are HTML-escaped', () => {
    const { out } = build('11');
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
  });

  test('exit duration uses the real entry/exit pair', () => {
    const { ctx } = build('02');
    expect(ctx.activity.visitDuration).toBe('8h 10m');
    expect(ctx.activity.status).toBe('Outside Campus');
  });

  test('exit without a previous entry never fabricates a duration', () => {
    const { ctx, out } = build('08');
    expect(ctx.activity.visitDuration).toBe('Not Available');
    expect(ctx.activity.timeOnCampus).toBe('Not Available');
    expect(ctx.activity.firstEntry).toBe('Not Available');
    expect(out.html).toContain('excluded');
  });

  test('multiple visits: totals sum only complete pairs; this visit is the last pair', () => {
    const { ctx } = build('09');
    // 08:00-10:30 (2h30) + 12:00-13:15 (1h15) + 15:00-17:30 (2h30) = 6h 15m
    expect(ctx.activity.timeOnCampus).toBe('6h 15m');
    expect(ctx.activity.visitDuration).toBe('2h 30m');
    expect(ctx.activity.firstEntry).toMatch(/08:00 AM/);
    expect(ctx.activity.lastExit).toMatch(/05:30 PM/);
  });

  test('re-entry: still inside, only completed visits counted', () => {
    const { ctx } = build('10');
    expect(ctx.activity.status).toBe('Inside Campus');
    expect(ctx.activity.timeOnCampus).toBe('2h 30m');
    expect(ctx.activity.lastExit).toMatch(/10:30 AM/);
  });

  test('first entry of the day: visit in progress, not exited yet', () => {
    const { ctx } = build('01');
    expect(ctx.activity.timeOnCampus).toBe('Visit in progress');
    expect(ctx.activity.lastExit).toBe('Not exited yet');
    expect(ctx.activity.status).toBe('Inside Campus');
  });

  test('entry followed by an unmatched second entry is not paired', () => {
    const t = (h) => new Date(`2026-10-30T${h}:00+05:30`);
    const a = computeActivity(
      [{ entryTime: t('08:00') }, { entryTime: t('09:00') }, { exitTime: t('10:00') }],
      { type: 'exit', at: t('10:00') },
      'Asia/Kolkata'
    );
    expect(a.visitDuration).toBe('1h 0m'); // 09:00 -> 10:00, never 08:00 -> 10:00
    expect(a.excludesUnmatched).toBe(true);
  });

  test('student category and hostel label', () => {
    expect(build('01').ctx.student.category).toBe('Day Scholar');
    expect(build('03').ctx.student.category).toBe('Hosteller');
  });

  test('uses inline styles, tables, no scripts, alt text on every image', () => {
    const { out } = build('02');
    expect(out.html).not.toMatch(/<script|javascript:/i);
    expect(out.html).toContain('role="presentation"');
    const imgs = out.html.match(/<img [^>]*>/g) || [];
    expect(imgs.length).toBeGreaterThan(0);
    imgs.forEach((tag) => expect(tag).toMatch(/\balt="/));
  });

  test('formatDuration handles bad input', () => {
    expect(formatDuration(-5)).toBe('Not Available');
    expect(formatDuration(NaN)).toBe('Not Available');
    expect(formatDuration(30000)).toBe('Less than 1m');
  });
});

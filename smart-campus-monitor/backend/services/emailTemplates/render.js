/**
 * Pure renderer: context -> { subject, html, text, icons }.
 * Table layout + inline CSS for Gmail / Outlook / Apple Mail. Images are referenced as
 * cid:<name>@campus and attached by index.js; `icons` lists which ones this email uses.
 */
const { esc, NA } = require('./helpers');
const { ICONS } = require('./assets/icons');

const C = {
  navy: '#0B1F4B',
  navy2: '#13296B',
  cobalt: '#2F5FD0',
  page: '#EEF3FC',
  card: '#FFFFFF',
  tint: '#F4F7FD',
  line: '#DCE5F5',
  text: '#1B2A4A',
  muted: '#5B6B8C',
  white: '#FFFFFF',
};

const THEME = {
  entry: {
    accent: '#0F8A4F',
    soft: '#E6F6EF',
    badgeBg: '#0F8A4F',
    badgeFg: '#FFFFFF',
    badge: 'ENTRY CONFIRMED',
    headline: 'Campus Entry Successful!',
    sectionTitle: 'Entry Details',
    icon: 'entry',
    visual: 'visual-entry',
    verb: 'entered',
    timeLabel: 'Entry Time',
    dateLabel: 'Entry Date',
    gateLabel: 'Entry Gate',
  },
  exit: {
    accent: '#B45309',
    soft: '#FFF3DC',
    badgeBg: '#FBBF24',
    badgeFg: '#3A2400',
    badge: 'EXIT RECORDED',
    headline: 'Campus Exit Recorded Successfully!',
    sectionTitle: 'Exit Details',
    icon: 'exit',
    visual: 'visual-exit',
    verb: 'exited',
    timeLabel: 'Exit Time',
    dateLabel: 'Exit Date',
    gateLabel: 'Exit Gate',
  },
};

const FONT = "font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;";

const render = (ctx) => {
  const t = THEME[ctx.action] || THEME.entry;
  const icons = new Set();
 const img = (name, size = 20, alt = '', height = size) => {
    const id = ICONS[name] ? `icon-${name}` : name; // 'mark' and 'visual-*' are not line icons
    icons.add(id);
    return `<img src="cid:${id}@campus" width="${size}" height="${height}" alt="${esc(alt)}" style="display:block;border:0;outline:none;width:${size}px;height:${height}px;">`;
  };

  const { brand, student, event, activity, contact } = ctx;
  const v = event.verification;

  // One labelled field inside a rounded card (half width; stacks on mobile).
  const field = (icon, label, value, { wide = false } = {}) => `
    <td class="stack" ${wide ? 'colspan="2"' : 'width="50%"'} valign="top" style="padding:6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.tint};border:1px solid ${C.line};border-radius:12px;">
        <tr>
          <td width="52" valign="middle" style="padding:14px 0 14px 14px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="36" height="36" style="width:36px;height:36px;background:${C.white};border:1px solid ${C.line};border-radius:10px;">${img(icon, 20)}</td></tr></table>
          </td>
          <td valign="middle" style="padding:12px 14px 12px 12px;${FONT}">
            <div style="font-size:11px;line-height:14px;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted};font-weight:600;">${esc(label)}</div>
            <div style="font-size:15px;line-height:21px;color:${C.text};font-weight:600;word-break:break-word;">${esc(value)}</div>
          </td>
        </tr>
      </table>
    </td>`;

  const pairRow = (a, b) => `<tr>${a}${b || ''}</tr>`;

  const sectionTitle = (title, sub = '') => `
    <tr><td style="padding:26px 30px 8px 30px;${FONT}">
      <div style="font-size:18px;line-height:24px;font-weight:700;color:${C.navy};">${esc(title)}</div>
      ${sub ? `<div style="font-size:13px;line-height:19px;color:${C.muted};padding-top:2px;">${sub}</div>` : ''}
    </td></tr>`;

  const stat = (label, value, color = C.navy, { wide = false } = {}) => `
    <td class="stack" ${wide ? 'colspan="2"' : 'width="50%"'} valign="top" style="padding:6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.white};border:1px solid ${C.line};border-radius:12px;">
        <tr><td style="padding:14px 16px;${FONT}">
          <div style="font-size:11px;line-height:14px;letter-spacing:0.6px;text-transform:uppercase;color:${C.muted};font-weight:600;">${esc(label)}</div>
          <div style="font-size:19px;line-height:26px;font-weight:700;color:${color};padding-top:3px;">${esc(value)}</div>
        </td></tr>
      </table>
    </td>`;

  const chip = (text) =>
    `<span style="display:inline-block;margin:6px 6px 0 0;padding:4px 10px;background:${C.white};border:1px solid ${C.line};border-radius:999px;font-size:12px;line-height:16px;color:${C.text};font-weight:600;">${esc(text)}</span>`;

  const avatar = student.photoUrl
    ? `<img src="${esc(student.photoUrl)}" width="64" height="64" alt="Photograph of ${esc(student.name)}" style="display:block;width:64px;height:64px;border-radius:32px;border:2px solid ${C.white};object-fit:cover;">`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;border-radius:32px;background:${C.cobalt};color:${C.white};${FONT}font-size:22px;font-weight:700;letter-spacing:1px;">${esc(student.initials)}</td></tr></table>`;

  const statusColor = activity.status === 'Inside Campus' ? '#0F8A4F' : '#B45309';

  const contactRows = [
    contact.phone && `<tr><td width="28" valign="top" style="padding:5px 0;">${img('phone', 18, 'Phone')}</td><td style="padding:5px 0;${FONT}font-size:14px;line-height:20px;color:${C.text};"><span style="color:${C.muted};">Administration: </span><strong>${esc(contact.phone)}</strong></td></tr>`,
    contact.email && `<tr><td width="28" valign="top" style="padding:5px 0;">${img('mail', 18, 'Email')}</td><td style="padding:5px 0;${FONT}font-size:14px;line-height:20px;color:${C.text};"><span style="color:${C.muted};">Support: </span><a href="mailto:${esc(contact.email)}" style="color:${C.cobalt};text-decoration:none;font-weight:600;">${esc(contact.email)}</a></td></tr>`,
    contact.portalUrl && `<tr><td width="28" valign="top" style="padding:5px 0;">${img('globe', 18, 'Parent portal')}</td><td style="padding:5px 0;${FONT}font-size:14px;line-height:20px;"><a href="${esc(contact.portalUrl)}" style="color:${C.cobalt};text-decoration:none;font-weight:600;">Open the secure parent portal</a></td></tr>`,
  ].filter(Boolean);

  const visitRow =
    ctx.action === 'exit'
      ? pairRow(stat('Time on Campus (this visit)', activity.visitDuration, t.accent), stat('Total Today (completed visits)', activity.timeOnCampus))
      : pairRow(stat('Time on Campus (completed visits)', activity.timeOnCampus), stat('Current Status', activity.status, statusColor));

  const activityRows =
    ctx.action === 'exit'
      ? [pairRow(stat('First Entry', activity.firstEntry), stat('Last Exit', activity.lastExit)), visitRow, pairRow(stat('Current Status', activity.status, statusColor, { wide: true }))]
      : [pairRow(stat('First Entry', activity.firstEntry), stat('Last Exit', activity.lastExit)), visitRow];

  const preheader = `${student.name} has ${t.verb} campus at ${event.time} on ${event.date}.`;

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(ctx.subject)}</title>
<style>
  body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
  img{-ms-interpolation-mode:bicubic;}
  a{text-decoration:none;}
  @media only screen and (max-width:620px){
    .container{width:100%!important;}
    .stack{display:block!important;width:100%!important;box-sizing:border-box;}
    .px{padding-left:18px!important;padding-right:18px!important;}
    .h1{font-size:26px!important;line-height:32px!important;}
    .hero-img{display:none!important;max-height:0!important;overflow:hidden!important;}
    .hero-text{width:100%!important;display:block!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${esc(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

    <!-- HEADER -->
    <tr><td style="background:${C.navy};background-image:linear-gradient(135deg,${C.navy} 0%,${C.navy2} 100%);border-radius:18px 18px 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="px" style="padding:22px 30px 0 30px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" style="padding-right:12px;">${brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" height="40" alt="${esc(brand.collegeName)} logo" style="display:block;height:40px;max-width:140px;border:0;">` : img('mark', 36, `${brand.systemName} emblem`)}</td>
            <td valign="middle" style="${FONT}">
              <div style="font-size:15px;line-height:19px;font-weight:700;color:${C.white};">${esc(brand.collegeName)}</div>
              <div style="font-size:11px;line-height:15px;letter-spacing:1.2px;text-transform:uppercase;color:#9FB6F2;">${esc(brand.systemName)}</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td class="px" style="padding:22px 30px 30px 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td class="hero-text" valign="middle" style="${FONT}">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="background:${t.badgeBg};border-radius:999px;padding:6px 14px;font-size:11px;line-height:14px;letter-spacing:1.4px;font-weight:800;color:${t.badgeFg};${FONT}">&#9679;&nbsp; ${t.badge}</td>
              </tr></table>
              <div class="h1" style="font-size:30px;line-height:36px;font-weight:800;color:${C.white};padding-top:16px;">${esc(t.headline)}</div>
              <div style="font-size:15px;line-height:22px;color:#C5D3F7;padding-top:8px;">Keeping you informed. Keeping your ward safe.</div>
            </td>
            <td class="hero-img" width="190" valign="middle" align="right" style="padding-left:8px;">${img(t.visual, 190, 'Security shield illustration', 131)}</td>
          </tr></table>
        </td></tr>
      </table>
    </td></tr>

    <!-- BODY -->
    <tr><td style="background:${C.card};border-left:1px solid ${C.line};border-right:1px solid ${C.line};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

        <tr><td class="px" style="padding:26px 30px 6px 30px;${FONT}font-size:15px;line-height:23px;color:${C.text};">
          Dear Parent / Guardian,<br>
          Your ward <strong>${esc(student.name)}</strong> has <strong style="color:${t.accent};">${t.verb}</strong> the campus at <strong>${esc(event.time)}</strong> on ${esc(event.date)}.
        </td></tr>

        <!-- STUDENT CARD -->
        <tr><td class="px" style="padding:14px 24px 0 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.tint};border:1px solid ${C.line};border-radius:14px;">
            <tr>
              <td width="84" valign="top" style="padding:18px 0 18px 18px;">${avatar}</td>
              <td valign="top" style="padding:18px 18px 16px 14px;${FONT}">
                <div style="font-size:19px;line-height:25px;font-weight:800;color:${C.navy};word-break:break-word;">${esc(student.name)}</div>
                <div style="font-size:13px;line-height:19px;color:${C.muted};padding-top:2px;">SAP ID&nbsp; <strong style="color:${C.text};letter-spacing:1px;">${esc(student.maskedSapId)}</strong></div>
                <div>${chip(student.department)}${chip(student.year)}${chip(student.category)}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- EVENT DETAILS -->
        ${sectionTitle(t.sectionTitle)}
        <tr><td class="px" style="padding:0 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">
            ${pairRow(field('clock', t.timeLabel, event.time), field('calendar', t.dateLabel, event.date))}
            ${pairRow(field('gate', t.gateLabel, event.gate), field('terminal', 'Terminal', event.terminal))}
            ${pairRow(field('pin', 'Campus Location', event.location), field(v.icon, 'Verification Method', v.method))}
            ${pairRow(field('shield', 'Verification Status', v.status, { wide: true }))}
          </table>
        </td></tr>

        <!-- TODAY'S ACTIVITY -->
        ${sectionTitle("Today's Campus Activity", activity.excludesUnmatched ? 'Durations count only complete entry/exit pairs; events without a matching record are excluded.' : '')}
        <tr><td class="px" style="padding:0 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">
            ${activityRows.join('')}
          </table>
        </td></tr>

        <!-- SECURITY VERIFICATION -->
        <tr><td class="px" style="padding:24px 30px 0 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${t.soft};border:1px solid ${C.line};border-left:4px solid ${t.accent};border-radius:12px;">
            <tr><td style="padding:16px 18px;${FONT}">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td valign="middle" style="padding-right:8px;">${img('shield', 22, 'Security verified')}</td>
                <td valign="middle" style="font-size:15px;line-height:20px;font-weight:800;color:${C.navy};">Security Verification</td>
              </tr></table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
                ${[
                  ['Identity verification', v.status],
                  ['Verification method', v.method],
                  ['Gate terminal ID', v.terminalId],
                  ['Event status', v.recorded],
                ]
                  .map(
                    ([k, val]) =>
                      `<tr><td class="stack" width="42%" valign="top" style="padding:4px 0;font-size:13px;line-height:19px;color:${C.muted};">${esc(k)}</td><td class="stack" valign="top" style="padding:4px 0;font-size:14px;line-height:19px;color:${C.text};font-weight:600;word-break:break-word;">${esc(val)}</td></tr>`
                  )
                  .join('')}
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- ASSISTANCE -->
        <tr><td class="px" style="padding:24px 30px 30px 30px;${FONT}">
          <div style="font-size:17px;line-height:23px;font-weight:700;color:${C.navy};">Need Assistance?</div>
          <div style="font-size:14px;line-height:22px;color:${C.muted};padding-top:6px;">If you believe this notification is incorrect or have concerns regarding your ward's campus activity, please contact the college administration.</div>
          ${contactRows.length ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">${contactRows.join('')}</table>` : ''}
        </td></tr>

      </table>
    </td></tr>

    <!-- FOOTER -->
    <tr><td style="background:${C.navy};border-radius:0 0 18px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="px" align="center" style="padding:26px 30px 28px 30px;${FONT}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="padding-right:8px;">${img('mark', 22, '')}</td>
          <td valign="middle" style="font-size:14px;line-height:18px;font-weight:700;color:${C.white};">${esc(brand.collegeName)}</td>
        </tr></table>
        <div style="font-size:12px;line-height:18px;letter-spacing:1px;text-transform:uppercase;color:#9FB6F2;padding-top:6px;">${esc(brand.systemName)}</div>
        <div style="font-size:13px;line-height:20px;color:#C5D3F7;padding-top:10px;">Real-time campus safety and attendance notifications for parents and guardians.</div>
        <div style="font-size:14px;line-height:20px;font-weight:700;color:${C.white};padding-top:12px;">${esc(brand.tagline)}</div>
        <div style="font-size:11px;line-height:17px;color:#8FA3D6;padding-top:14px;">This is an automated notification. Please do not reply to this email.${contact.privacyUrl ? ` &nbsp;|&nbsp; <a href="${esc(contact.privacyUrl)}" style="color:#9FB6F2;text-decoration:underline;">Privacy</a>` : ''}${contact.email ? ` &nbsp;|&nbsp; <a href="mailto:${esc(contact.email)}" style="color:#9FB6F2;text-decoration:underline;">Support</a>` : ''}</div>
      </td></tr></table>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;

  const lines = [
    `${brand.collegeName} | ${brand.systemName}`,
    '',
    t.badge,
    t.headline,
    'Keeping you informed. Keeping your ward safe.',
    '',
    'Dear Parent / Guardian,',
    `Your ward ${student.name} has ${t.verb} the campus at ${event.time} on ${event.date}.`,
    '',
    'STUDENT',
    `  Name:       ${student.name}`,
    `  SAP ID:     ${student.maskedSapId}`,
    `  Department: ${student.department}`,
    `  Year:       ${student.year}`,
    `  Category:   ${student.category}`,
    '',
    t.sectionTitle.toUpperCase(),
    `  ${t.timeLabel}: ${event.time}`,
    `  ${t.dateLabel}: ${event.date}`,
    `  ${t.gateLabel}: ${event.gate}`,
    `  Terminal: ${event.terminal}`,
    `  Campus location: ${event.location}`,
    `  Verification method: ${v.method}`,
    `  Verification status: ${v.status}`,
    '',
    "TODAY'S CAMPUS ACTIVITY",
    `  First entry: ${activity.firstEntry}`,
    `  Last exit: ${activity.lastExit}`,
    ctx.action === 'exit'
      ? `  Time on campus (this visit): ${activity.visitDuration}\n  Total today (completed visits): ${activity.timeOnCampus}`
      : `  Time on campus (completed visits): ${activity.timeOnCampus}`,
    `  Current status: ${activity.status}`,
    ...(activity.excludesUnmatched ? ['  Note: events without a matching entry/exit record are excluded from durations.'] : []),
    '',
    'SECURITY VERIFICATION',
    `  Identity verification: ${v.status}`,
    `  Method: ${v.method}`,
    `  Gate terminal ID: ${v.terminalId}`,
    `  Event status: ${v.recorded}`,
    '',
    'NEED ASSISTANCE?',
    "If you believe this notification is incorrect or have concerns regarding your ward's campus activity, please contact the college administration.",
    ...(contact.phone ? [`  Administration: ${contact.phone}`] : []),
    ...(contact.email ? [`  Support: ${contact.email}`] : []),
    ...(contact.portalUrl ? [`  Parent portal: ${contact.portalUrl}`] : []),
    '',
    brand.tagline,
    'This is an automated notification. Please do not reply to this email.',
  ];

  return { subject: ctx.subject, html, text: lines.join('\n'), icons: [...icons] };
};

module.exports = { render, NA };

/**
 * Line-icon sources (24x24 viewBox, stroke only). PNGs are generated from these by
 * `npm run email:assets` because Gmail/Outlook do not render inline SVG.
 */
const ICONS = {
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
  gate: '<path d="M5 21V10a7 7 0 0 1 14 0v11"/><line x1="3" y1="21" x2="21" y2="21"/><line x1="12" y1="3.2" x2="12" y2="21"/><line x1="5" y1="13" x2="19" y2="13"/>',
  terminal: '<rect x="6" y="3" width="12" height="18" rx="2.5"/><rect x="8.5" y="6" width="7" height="5" rx="1"/><circle cx="12" cy="16" r="1.4"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6L12 3z"/><polyline points="8.8 12 11 14.2 15.4 9.6"/>',
  fingerprint: '<path d="M3.5 9.5a9.5 9.5 0 0 1 17 0"/><path d="M6 12.5a6.5 6.5 0 0 1 12 0"/><path d="M8.5 20c-.7-2-.9-4-.9-6a4.4 4.4 0 0 1 8.8 0c0 1.6.1 3 .5 4.4"/><path d="M12 14c0 2.5.3 4.5 1 6.2"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M5.8 16c.5-1.6 1.7-2.4 3.2-2.4s2.7.8 3.2 2.4"/><line x1="14.5" y1="10" x2="18" y2="10"/><line x1="14.5" y1="13.5" x2="17.5" y2="13.5"/>',
  check: '<circle cx="12" cy="12" r="9"/><polyline points="8 12.3 11 15.2 16 9.2"/>',
  phone: '<path d="M5 4h3.5l1.7 4.2-2.2 1.4a11 11 0 0 0 5.4 5.4l1.4-2.2 4.2 1.7V18a2 2 0 0 1-2 2A13 13 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><polyline points="3.5 7 12 13 20.5 7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><line x1="3" y1="12" x2="21" y2="12"/>',
  entry: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><polyline points="9.5 8 13.5 12 9.5 16"/><line x1="13.5" y1="12" x2="3.5" y2="12"/>',
  exit: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><polyline points="14.5 8 18.5 12 14.5 16"/><line x1="18.5" y1="12" x2="8.5" y2="12"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><line x1="12" y1="13.5" x2="12" y2="9.5"/><line x1="9.5" y1="2.5" x2="14.5" y2="2.5"/><line x1="12" y1="2.5" x2="12" y2="6"/>',
  building: '<path d="M4 21V8.5l8-5.5 8 5.5V21"/><path d="M9 21v-6h6v6"/><line x1="2.5" y1="21" x2="21.5" y2="21"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><line x1="8.5" y1="8" x2="15.5" y2="8"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5"/>',
};

module.exports = { ICONS };

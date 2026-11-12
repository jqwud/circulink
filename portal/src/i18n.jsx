// English / Filipino toggle. The English text itself is the key, so a missing translation just shows English.
import { createContext, useContext, useState, useCallback } from 'react';

const FIL = {
  // shell and navigation
  'Dashboard': 'Dashboard', 'Log out': 'Mag-log out', 'Change password': 'Palitan ang password', 'Portal': 'Portal',
  'Admin': 'Admin', 'Hub staff': 'Hub staff', 'Partner organization': 'Partner na organisasyon', 'Menu': 'Menu',
  // login
  'Portal login': 'Login sa portal', 'Email': 'Email', 'Password': 'Password', 'Log in': 'Mag-log in', 'Signing in...': 'Nag-log in...',
  'This portal is for hub staff, partner organizations and admins. Residents use the CircuLink app.':
    'Para lamang sa hub staff, partner na organisasyon at admin ang portal na ito. Ginagamit ng mga residente ang CircuLink app.',
  'Demo accounts (password circulink123): admin@, staff@ or partner@circulink.test':
    'Mga demo account (password circulink123): admin@, staff@ o partner@circulink.test',
  'Keeping things in use, one drop-off at a time.': 'Pinapanatiling gamit ang mga bagay, isang drop-off sa bawat pagkakataon.',
  // dashboard
  'Good day': 'Magandang araw', 'Drop-off hubs': 'Mga drop-off hub', 'Categories': 'Mga kategorya',
  'Hubs and categories are ready. The screens below arrive in the next build steps.':
    'Handa na ang mga hub at kategorya. Darating ang mga screen sa ibaba sa mga susunod na hakbang.',
  'Coming next': 'Susunod', 'Active hubs': 'Aktibong hub', 'Hazardous': 'Mapanganib', 'Food': 'Pagkain',
  'Check in drop-offs by code, then weigh and sort each item.': 'Tanggapin ang drop-off gamit ang code, timbangin at pagsunod-sunurin ang bawat gamit.',
  'Browse reusable stock and request items for your organization.': 'Tingnan ang magagamit pang stock at humiling ng gamit para sa organisasyon mo.',
  'Approve hubs, staff and partners; review flags; see impact reports.': 'Aprubahan ang mga hub, staff at partner; suriin ang mga flag; tingnan ang ulat ng epekto.',
  // password
  'Choose your own password': 'Pumili ng sariling password', 'Current password': 'Kasalukuyang password', 'Temporary password': 'Pansamantalang password',
  'New password': 'Bagong password', 'New password again': 'Bagong password ulit', 'At least 8 characters': 'Hindi bababa sa 8 character',
  'Save new password': 'I-save ang bagong password', 'The new password needs at least 8 characters.': 'Kailangan ng hindi bababa sa 8 character ang bagong password.',
  'The two new passwords are not the same.': 'Hindi magkapareho ang dalawang bagong password.',
  'Password changed. Other sessions were logged out.': 'Napalitan ang password. Na-log out ang ibang session.',
  'An admin gave you a temporary password. Pick a new one that only you know.': 'Binigyan ka ng admin ng pansamantalang password. Pumili ng bago na ikaw lang ang nakakaalam.',
  // common
  'Name': 'Pangalan', 'Status': 'Katayuan', 'Cancel': 'Kanselahin', 'Save': 'I-save', 'Close': 'Isara', 'Done': 'Tapos na',
  'Loading...': 'Naglo-load...', 'Nothing here yet.': 'Wala pa rito.', 'Try again': 'Subukan muli', 'Yes': 'Oo', 'No': 'Hindi',
  'school': 'Paaralan', 'barangay': 'Barangay', 'other': 'Iba pa',
};

const EN = {
  school: 'School', barangay: 'Barangay', other: 'Other',
};

const Ctx = createContext(null);
const KEY = 'circulink_portal_lang';

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem(KEY) || 'en');
  const setLang = useCallback((l) => { localStorage.setItem(KEY, l); setLangState(l); document.documentElement.lang = l === 'fil' ? 'fil' : 'en'; }, []);
  const t = useCallback((s) => (lang === 'fil' && FIL[s]) || EN[s] || s, [lang]);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export const FIL_PHRASES = Object.keys(FIL);

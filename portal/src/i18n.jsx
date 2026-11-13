// English / Filipino toggle. The English text itself is the key, so a missing translation just shows English.
// Codes from the server (statuses, roles, outcomes) have an English label in EN and a Filipino one in FIL.
import { createContext, useContext, useState, useCallback } from 'react';

const FIL = {
  // shell and navigation
  'Dashboard': 'Dashboard', 'Log out': 'Mag-log out', 'Change password': 'Palitan ang password', 'Portal': 'Portal',
  'Admin': 'Admin', 'Hub staff': 'Hub staff', 'Partner organization': 'Partner na organisasyon', 'Menu': 'Menu',
  'Check in and sort': 'Tanggapin at pagsunod-sunurin', 'Stock and recycling': 'Stock at recycling', 'Releases to partners': 'Ibinibigay sa mga partner',
  'Available items': 'Mga makukuhang gamit', 'My requests': 'Mga hiling ko', 'Flags': 'Mga flag', 'Accounts': 'Mga account',
  'Partner organizations': 'Mga partner na organisasyon', 'Hubs and recyclers': 'Mga hub at recycler', 'Categories': 'Mga kategorya', 'Audit log': 'Talaan ng pagbabago',
  // impact reports
  'Impact reports': 'Ulat ng epekto', 'Kilograms kept in use, by hub and category. Totals only, never names.': 'Kilo ng gamit na napanatiling gamit, ayon sa hub at kategorya. Kabuuan lang, walang pangalan.',
  'Month': 'Buwan', 'Export CSV': 'I-export ang CSV', 'Kept in use': 'Napanatiling gamit', 'Reused, repaired or recycled': 'Nagamit muli, naayos o na-recycle',
  'Diversion rate': 'Diversion rate', 'Share of weighed kg not rejected': 'Bahagi ng natimbang na kg na hindi tinanggihan', 'CO2e avoided (estimate)': 'CO2e na naiwasan (tantiya)',
  'Items sorted': 'Gamit na napagsunod-sunod', 'drop-offs': 'drop-off', 'residents': 'residente', 'Items given to partners': 'Gamit na naibigay sa partner', 'pickups': 'pickup',
  'Where the weight went': 'Saan napunta ang timbang', 'Nothing was sorted this month.': 'Walang napagsunod-sunod ngayong buwan.', 'Last 12 months': 'Huling 12 buwan',
  'No sorted items in the last 12 months.': 'Walang napagsunod-sunod sa huling 12 buwan.', 'kg kept in use per month': 'kg na napanatiling gamit bawat buwan',
  'By hub': 'Ayon sa hub', 'By category': 'Ayon sa kategorya', 'This month': 'Ngayong buwan', 'See the report': 'Tingnan ang ulat',
  // login
  'Portal login': 'Login sa portal', 'Email': 'Email', 'Password': 'Password', 'Log in': 'Mag-log in', 'Signing in...': 'Nag-log in...',
  'This portal is for hub staff, partner organizations and admins. Residents use the CircuLink app.':
    'Para lamang sa hub staff, partner na organisasyon at admin ang portal na ito. Ginagamit ng mga residente ang CircuLink app.',
  'Demo accounts (password circulink123): admin@, staff@ or partner@circulink.test':
    'Mga demo account (password circulink123): admin@, staff@ o partner@circulink.test',
  'Keeping things in use, one drop-off at a time.': 'Pinapanatiling gamit ang mga bagay, isang drop-off sa bawat pagkakataon.',
  // dashboard
  'Good day': 'Magandang araw', 'Drop-off hubs': 'Mga drop-off hub', 'Drop-offs to sort': 'Drop-off na pagsusunod-sunurin',
  'Partner requests': 'Hiling ng mga partner', 'Items in stock': 'Gamit na nasa stock', 'Open flags': 'Bukas na flag',
  'Items available': 'Makukuhang gamit', 'Handed over, waiting for your confirmation': 'Naibigay na, hinihintay ang kumpirmasyon mo',
  'Your organization is waiting for approval. You can ask for items once an admin approves it.':
    'Naghihintay pa ng pag-apruba ang organisasyon mo. Makakahiling ka ng gamit kapag inaprubahan na ng admin.',
  'Hazardous': 'Mapanganib', 'Food': 'Pagkain', 'Handling': 'Paghawak', 'Points / kg': 'Points / kg', 'kg CO2e / kg (estimate)': 'kg CO2e / kg (tantiya)',
  // check-in and sorting
  'Type the code the resident shows you. It works once, only at its own hub.': 'I-type ang code na ipinapakita ng residente. Isang beses lang ito gagana, sa sarili nitong hub lang.',
  'Drop-off code': 'Drop-off code', 'Check in': 'Tanggapin', 'Checked in. Weigh and sort each item.': 'Natanggap. Timbangin at pagsunod-sunurin ang bawat gamit.',
  'All items sorted.': 'Napagsunod-sunod na ang lahat ng gamit.', 'Waiting to be sorted': 'Naghihintay pagsunod-sunurin',
  'Nothing waiting. Checked-in drop-offs appear here until every item is sorted.': 'Walang naghihintay. Lumalabas dito ang natanggap na drop-off hanggang mapagsunod-sunod ang lahat ng gamit.',
  'Resident': 'Residente', 'Hub': 'Hub', 'Items left': 'Natitirang gamit', 'Checked in': 'Natanggap', 'Sort': 'Pagsunod-sunurin', 'Actions': 'Aksyon',
  'Drop-off of': 'Drop-off ni', 'to sort': 'pagsusunod-sunurin', 'They brought something not listed:': 'May dinala silang wala sa listahan:',
  'Choose a category': 'Pumili ng kategorya', 'Add item': 'Idagdag ang gamit', 'Item added.': 'Naidagdag ang gamit.',
  'Weight (kg)': 'Bigat (kg)', 'Outcome': 'Kalalabasan', 'Choose': 'Pumili', 'Expiry date': 'Petsa ng pagkapanis',
  'Hazardous: accredited recyclers only': 'Mapanganib: sa accredited na recycler lang', 'Sorted': 'Napagsunod-sunod', 'flagged for an admin': 'na-flag para sa admin',
  'points': 'points',
  // stock and recycling
  'Items sorted at your hubs that have not reached their new home yet.': 'Mga gamit na napagsunod-sunod sa mga hub mo na hindi pa nakararating sa bagong tahanan.',
  'Nothing here right now.': 'Wala rito ngayon.', 'Item': 'Gamit', 'Weight': 'Bigat', 'Move to': 'Ilipat sa', 'Moved': 'Nailipat',
  'Requested by a partner': 'Hiniling ng partner', 'In batch': 'Nasa batch', 'chosen': 'napili', 'Make a recycle batch': 'Gumawa ng recycle batch',
  'A batch holds items from one hub. Choose items from one hub only.': 'Isang hub lang ang laman ng bawat batch. Pumili ng gamit mula sa iisang hub.',
  'items': 'gamit', 'This batch has e-waste or batteries: only an accredited recycler can take it.': 'May e-waste o baterya ang batch na ito: accredited na recycler lang ang puwedeng tumanggap.',
  'Recycler': 'Recycler', 'accredited': 'accredited', 'Make batch': 'Gawin ang batch', 'Batch made.': 'Nagawa ang batch.',
  'Recycle batches': 'Mga recycle batch', 'No batches yet.': 'Wala pang batch.', 'Items': 'Mga gamit', 'Mark as sent': 'Markahang naipadala',
  'Batch sent. Points confirmed.': 'Naipadala ang batch. Nakumpirma ang points.', 'Sent': 'Naipadala', 'Open': 'Bukas',
  // releases
  'Hand items over only to the organization named on the request.': 'Ibigay lang ang mga gamit sa organisasyong nakapangalan sa hiling.',
  'Hand over': 'Ibigay', 'Decline': 'Tanggihan', 'Handed over. Points confirmed.': 'Naibigay. Nakumpirma ang points.',
  'Decline this request?': 'Tanggihan ang hiling na ito?', 'Reason (the organization sees this)': 'Dahilan (makikita ito ng organisasyon)',
  'Declined. The items are back in stock.': 'Tinanggihan. Bumalik sa stock ang mga gamit.', 'expires': 'mapapanis sa',
  // partners
  'Reusable items sorted at the hubs. Choose items from one hub, then ask for them.': 'Mga magagamit pang gamit na napagsunod-sunod sa mga hub. Pumili ng gamit mula sa iisang hub, saka hilingin.',
  'All hubs': 'Lahat ng hub', 'No items in stock right now. Check again later.': 'Walang gamit sa stock ngayon. Tingnan ulit mamaya.',
  'Notes': 'Tala', 'Repaired': 'Inayos', 'Ask for these items': 'Hilingin ang mga gamit na ito',
  'Note for the hub (optional)': 'Tala para sa hub (opsyonal)', 'For example: who will pick them up, and when': 'Halimbawa: sino ang kukuha, at kailan',
  'Send request': 'Ipadala ang hiling', 'Request sent. The hub will hand the items over.': 'Naipadala ang hiling. Ibibigay ng hub ang mga gamit.',
  'received': 'natanggap', 'kept in use': 'nagagamit pa', 'No requests yet. Choose items on Available items.': 'Wala pang hiling. Pumili ng gamit sa Mga makukuhang gamit.',
  'Take back': 'Bawiin', 'Request taken back.': 'Nabawi ang hiling.', 'We received them': 'Natanggap na namin', 'Thank you. Marked as received.': 'Salamat. Minarkahang natanggap.',
  // accounts
  'Residents sign up in the app. Staff, partner and admin accounts are made here.': 'Nagsa-sign up sa app ang mga residente. Dito ginagawa ang account ng staff, partner at admin.',
  'New account': 'Bagong account', 'Search': 'Maghanap', 'Name, email or phone': 'Pangalan, email o telepono', 'Role': 'Tungkulin', 'Contact': 'Contact',
  'No hub yet': 'Wala pang hub', 'Suspended': 'Naka-suspend', 'Active': 'Aktibo', 'Asked to be deleted': 'Humiling na burahin', 'You': 'Ikaw',
  'Hubs': 'Mga hub', 'Reset the password of': 'I-reset ang password ni',
  'Do this only after checking who the person is. They are logged out everywhere and must choose a new password.':
    'Gawin lang ito matapos tiyakin kung sino ang tao. Mala-log out siya kahit saan at kailangang pumili ng bagong password.',
  'Reset password': 'I-reset ang password', 'Reinstate': 'Ibalik', 'Reinstated.': 'Naibalik.', 'Suspend': 'I-suspend', 'Suspended.': 'Na-suspend.',
  'They are logged out at once and cannot log in until reinstated.': 'Mala-log out sila agad at hindi makakapag-log in hanggang maibalik.',
  'Delete the account of': 'Burahin ang account ni', 'Delete account': 'Burahin ang account', 'Account deleted.': 'Nabura ang account.',
  'Their name and contact details are removed for good. Item weights and points stay without a name.':
    'Tuluyang aalisin ang pangalan at contact nila. Mananatili ang bigat ng gamit at points nang walang pangalan.',
  'Temporary password for': 'Pansamantalang password para kay',
  'Give it to the person now. It is shown only once. They must change it when they log in.':
    'Ibigay ito sa tao ngayon. Isang beses lang ito ipapakita. Kailangan niya itong palitan pag-log in.',
  'Account made.': 'Nagawa ang account.', 'Full name': 'Buong pangalan', 'Phone': 'Telepono', 'optional': 'opsyonal', 'Organization': 'Organisasyon',
  'Kind of organization': 'Uri ng organisasyon', 'Works at': 'Nagtatrabaho sa', 'Make account': 'Gawin ang account', 'Hubs of': 'Mga hub ni', 'Saved.': 'Na-save.',
  // partner organizations
  'Shelters, schools and NGOs that receive reusable items. Check each one before approving.': 'Mga shelter, paaralan at NGO na tumatanggap ng magagamit pang gamit. Suriin ang bawat isa bago aprubahan.',
  'Received': 'Natanggap', 'Approve': 'Aprubahan', 'Approved.': 'Naaprubahan.',
  'They cannot ask for items until approved again. Requests not handed over yet are cancelled and the items go back to stock.':
    'Hindi sila makakahiling ng gamit hanggang maaprubahan ulit. Makakansela ang mga hiling na hindi pa naibibigay at babalik sa stock ang mga gamit.',
  // hubs, recyclers, categories
  'Edit': 'I-edit', 'New hub': 'Bagong hub', 'Type': 'Uri', 'Address': 'Address', 'Staff': 'Staff', 'Opening hours': 'Oras ng bukas',
  'Open drop-off codes for this hub stop working. Residents can choose another hub.': 'Hindi na gagana ang bukas na drop-off code para sa hub na ito. Puwedeng pumili ng ibang hub ang mga residente.',
  'Recyclers': 'Mga recycler', 'Only accredited recyclers may take e-waste and batteries.': 'Accredited na recycler lang ang puwedeng tumanggap ng e-waste at baterya.',
  'Takes': 'Tumatanggap ng', 'Accredited': 'Accredited', 'Activate': 'I-activate', 'Deactivate': 'I-deactivate', 'New recycler': 'Bagong recycler',
  'Plastic, cans, paper': 'Plastik, lata, papel', 'Add': 'Idagdag', 'Recycler added.': 'Naidagdag ang recycler.',
  'Points per kg decide what each item earns. CO2 figures are estimates and are shown as such.': 'Ang points bawat kg ang nagpapasya kung ilang points ang bawat gamit. Tantiya lang ang mga bilang ng CO2 at ipinapakita bilang tantiya.',
  'New category': 'Bagong kategorya', 'kg CO2e / kg': 'kg CO2e / kg', 'Short code': 'Maikling code', 'Name in English': 'Pangalan sa Ingles',
  'Name in Filipino': 'Pangalan sa Filipino', 'Points per kg (0 to 50)': 'Points bawat kg (0 hanggang 50)', 'kg CO2e avoided per kg (estimate)': 'kg CO2e na naiwasan bawat kg (tantiya)',
  'Hazardous (accredited recyclers only)': 'Mapanganib (accredited na recycler lang)', 'Sealed food (expiry date checked)': 'Selyadong pagkain (sinusuri ang petsa ng pagkapanis)',
  'Accepted at hubs': 'Tinatanggap sa mga hub',
  // flags and audit
  'Check with the hub staff before deciding. Points of a flagged drop-off stay pending until then.': 'Kausapin muna ang hub staff bago magpasya. Nakabinbin ang points ng na-flag na drop-off hanggang doon.',
  'No flags here.': 'Walang flag dito.', 'Why': 'Bakit', 'Details': 'Detalye', 'Weights are real': 'Totoo ang bigat', 'Cancel the points': 'Kanselahin ang points',
  'Cleared. The points go on.': 'Naayos. Tuloy ang points.', 'Cancel the points of this drop-off?': 'Kanselahin ang points ng drop-off na ito?',
  'Every point from this drop-off is cancelled and the resident is told. This cannot be undone.': 'Makakansela ang lahat ng points mula sa drop-off na ito at sasabihan ang residente. Hindi na ito maibabalik.',
  'Points cancelled.': 'Nakansela ang points.', 'Every change, who made it and when. Nobody can edit or delete it.': 'Bawat pagbabago, sino ang gumawa at kailan. Walang makakapag-edit o makakapagbura nito.',
  'Show': 'Ipakita', 'Everything': 'Lahat', 'When': 'Kailan', 'Who': 'Sino', 'What': 'Ano', 'Load more': 'Mag-load pa',
  // password
  'Choose your own password': 'Pumili ng sariling password', 'Current password': 'Kasalukuyang password', 'Temporary password': 'Pansamantalang password',
  'New password': 'Bagong password', 'New password again': 'Bagong password ulit', 'At least 8 characters': 'Hindi bababa sa 8 character',
  'Save new password': 'I-save ang bagong password', 'The new password needs at least 8 characters.': 'Kailangan ng hindi bababa sa 8 character ang bagong password.',
  'The two new passwords are not the same.': 'Hindi magkapareho ang dalawang bagong password.',
  'Password changed. Other sessions were logged out.': 'Napalitan ang password. Na-log out ang ibang session.',
  'An admin gave you a temporary password. Pick a new one that only you know.': 'Binigyan ka ng admin ng pansamantalang password. Pumili ng bago na ikaw lang ang nakakaalam.',
  // common
  'Name': 'Pangalan', 'Status': 'Katayuan', 'Cancel': 'Kanselahin', 'Save': 'I-save', 'Close': 'Isara', 'Done': 'Tapos na', 'All': 'Lahat',
  'Loading...': 'Naglo-load...', 'Nothing here yet.': 'Wala pa rito.', 'Try again': 'Subukan muli', 'Yes': 'Oo', 'No': 'Hindi',
  // server codes, in Filipino
  school: 'Paaralan', barangay: 'Barangay', other: 'Iba pa', active: 'Aktibo', paused: 'Naka-pause', closed: 'Sarado', inactive: 'Hindi aktibo',
  pending: 'Naghihintay', approved: 'Aprubado', suspended: 'Naka-suspend', confirmed: 'Kumpirmado', cancelled: 'Kinansela',
  reuse: 'Gamitin muli', repair: 'Ayusin', recycle: 'I-recycle', reject: 'Tanggihan',
  in_stock: 'Nasa stock', in_repair: 'Inaayos', in_recycle_batch: 'Para i-recycle', rejected: 'Tinanggihan', released: 'Naibigay', recycled: 'Na-recycle',
  requested: 'Hiniling', picked_up: 'Nakuha na',
  role_resident: 'Residente', role_staff: 'Hub staff', role_partner: 'Partner', role_admin: 'Admin',
  org_shelter: 'Shelter', org_school: 'Paaralan', org_ngo: 'NGO', org_other: 'Iba pa',
  flag_open: 'Bukas', flag_cleared: 'Naayos', flag_upheld: 'Kinansela ang points',
  heavy_drop_off: 'Mabigat na drop-off (lampas 50 kg)', heavy_resident_month: 'Lampas 100 kg sa 30 araw', hub_day_spike: 'Biglang dami sa hub ngayong araw',
  entity_user: 'Mga account', entity_declaration: 'Mga drop-off', entity_item: 'Mga gamit', entity_release: 'Mga ibinigay sa partner',
  entity_recycle_batch: 'Mga recycle batch', entity_flag: 'Mga flag', entity_partner: 'Mga partner', entity_hub: 'Mga hub', entity_recycler: 'Mga recycler', entity_category: 'Mga kategorya',
};

// English labels for codes the server sends.
const EN = {
  school: 'School', barangay: 'Barangay', other: 'Other', active: 'Active', paused: 'Paused', closed: 'Closed', inactive: 'Inactive',
  pending: 'Pending', approved: 'Approved', suspended: 'Suspended', confirmed: 'Confirmed', cancelled: 'Cancelled',
  reuse: 'Reuse', repair: 'Repair', recycle: 'Recycle', reject: 'Reject',
  in_stock: 'In stock', in_repair: 'In repair', in_recycle_batch: 'For recycling', rejected: 'Rejected', released: 'Handed over', recycled: 'Recycled',
  requested: 'Requested', picked_up: 'Received',
  role_resident: 'Resident', role_staff: 'Hub staff', role_partner: 'Partner', role_admin: 'Admin',
  org_shelter: 'Shelter', org_school: 'School', org_ngo: 'NGO', org_other: 'Other',
  flag_open: 'Open', flag_cleared: 'Cleared', flag_upheld: 'Points cancelled',
  heavy_drop_off: 'Heavy drop-off (over 50 kg)', heavy_resident_month: 'Over 100 kg in 30 days', hub_day_spike: 'Unusual day at the hub',
  entity_user: 'Accounts', entity_declaration: 'Drop-offs', entity_item: 'Items', entity_release: 'Releases',
  entity_recycle_batch: 'Recycle batches', entity_flag: 'Flags', entity_partner: 'Partners', entity_hub: 'Hubs', entity_recycler: 'Recyclers', entity_category: 'Categories',
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

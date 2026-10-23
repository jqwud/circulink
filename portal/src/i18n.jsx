// Filipino / English toggle. The English text itself is the key, so a missing translation just shows English.
import { createContext, useContext, useState, useCallback } from 'react';

const FIL = {
  // navigation
  'Dashboard': 'Dashboard', 'Verification': 'Beripikasyon', 'Residents': 'Mga Residente', 'Listings': 'Mga Listahan',
  'Barangay Shelf': 'Barangay Shelf', 'Transactions': 'Mga Transaksyon', 'Reports & disputes': 'Mga Report at Hidwaan',
  'Announcements': 'Mga Anunsyo', 'Impact': 'Epekto', 'Rules': 'Mga Patakaran', 'Staff & audit log': 'Staff at audit log',
  'Log out': 'Mag-log out', 'LGU Portal': 'Portal ng LGU',
  // login
  'Staff login': 'Login ng Staff', 'Email': 'Email', 'Password': 'Password', 'Log in': 'Mag-log in',
  'Signing in...': 'Nag-log in...', 'This portal is for barangay and LGU staff only.': 'Ang portal na ito ay para lamang sa staff ng barangay at LGU.',
  'Demo accounts (password hiraman123): admin@hiraman.test or staff@hiraman.test': 'Mga demo account (password hiraman123): admin@hiraman.test o staff@hiraman.test',
  // dashboard
  'Good day': 'Magandang araw', 'Here is what Hiraman looks like today.': 'Ito ang kalagayan ng Hiraman ngayon.',
  'Needs your attention': 'Kailangan ng iyong atensyon', 'Everything is in order. Pawsa is taking a nap.': 'Maayos ang lahat. Natutulog muna si Pawsa.',
  'Verified residents': 'Beripikadong residente', 'Active listings': 'Aktibong listahan', 'Shelf items': 'Gamit sa Shelf',
  'Items out on loan': 'Mga gamit na hiniram', 'Completed loans': 'Natapos na hiraman', 'Return rate': 'Rate ng pagbabalik',
  'Purchases avoided': 'Iniwasang pagbili', 'Loans this week': 'Hiraman ngayong linggo',
  'IDs waiting for review': 'Mga ID na naghihintay ng review', 'Staff approvals waiting': 'Mga aprubal na naghihintay',
  'Overdue items': 'Mga lampas na sa takdang araw', 'Open reports': 'Bukas na report',
  // common
  'Name': 'Pangalan', 'Phone': 'Telepono', 'Purok': 'Purok', 'Status': 'Katayuan', 'Credits': 'Credits', 'Actions': 'Aksyon',
  'Search': 'Maghanap', 'All': 'Lahat', 'Approve': 'Aprubahan', 'Reject': 'Tanggihan', 'Cancel': 'Kanselahin', 'Save': 'I-save',
  'Close': 'Isara', 'Reason': 'Dahilan', 'Remove': 'Alisin', 'Restore': 'Ibalik', 'View': 'Tingnan', 'Loading...': 'Naglo-load...',
  'Nothing here yet.': 'Wala pa rito.', 'Try again': 'Subukan muli', 'Item': 'Gamit', 'Borrower': 'Humihiram', 'Owner': 'May-ari',
  'Dates': 'Petsa', 'Tier': 'Tier', 'Category': 'Kategorya', 'Condition': 'Kondisyon', 'Date': 'Petsa', 'Details': 'Detalye',
  'Send': 'Ipadala', 'Add': 'Idagdag', 'Edit': 'I-edit', 'Yes': 'Oo', 'No': 'Hindi', 'Photo': 'Larawan', 'Optional': 'Opsyonal',
  'Notes': 'Mga tala', 'Outcome': 'Kinalabasan', 'Reporter': 'Nag-report', 'Target': 'Pinag-uulatan', 'Created': 'Ginawa',
  // statuses
  'pending': 'naghihintay', 'approved': 'aprubado', 'rejected': 'tinanggihan', 'unverified': 'hindi pa beripikado',
  'cancelled': 'kinansela', 'handed_over': 'nasa humihiram', 'closed': 'tapos na', 'disputed': 'may hidwaan', 'expired': 'nag-expire',
  'available': 'available', 'paused': 'naka-pause', 'removed': 'inalis', 'open': 'bukas', 'in_mediation': 'sa mediation',
  'resolved': 'naresolba', 'low': 'mababa', 'medium': 'katamtaman', 'high': 'mataas', 'good': 'maayos', 'damaged': 'sira',
  'lost': 'nawala', 'new': 'bago', 'fair': 'katamtaman', 'worn': 'luma', 'suspended': 'suspendido',
  // verification
  'Verification queue': 'Pila ng beripikasyon', 'Review each resident\'s ID, then approve or ask them to fix it.': 'Suriin ang ID ng bawat residente, saka aprubahan o ipaayos.',
  'Waiting for review': 'Naghihintay ng review', 'No IDs are waiting. Nice work!': 'Walang naghihintay na ID. Magaling!',
  'View ID': 'Tingnan ang ID', 'ID photo': 'Larawan ng ID', 'Why is it being rejected?': 'Bakit ito tinatanggihan?',
  'Tell the resident what to fix, for example: "ID photo is blurry, please retake."': 'Sabihin sa residente kung ano ang aayusin, hal. "Malabo ang ID, paki-kuha ulit."',
  'Resident was asked to fix their ID.': 'Pinaayos sa residente ang ID.',
  'Check that the name matches the account, the photo is clear, and the address is in this barangay.': 'Tiyaking tugma ang pangalan sa account, malinaw ang larawan, at nasa barangay na ito ang tirahan.',
  'Registered': 'Nagparehistro', 'Reject with reason': 'Tanggihan na may dahilan',
  // residents
  'Search name, email or phone': 'Hanapin ang pangalan, email o telepono', 'Items listed': 'Mga naka-list na gamit',
  'Loans done': 'Natapos na hiraman', 'Suspend': 'I-suspend', 'Reinstate': 'Ibalik', 'Loan history': 'Kasaysayan ng hiraman', 'With': 'Kasama',
  'Credit history': 'Kasaysayan ng credits', 'Resident': 'Residente', 'Back to residents': 'Bumalik sa mga residente',
  // listings
  'Listings moderation': 'Moderasyon ng mga listahan', 'Remove listings that break the community rules. The owner is told why.': 'Alisin ang mga listahang lumalabag sa patakaran. Sasabihan ang may-ari kung bakit.',
  'Search item or owner': 'Hanapin ang gamit o may-ari', 'Owner / source': 'May-ari / pinagmulan', 'Why is this being removed?': 'Bakit ito inaalis?',
  'Remove listing': 'Alisin ang listahan', 'Shelf': 'Shelf', 'Resident item': 'Gamit ng residente', 'On loan': 'Hiniram',
  // shelf
  'Community-owned items kept at the barangay hall. Borrowing them is free, and staff hand them over and take them back.': 'Mga gamit ng komunidad na nasa barangay hall. Libre ang hiramin at staff ang nag-aabot at tumatanggap pabalik.',
  'Add shelf item': 'Magdagdag ng gamit sa Shelf', 'Item name': 'Pangalan ng gamit', 'Description': 'Paglalarawan', 'Pickup point': 'Pickup point',
  'Pause': 'I-pause', 'Make available': 'Gawing available', 'Shelf item added.': 'Naidagdag ang gamit sa Shelf.',
  'Low: auto-approved': 'Mababa: kusang aprubado', 'Medium: staff approve': 'Katamtaman: aprubal ng staff', 'High: hall handover only': 'Mataas: sa hall lang iaabot',
  'Repair and Reuse': 'Ayusin at Gamitin Muli',
  // transactions
  'Needs action': 'Kailangan ng aksyon', 'Overdue': 'Lampas na', 'Every transaction': 'Lahat ng transaksyon',
  'Approvals, handovers and returns for items the barangay handles, plus every loan in the system.': 'Mga aprubal, pag-abot at pagbabalik ng mga gamit na hawak ng barangay, at lahat ng hiraman sa sistema.',
  'Confirm handover': 'Kumpirmahin ang pag-abot', 'Confirm return': 'Kumpirmahin ang pagbabalik', 'Send reminders now': 'Magpadala ng paalala ngayon',
  'Reminders sent': 'Naipadala ang mga paalala', 'Return condition': 'Kondisyon sa pagbabalik', 'Damaged or lost items go to a dispute for mediation.': 'Ang sira o nawalang gamit ay mapupunta sa hidwaan para sa mediation.',
  'Condition photo (required for medium and high tier)': 'Larawan ng kondisyon (kailangan sa katamtaman at mataas)', 'Barangay handles': 'Hawak ng barangay',
  'day(s) late': 'araw na huli',
  'ESTIMATE, not a measurement. Low = items where the borrower answered "yes, I would have bought or rented it" x average product weight for the category. High adds "maybe" answers. One loan does not equal one product not made.': 'TANTIYA ito, hindi sukat. Mababa = mga gamit na sinagot ng humiram ng "oo, bibilhin o uupahan ko sana ito" x karaniwang bigat ng produkto sa kategorya. Mataas = kasama ang mga sagot na "baka". Ang isang hiraman ay hindi katumbas ng isang produktong hindi nagawa.', 'Due': 'Takdang araw', 'Contact': 'Kontakin', 'Nothing needs action right now.': 'Walang kailangang aksyunan ngayon.',
  'Saved.': 'Na-save.', 'Done.': 'Tapos na.', 'Search item or borrower': 'Hanapin ang gamit o humihiram', 'Credit cost': 'Gastos sa credit',
  // reports
  'Reports and disputes': 'Mga report at hidwaan', 'Mediate cases between neighbors. Write the outcome before closing a case.': 'Mamagitan sa mga kaso ng magkapitbahay. Isulat ang kinalabasan bago isara ang kaso.',
  'Start mediation': 'Simulan ang mediation', 'Resolve case': 'Isara ang kaso', 'Mediator notes': 'Tala ng mediator', 'Also mark the loan as closed': 'Isara rin ang hiraman',
  'No reports. Pawsa is happy.': 'Walang report. Masaya si Pawsa.', 'Case updated.': 'Na-update ang kaso.',
  // announcements
  'Announcements to residents': 'Mga anunsyo sa mga residente', 'Residents get the message as a notification in the app.': 'Matatanggap ng mga residente ang mensahe bilang notification sa app.',
  'New announcement': 'Bagong anunsyo', 'Title': 'Pamagat', 'Message': 'Mensahe', 'Send to': 'Ipadala sa', 'Everyone': 'Lahat',
  'Sent announcements': 'Mga naipadalang anunsyo', 'Sent to': 'Naipadala sa', 'residents': 'residente',
  // impact
  'Impact analytics': 'Pagsusuri ng epekto', 'Measured numbers first, estimates clearly labeled.': 'Mga nasukat na bilang muna, at malinaw na may label ang mga tantiya.',
  'Loans per month': 'Hiraman bawat buwan', 'Loans by category': 'Hiraman ayon sa kategorya', 'Measured': 'Nasukat', 'Estimate': 'Tantiya',
  'Download transactions (CSV)': 'I-download ang mga transaksyon (CSV)', 'Items reused': 'Mga gamit na nagamit muli', 'Survey answers': 'Sagot sa survey',
  '"Yes" answers (purchases avoided)': 'Sagot na "Oo" (iniwasang pagbili)', 'Estimated new products not made (kg)': 'Tantiyang bigat ng bagong produktong hindi nagawa (kg)',
  'How this estimate is made': 'Paano ginawa ang tantiyang ito', 'No data yet.': 'Wala pang datos.', 'Active residents': 'Aktibong residente',
  // rules
  'Rules and settings': 'Mga patakaran at setting', 'These rules are built into the system. To change them, ask the Hiraman team.': 'Nakapaloob ang mga patakarang ito sa sistema. Para baguhin, kausapin ang Hiraman team.',
  'Credit rules': 'Patakaran sa credits', 'Item risk tiers': 'Mga tier ng panganib ng gamit', 'Prohibited words in listings': 'Mga ipinagbabawal na salita sa listahan',
  'Pickup points': 'Mga pickup point', 'Starter credits': 'Starter credits', 'Lender reward': 'Gantimpala sa nagpapahiram', 'Late return penalty': 'Parusa sa late na pagbabalik',
  'Maximum loan days': 'Pinakamaraming araw ng hiram', 'Monthly reward cap per pair': 'Limit ng gantimpala bawat buwan sa magkapares', 'Shelf item cost': 'Halaga ng gamit sa Shelf',
  'Approval': 'Aprubal', 'Handover': 'Pag-abot', 'Example': 'Halimbawa',
  // staff
  'Staff accounts': 'Mga account ng staff', 'Add staff': 'Magdagdag ng staff', 'Role': 'Tungkulin', 'Staff': 'Staff', 'Admin': 'Admin', 'Full name': 'Buong pangalan',
  'At least 8 characters': 'Hindi bababa sa 8 character', 'Disable': 'I-disable', 'Enable': 'I-enable', 'Audit log': 'Audit log', 'Who': 'Sino', 'What': 'Ano', 'When': 'Kailan',
  'Staff accounts are created by an admin. Every action is written to the audit log.': 'Admin ang gumagawa ng account ng staff. Nakatala sa audit log ang bawat aksyon.',
  'Staff account added.': 'Naidagdag ang account ng staff.',
  'Account disabled.': 'Na-disable ang account.', 'Account enabled.': 'Na-enable ang account.',
  'Disable {name}?': 'I-disable si {name}?', 'They can no longer log in to the portal. You can enable the account again any time.': 'Hindi na sila makakapag-log in sa portal. Pwede mong i-enable ulit ang account kahit kailan.',
  // residents
  'Suspend {name}?': 'I-suspend si {name}?', 'They cannot use Hiraman until you reinstate them.': 'Hindi nila magagamit ang Hiraman hanggang i-reinstate mo sila.',
  'Suspended.': 'Na-suspend.', 'Reinstated.': 'Na-reinstate.',
  // credit history reasons
  'starter': 'panimulang credits', 'borrow_hold': 'nakalaan para sa hiram', 'refund_rejected': 'ibinalik: hindi inaprubahan',
  'refund_cancelled': 'ibinalik: kinansela', 'refund_expired': 'ibinalik: nag-expire', 'refund_item_removed': 'ibinalik: inalis ang gamit',
  'lend_reward': 'gantimpala sa pagpapahiram', 'late_penalty': 'parusa sa late na pagbabalik',
  // daily check-ins
  'Loans with no check-in for 2+ days': 'Mga hiram na walang check-in nang 2+ araw', 'Missed check-ins': 'Hindi nasagot na check-in',
  'Borrower says returned': 'Sabi ng humiram, naibalik na', 'No check-in': 'Walang check-in', 'days': 'araw',
  // report reasons
  'item_damaged': 'nasira ang gamit', 'item_lost': 'nawala ang gamit', 'item_condition': 'kondisyon ng gamit', 'checkin_problem': 'problemang sinabi sa check-in',
  'Item is not as described': 'Iba ang gamit sa paglalarawan', 'Unsafe or prohibited item': 'Mapanganib o bawal na gamit', 'Did not show up': 'Hindi sumipot',
  'Rude or unsafe behavior': 'Bastos o mapanganib na asal', 'Something else': 'Iba pa',
  // settling a dispute
  'How was it settled?': 'Paano ito naayos?', 'Choose how the dispute was settled.': 'Piliin kung paano naayos ang hidwaan.',
  'settle_fine': 'Maayos naman pala', 'settle_accident': 'Aksidente, walang may kasalanan', 'settle_borrower_fault': 'Sinira ng humiram', 'settle_lost': 'Nawala ang gamit',
  'Normal return rules: the lender earns 1 if it was on time; a late borrower loses 1.': 'Karaniwang patakaran: +1 sa nagpahiram kung nasa oras; -1 sa humiram kung late.',
  'the item is removed': 'aalisin ang gamit', 'Never below 0.': 'Hindi bababa sa 0.',
  // message threads
  'Messages': 'Mga mensahe', 'No messages yet.': 'Wala pang mensahe.', 'Barangay staff': 'Barangay staff',
  'Write a message': 'Sumulat ng mensahe', 'This conversation is closed.': 'Sarado na ang usapang ito.',
  // privacy and account deletion
  'Account deletion requests': 'Mga hiling na burahin ang account', 'Deletion requested': 'Hiniling na burahin',
  'Delete account': 'Burahin ang account', 'Delete account (requested)': 'Burahin ang account (hiniling)', 'Account deleted.': 'Nabura ang account.',
  "Delete {name}'s account?": 'Burahin ang account ni {name}?',
  // passwords
  'Change password': 'Palitan ang password', 'Choose your own password': 'Pumili ng sarili mong password',
  'An admin gave you a temporary password. Pick a new one that only you know.': 'Binigyan ka ng admin ng pansamantalang password. Pumili ng bago na ikaw lang ang nakakaalam.',
  'Temporary password': 'Pansamantalang password', 'Current password': 'Kasalukuyang password', 'New password': 'Bagong password',
  'New password again': 'Ulitin ang bagong password', 'Save new password': 'I-save ang bagong password',
  'The new password needs at least 8 characters.': 'Kailangan ng hindi bababa sa 8 na character ang bagong password.',
  'The two new passwords are not the same.': 'Hindi magkapareho ang dalawang bagong password.',
  'Password changed. Other sessions were logged out.': 'Napalitan ang password. Na-log out ang ibang session.',
  'Reset password': 'I-reset ang password', 'Reset the password of {name}?': 'I-reset ang password ni {name}?',
  'Do this only with the person in front of you, after checking their ID. They will be logged out everywhere and must pick a new password when they log in.':
    'Gawin lang ito kapag kaharap mo ang tao at nasuri na ang ID niya. Mala-log out siya sa lahat ng device at kailangang pumili ng bagong password pag nag-log in.',
  'Give it to the person now. It is shown only once. They must change it when they log in.':
    'Ibigay ito sa tao ngayon. Isang beses lang ito ipapakita. Kailangan niya itong palitan pag nag-log in.',
  'Done': 'Tapos',
  // approvals, puroks and listings
  'Resident approved. {n} starter credits given.': 'Naaprubahan ang residente. Nabigyan ng {n} panimulang credits.', 'Resident approved.': 'Naaprubahan ang residente.',
  'Puroks': 'Mga purok', 'Residents choose one of these when they sign up.': 'Pipili ang mga residente ng isa rito pag nag-sign up.',
  'New purok name': 'Pangalan ng bagong purok', 'Purok added.': 'Naidagdag ang purok.', 'Purok removed.': 'Inalis ang purok.',
  'Remove {name}?': 'Alisin ang {name}?', 'New residents will not see it. People who already chose it keep it.': 'Hindi na ito makikita ng mga bagong residente. Mananatili ito sa mga nakapili na.',
  'Removed by the owner': 'Inalis ng may-ari',
  // staff control
  'Edit, hide or remove any listing. The owner is told why.': 'I-edit, itago o alisin ang anumang listing. Sasabihan ang may-ari kung bakit.',
  'Review': 'Pagsusuri', 'Flagged for review': 'Naka-flag para suriin', 'Hidden by staff': 'Itinago ng staff', 'Visible': 'Nakikita',
  'Note to owner': 'Paalala sa may-ari', 'Hide': 'Itago', 'Show': 'Ipakita', 'Looks fine, show it': 'Maayos, ipakita na', 'Restored.': 'Naibalik.',
  'Visible to neighbors again.': 'Nakikita na ulit ng mga kapitbahay.', 'Hide listing': 'Itago ang listing',
  'Neighbors stop seeing it and its waiting requests are refunded. The owner sees your reason and you can show it again later.':
    'Hindi na ito makikita ng mga kapitbahay at ibabalik ang credits ng mga naghihintay na hiling. Makikita ng may-ari ang dahilan mo at maipapakita mo ulit ito mamaya.',
  'The listing is removed for good. Its waiting requests are refunded.': 'Permanenteng aalisin ang listing. Ibabalik ang credits ng mga naghihintay na hiling.',
  'Reason the owner will see': 'Dahilang makikita ng may-ari', 'Hidden from neighbors.': 'Itinago sa mga kapitbahay.', 'Removed.': 'Inalis.',
  'Edit listing': 'I-edit ang listing',
  'Cancel request': 'Kanselahin ang hiling', 'Keep it': 'Huwag na',
  'The borrower gets the held credits back. Both neighbors see your reason.': 'Maibabalik sa humiram ang nakalaang credits. Makikita ng dalawang kapitbahay ang dahilan mo.',
  'Listings flagged as possibly harmful': 'Mga listing na posibleng mapanganib',
  '{n} listing(s) may harm the community': '{n} listing ang posibleng makasama sa komunidad',
  'They are hidden from neighbors until you check them. Review them first.': 'Nakatago ang mga ito sa mga kapitbahay hanggang masuri mo. Unahin itong suriin.',
  'Review now': 'Suriin ngayon', 'flagged': 'naka-flag',
  // editable rules
  'Admins can change the rule numbers. Every change is written to the audit log.': 'Mababago ng admin ang mga numero ng patakaran. Nakatala sa audit log ang bawat pagbabago.',
  'Change numbers': 'Baguhin ang mga numero', 'Change rule numbers': 'Baguhin ang mga numero ng patakaran',
  'Changes apply right away to new requests and returns. Every change is written to the audit log.': 'Agad na gagana ang mga pagbabago sa mga bagong hiling at pagbabalik. Nakatala sa audit log ang bawat pagbabago.',
  'Load more': 'Magpakita pa', 'Allowed': 'Puwede', 'Default': 'Orihinal', 'Review changes': 'Suriin ang mga pagbabago', 'Change these rules?': 'Babaguhin ang mga patakarang ito?',
  'Rules updated. The app uses them right away.': 'Na-update ang mga patakaran. Agad itong gagamitin ng app.',
  'Cost of an ordinary item (low or medium)': 'Halaga ng karaniwang gamit (low o medium)', 'Cost of a valuable item (high)': 'Halaga ng mamahaling gamit (high)',
  'Days before an unanswered request expires': 'Araw bago mag-expire ang hiling na walang sagot', 'Missed check-ins before the owner is alerted': 'Hindi nasagot na check-in bago abisuhan ang may-ari',
  'flag_disguised_word': 'mukhang bawal na gamit na itinago ang pagkakasulat', 'flag_value_tier': 'mamahaling gamit na hindi high tier',
  'flag_new_account_burst': 'maraming listing mula sa bagong account', 'flag_reported': 'inireport ng ilang kapitbahay',
  'Their name, contact details, ID photo and messages are removed for good. Loan records stay without their name. This cannot be undone.':
    'Permanenteng aalisin ang pangalan, contact, litrato ng ID at mga mensahe nila. Mananatili ang mga tala ng hiraman nang walang pangalan nila. Hindi na ito maibabalik.',
};

// English labels for the raw words the server sends (statuses, tiers, conditions, credit reasons),
// so English mode shows "Borrowed" instead of "handed_over".
const EN = {
  'pending': 'Pending', 'approved': 'Approved', 'rejected': 'Rejected', 'unverified': 'Not verified', 'cancelled': 'Cancelled',
  'handed_over': 'Borrowed', 'closed': 'Returned', 'disputed': 'Disputed', 'expired': 'Expired', 'available': 'Available',
  'paused': 'Paused', 'removed': 'Removed', 'open': 'Open', 'in_mediation': 'In mediation', 'resolved': 'Resolved',
  'low': 'Low', 'medium': 'Medium', 'high': 'High', 'good': 'Good', 'damaged': 'Damaged', 'lost': 'Lost', 'new': 'New',
  'fair': 'Fair', 'worn': 'Worn', 'suspended': 'Suspended',
  'starter': 'starter credits', 'borrow_hold': 'held for a borrow', 'refund_rejected': 'returned: not approved',
  'refund_cancelled': 'returned: cancelled', 'refund_expired': 'returned: request expired', 'refund_item_removed': 'returned: item removed',
  'lend_reward': 'reward for lending', 'late_penalty': 'late return penalty',
  'item_damaged': 'Item damaged', 'item_lost': 'Item lost', 'item_condition': 'Item condition', 'checkin_problem': 'Problem reported at check-in',
  'flag_disguised_word': 'looks like a banned item written in disguise', 'flag_value_tier': 'valuable item listed below the high tier',
  'flag_new_account_burst': 'many listings from a brand-new account', 'flag_reported': 'reported by several neighbors',
  'settle_fine': 'It was fine after all', 'settle_accident': 'An accident, nobody to blame', 'settle_borrower_fault': 'Damaged by the borrower', 'settle_lost': 'The item was lost',
};

const Ctx = createContext(null);
const KEY = 'hiraman_portal_lang';

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem(KEY) || 'fil');
  const setLang = useCallback((l) => { localStorage.setItem(KEY, l); setLangState(l); document.documentElement.lang = l === 'fil' ? 'fil' : 'en'; }, []);
  const t = useCallback((s) => (lang === 'fil' && FIL[s]) || EN[s] || s, [lang]);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export const FIL_PHRASES = Object.keys(FIL);

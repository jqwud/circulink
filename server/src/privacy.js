// The privacy notice (Data Privacy Act of 2012, RA 10173), in English and Filipino, served to the app at
// GET /api/privacy. Change PRIVACY_VERSION whenever the meaning changes: everyone is asked to agree again.
// The barangay fills in its Data Protection Officer in .env (DPO_NAME, DPO_EMAIL, DPO_PHONE).
import { RULES } from './rules.js';

export const PRIVACY_VERSION = '2026-10-24';

const SECTIONS = {
  en: [
    ['What we collect',
      'Your name, email, phone number, purok and password (stored scrambled). A photo of your ID, to check that you live in the barangay. '
      + 'The items you list or give away, your requests, loans and donation claims, daily check-ins, the quick replies you send, ratings, reports and concerns you send to the barangay, and your credit history.'],
    ['Why',
      'To verify that members are residents, to run borrowing and lending, to keep everyone safe, to settle problems, and to count how much '
      + 'the barangay saves together. Only totals are shared in reports, never names.'],
    ['Who sees it',
      `Neighbors see your first name and purok. After a request is approved, the two neighbors of that loan see each other's phone number until ${RULES.contactDaysAfterClose} days after it ends. `
      + 'If you give an item away and the barangay chooses who receives it, you are not told who it is. Your name is on the thank-you board only if you say yes. '
      + 'Barangay staff see your details and your ID photo to verify you and to help with problems. Nobody else. Your data is never sold.'],
    ['How long we keep it',
      `Your ID photo is deleted ${RULES.idPhotoRetentionDays} days after staff approve or reject it. Photos that were never used are deleted after a day. `
      + `Messages you typed before quick replies existed are deleted ${RULES.oldTextKeptDays} days after that loan ends. `
      + 'Everything else stays while you have an account. When your account is deleted, your name, contact details, ID photo and messages are removed; '
      + 'loan records stay without your name so the barangay\'s totals stay correct.'],
    ['Your rights',
      'You can see your data (Profile, My data), correct it (Profile), ask for your account to be deleted, and object or complain. '
      + 'Talk to the barangay\'s Data Protection Officer below, or to the National Privacy Commission (privacy.gov.ph).'],
  ],
  fil: [
    ['Ano ang kinokolekta namin',
      'Ang pangalan, email, numero ng telepono, purok at password mo (naka-encrypt). Litrato ng ID mo, para matiyak na nakatira ka sa barangay. '
      + 'Ang mga gamit na inilista o ipinamigay mo, ang mga hiling, hiram at kinuha mong libreng gamit, araw-araw na check-in, ang mga nakahandang sagot na ipinadala mo, rating, report at alalahaning ipinadala mo sa barangay, at kasaysayan ng credits mo.'],
    ['Bakit',
      'Para matiyak na residente ang mga miyembro, mapatakbo ang hiraman at pahiraman, mapanatiling ligtas ang lahat, maayos ang mga problema, '
      + 'at mabilang kung gaano kalaki ang natitipid ng barangay. Kabuuang bilang lang ang ibinabahagi sa mga ulat, hindi pangalan.'],
    ['Sino ang nakakakita',
      `Unang pangalan at purok mo lang ang nakikita ng mga kapitbahay. Kapag naaprubahan ang isang hiling, makikita ng dalawang magkapitbahay sa hiram na iyon ang numero ng isa't isa hanggang ${RULES.contactDaysAfterClose} araw pagkatapos nito. `
      + 'Kapag nagbigay ka ng gamit at barangay ang pumili ng tatanggap, hindi sasabihin sa iyo kung sino. Nasa thank-you board lang ang pangalan mo kung pumayag ka. '
      + 'Nakikita ng barangay staff ang mga detalye at litrato ng ID mo para ma-verify ka at matulungan sa mga problema. Wala nang iba. Hindi kailanman ibinebenta ang datos mo.'],
    ['Gaano katagal itatago',
      `Binubura ang litrato ng ID mo ${RULES.idPhotoRetentionDays} araw matapos itong aprubahan o tanggihan ng staff. Binubura pagkalipas ng isang araw ang mga litratong hindi nagamit. `
      + `Binubura ang mga mensaheng tinype mo bago nagkaroon ng nakahandang sagot ${RULES.oldTextKeptDays} araw matapos ang hiram na iyon. `
      + 'Ang iba ay mananatili habang may account ka. Kapag binura ang account mo, aalisin ang pangalan, contact, litrato ng ID at mga mensahe mo; '
      + 'mananatili ang mga tala ng hiraman nang walang pangalan mo para tama pa rin ang kabuuang bilang ng barangay.'],
    ['Ang iyong mga karapatan',
      'Makikita mo ang datos mo (Profile, Aking datos), maitatama ito (Profile), mahihiling na burahin ang account mo, at makakatutol o makakapagreklamo. '
      + 'Kausapin ang Data Protection Officer ng barangay sa ibaba, o ang National Privacy Commission (privacy.gov.ph).'],
  ],
};

export function privacyNotice(lang = 'fil') {
  const l = lang === 'en' ? 'en' : 'fil';
  const dpo = {
    name: process.env.DPO_NAME || null,
    email: process.env.DPO_EMAIL || null,
    phone: process.env.DPO_PHONE || null,
    fallback: l === 'en' ? 'Ask at the Barangay Hall help desk.' : 'Magtanong sa help desk ng Barangay Hall.',
  };
  return { version: PRIVACY_VERSION, lang: l, sections: SECTIONS[l].map(([title, body]) => ({ title, body })), dpo };
}

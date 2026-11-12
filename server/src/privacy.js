// The privacy notice (Data Privacy Act of 2012, RA 10173), in English and Filipino, served at GET /api/privacy.
// Change PRIVACY_VERSION whenever the meaning changes: everyone is asked to agree again.
// The operator fills in its Data Protection Officer in .env (DPO_NAME, DPO_EMAIL, DPO_PHONE).
import { RULES } from './rules.js';

export const PRIVACY_VERSION = '2026-11-12';

const SECTIONS = {
  en: [
    ['What we collect',
      'Your name, email, phone number, optional student ID and password (stored scrambled). The items you declare, the hub you bring them to, '
      + 'their weight and what happened to them (reused, repaired, recycled or rejected), your points, and the notifications we send you.'],
    ['Why',
      'To run drop-offs at hubs, to give points fairly and stop abuse, and to report how many kilograms the community keeps out of the landfill. '
      + 'Reports show totals only, never names.'],
    ['Who sees it',
      'Hub staff see your name and the items of your drop-off when they check it in. Admins see accounts to keep the system fair. '
      + 'Partner organizations that receive items never see who gave them. Your data is never sold.'],
    ['How long we keep it',
      `Photos that were never used are deleted after ${RULES.unusedUploadGraceHours} hours. Read notifications are deleted after ${RULES.notificationsKeptDays} days. `
      + 'Everything else stays while you have an account. When your account is deleted, your name and contact details are removed; '
      + 'item weights stay without your name so the totals stay correct.'],
    ['Your rights',
      'You can see your data (Profile, My data), correct it (Profile), ask for your account to be deleted, and object or complain. '
      + 'Talk to the Data Protection Officer below, or to the National Privacy Commission (privacy.gov.ph).'],
  ],
  fil: [
    ['Ano ang kinokolekta namin',
      'Ang pangalan, email, numero ng telepono, student ID (kung mayroon) at password mo (naka-encrypt). Ang mga gamit na idineklara mo, ang hub na pinagdalhan mo, '
      + 'ang bigat nila at kung ano ang nangyari sa kanila (ginamit muli, inayos, ni-recycle o tinanggihan), ang points mo, at ang mga abiso namin sa iyo.'],
    ['Bakit',
      'Para mapatakbo ang drop-off sa mga hub, makapagbigay ng points nang patas at mapigilan ang pandaraya, at maiulat kung ilang kilo ang hindi napunta sa tambakan. '
      + 'Kabuuang bilang lang ang nasa mga ulat, hindi pangalan.'],
    ['Sino ang nakakakita',
      'Nakikita ng hub staff ang pangalan mo at ang mga gamit sa drop-off mo kapag tinanggap nila ito. Nakikita ng mga admin ang mga account para manatiling patas ang sistema. '
      + 'Hindi kailanman nakikita ng mga partner na organisasyon kung sino ang nagbigay. Hindi kailanman ibinebenta ang datos mo.'],
    ['Gaano katagal itatago',
      `Binubura ang mga litratong hindi nagamit pagkalipas ng ${RULES.unusedUploadGraceHours} oras. Binubura ang nabasang abiso pagkalipas ng ${RULES.notificationsKeptDays} araw. `
      + 'Ang iba ay mananatili habang may account ka. Kapag binura ang account mo, aalisin ang pangalan at contact mo; '
      + 'mananatili ang bigat ng mga gamit nang walang pangalan mo para tama pa rin ang kabuuan.'],
    ['Ang iyong mga karapatan',
      'Makikita mo ang datos mo (Profile, Aking datos), maitatama ito (Profile), mahihiling na burahin ang account mo, at makakatutol o makakapagreklamo. '
      + 'Kausapin ang Data Protection Officer sa ibaba, o ang National Privacy Commission (privacy.gov.ph).'],
  ],
};

export function privacyNotice(lang = 'en') {
  const l = lang === 'fil' ? 'fil' : 'en';
  const dpo = {
    name: process.env.DPO_NAME || null,
    email: process.env.DPO_EMAIL || null,
    phone: process.env.DPO_PHONE || null,
    fallback: l === 'en' ? 'Ask the staff at any CircuLink hub.' : 'Magtanong sa staff ng kahit anong CircuLink hub.',
  };
  return { version: PRIVACY_VERSION, lang: l, sections: SECTIONS[l].map(([title, body]) => ({ title, body })), dpo };
}

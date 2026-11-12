# CircuLink design system

How CircuLink looks, sounds and behaves, for anyone changing the resident app or the web portal. Use these pieces instead of building new ones, and add to this page when something new is needed.

## Principles

1. **Plain words, two languages.** Short sentences anyone would say. Every app text has a Filipino translation in `app/lib/core/strings_fil.dart`; every portal text in `portal/src/i18n.jsx`.
2. **One main action per screen.** One `PrimaryButton`; everything else is a `SoftButton` or a text button.
3. **Prevent mistakes instead of reporting them.** Grey out what cannot be chosen, stop at limits (like 3 open drop-off codes), ask before anything that removes or locks someone out.
4. **Always say what happened.** Every action ends with a message, a changed screen, or (for big moments) a `celebrateDialog`.
5. **Never colour alone.** Every tone also has an icon or a word.
6. **Numbers come from the server.** Rule numbers (code length, limits, multipliers) are read from `/meta`, never typed into a screen.
7. **The logo is not decoration.** The CircuLink mark appears on the splash, login, onboarding, empty states and celebrations, not on every screen.
8. **Show the material, not the money.** Impact is shown in kilograms kept in use, with points second. CO₂ figures are always labeled as estimates.

## Tokens

One source: `brand/tokens.json` (also `brand/tokens.css` for the portal). The app mirrors it in `app/lib/core/theme.dart` (`HiColors`, `HiSpace`, `HiRadius`, `HiShadow`, `HiText`).

### Colour

| Token | Hex | Use | Never |
|---|---|---|---|
| `primary` (CircuLink green) | #0E7C66 | Main buttons, selected states, the impact card, the loop in the logo | |
| `onPrimary` | #FFFFFF | Text and icons on green (5.1:1) | |
| `primarySoft` / `mint` | #D7F2EA / #E6F6EF | Unread rows, highlights, icon circles | |
| `accent` | #0B6B58 | Links, small icons, focus rings | Large fills |
| `sun` / `sunSoft` | #F2B33D / #FDF0D5 | Points, badges, the chain link in the logo | Text |
| `cream` | #F7FAF8 | Screen background | |
| `card` | #FFFFFF | Cards, sheets, dialogs | |
| `ink` / `muted` | #12261F / #4A5F57 | Text / secondary text (both pass 4.5:1 on cream and white) | |
| `leaf` / `leafSoft` | #166534 / #DCFCE7 | Success | |
| `warn` / `warnSoft` | #7A5410 / #FDF1D6 | Waiting, special handling | |
| `danger` / `dangerSoft` | #B42318 / #FEE4E2 | Errors, rejected items, destructive buttons | |
| `info` / `infoSoft` | #1B4F9C / #E3EFFF | What happens next, staff messages | |
| `line` / `lineStrong` | #DCE5E0 / #C3D0C9 | Borders and dividers | |

### Type (Nunito, bundled)

| Style | Size / weight | Use |
|---|---|---|
| `HiText.display` | 32 / 800 | One big number per screen at most (kg kept in use) |
| `HiText.h1` | 24 / 800 | Screen headings inside the content |
| `HiText.h2` | 20 / 700 | Sheet titles, big card titles |
| `HiText.title` | 17 / 700 | Section titles, card titles |
| `HiText.body` | 15 / 400 | All sentences |
| `HiText.label` | 13 / 600 | Field labels, small headings |
| `HiText.caption` | 12 / 400 | Dates, helper text |

Heavy weights are for headings only. Set styles from `HiText`, not with inline `fontWeight`.

### Space, radius, shadow

- **Space:** 4, 8, 12, 16, 24, 32 (`HiSpace.xs` to `xl`); screens use a 20 px side gutter (`HiSpace.gutter`). Cards are 12 apart.
- **Radius:** 10 (small), 14 (buttons and fields), 20 (cards), 24 (dialogs and sheets), pill (chips and tabs).
- **Shadow:** `card` for resting white cards, `float` for bars, `modal` for dialogs. Tinted cards have no shadow.
- **Width:** content never grows wider than 600 px (`ContentFrame`), so it stays readable on a desktop browser.

## Components (app)

All live in `app/lib/widgets/ui/`, one per file; `import '../widgets/common.dart'` brings them all.

| Component | File | Use it for |
|---|---|---|
| `PrimaryButton` | `buttons.dart` | The one main action. `busy` while waiting; `danger` for destructive ones. 52 px tall. |
| `SoftButton` | `buttons.dart` | Every other action. 48 px tall. |
| `HiCard` | `hi_card.dart` | Any grouped content. White with shadow, or tinted (`color`) and flat. Tappable with `onTap`. |
| `StatusChip` + `Tone` | `status_chip.dart`, `tone.dart` | A status, tier or cost. Tones: ok, warn, bad, info, muted; each has an icon. |
| `InfoBanner` | `info_banner.dart` | A sentence about what happens next (info), something to watch (warn), done (ok) or a problem (bad). |
| `HiTextField` | `hi_field.dart` | Every text input. Label above, helper or error below; never a custom border. |
| `showHiSheet` | `hi_sheet.dart` | Short forms (reject, rate, report a problem): a bottom sheet with a title that rises with the keyboard. |
| `HiTabs` | `hi_tabs.dart` | Tabs at the top of a screen, as pills, with optional counts. |
| `HiListTile` | `rows.dart` | A row that opens something (Profile menu). `danger` for delete. |
| `KeyValueRow` | `rows.dart` | A label and its value; stacks on narrow screens and large text. |
| `SectionTitle` | `section_title.dart` | A heading inside a screen, with an optional action. |
| `AsyncView` | `states.dart` | Anything loaded from the server: loading, error with retry, pull to refresh. |
| `SkeletonList` | `skeleton.dart` | The loading state of a list: grey blocks in the shape of the cards, no animation. |
| `EmptyState` | `states.dart` | Nothing to show yet: the CircuLink mark, one sentence, optionally one action. |
| `ErrorView` | `states.dart` | Something failed: the reason in plain words, a retry button, the server card when offline. |
| `showMessage` | `feedback.dart` | The short message after an action ("Saved."). `bad: true` for errors. |
| `confirmDialog` | `feedback.dart` | The "are you sure?" step before removing, cancelling or locking out. |
| `celebrateDialog` | `feedback.dart` | Big moments, like the first drop-off received. |
| `BrandMark`, `BrandWordmark` | `../brand_mark.dart` | The CircuLink mark and the two-colour word "CircuLink". |

## Patterns

- **Loading:** `SkeletonList` for lists; a spinner only inside a button (`busy`).
- **Empty:** `EmptyState` with one sentence that says what to do next.
- **Errors:** the server's message in the person's language (error codes in `kErrorFil`); a retry; never a stack trace. Server errors carry a `request_id` people can quote.
- **Forms:** labels on every field, errors under the field they belong to, the main button at the end. Check on the phone what can be checked (length, required) and let the server decide the rest.
- **Destructive actions:** `confirmDialog` (app) or `ConfirmModal` (portal) with the consequence in one sentence; Cancel has the focus; the confirm button is red.
- **After every action:** `showMessage` for small ones, `celebrateDialog` for big ones.
- **Sentences with numbers:** write them with placeholders and fill them from the server: `context.tv('You can have up to {n} open drop-off codes.', {'n': app.rule('maxOpenDeclarations', 3)})`.
- **Notifications:** written in the reader's language from the notice's values (`core/notification_text.dart`).

## Accessibility (WCAG 2.2 AA)

- Tap targets at least 48 × 48 px (buttons 48 to 52 px, tabs 44 px inside a 52 px track).
- Every icon-only button has a `tooltip`; images that only decorate are excluded from screen readers.
- Text scales to 200% without cutting off; rows stack instead of squeezing.
- Text contrast at least 4.5:1 (ink and muted on cream and white; white on green).
- Selected tabs, chips and toggles announce their state (`Semantics(selected: ...)`).
- Portal: dialogs move keyboard focus inside, keep Tab inside, close on Escape and return focus.

## Portal

The portal uses the same tokens (`brand/tokens.css`) and the same words for statuses (`i18n.jsx` maps raw statuses to English and Filipino). Its components live in `portal/src/components.jsx`: `Modal`, `ConfirmModal`, `PasswordModal`, `Badge` (tones match the app's), `Tabs`, `Stat`, `PageHeader`, `Empty`, `ErrorBox`, `Mark` (the logo mark), toasts (`useToast`).

## Adding something new

1. Check the table above first: most needs are a variant of an existing component.
2. If it is new, give it its own file in `app/lib/widgets/ui/`, export it from `common.dart`, and add it to the table above.
3. Use tokens only (no new hex values or font sizes), give it a 48 px target if it can be tapped, and run `flutter test`.

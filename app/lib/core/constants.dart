// Numbers that shape how the app behaves, in one place (the server's live in server/src/config.js).

/// How long the app waits for an answer from the server before saying it timed out.
const Duration kRequestTimeout = Duration(seconds: 25);

/// How long each address is tried when the app looks for the server by itself.
const Duration kServerProbeTimeout = Duration(milliseconds: 2500);

/// The splash is shown at least this long, so it never just flickers.
const Duration kSplashMinimum = Duration(milliseconds: 1400);

/// Browse loads this many items at a time ("Load more" fetches the next page).
const int kBrowsePageSize = 30;

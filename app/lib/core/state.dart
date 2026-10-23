import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'constants.dart';
import 'format.dart';
import 'strings_fil.dart';
import 'theme.dart';

/// Everything the whole app needs to know: who is logged in, the language, and shared lists.
class AppState extends ChangeNotifier {
  final Api api = Api.instance;
  Map<String, dynamic>? user;
  String lang = 'fil';
  bool ready = false;
  bool seenOnboarding = false;

  /// Screens that show lists watch this number. bump() makes them reload.
  int version = 0;

  List<Map<String, dynamic>> categories = <Map<String, dynamic>>[];
  List<Map<String, dynamic>> pickupPoints = <Map<String, dynamic>>[];

  /// The barangay hall's phone (HALL_PHONE on the server), or empty when not set.
  String hallPhone = '';

  /// The Browse origin filter ('', 'barangay' or 'kapitbahay'), remembered on this phone.
  String browseOrigin = '';
  List<String> puroks = <String>[];
  Map<String, dynamic> rules = <String, dynamic>{};

  /// A rule number from the server (RULES in server/src/rules.js), or [fallback] before /meta has loaded.
  int rule(String key, int fallback) => intOf(rules[key], fallback);
  SharedPreferences? _prefs;

  bool get isApproved => user?['verification_status'] == 'approved';
  String get verification => str(user?['verification_status'], 'unverified');
  int get credits => intOf(user?['credits']);

  /// Simple mode (seniors and PWDs): larger text, four big buttons, no swiping, calm transitions.
  bool get simpleMode => boolOf(user?['simple_mode']);
  int get unread => intOf(user?['unread_notifications']);
  int get userId => intOf(user?['id']);
  String get firstName => str(user?['name']).split(' ').first;

  /// English text is the key. In Filipino mode we look it up, and fall back to English.
  String tr(String s) => lang == 'fil' ? (kFil[s] ?? s) : s;

  String errorText(Object e) {
    if (e is ApiException) {
      if (lang == 'fil') {
        final String? byCode = kErrorFil[e.code];
        if (byCode != null) return byCode;
        return kFil[e.message] ?? e.message;
      }
      return e.message;
    }
    return tr('Something went wrong. Please try again.');
  }

  /// 'checking', 'ok' or 'down'. The login screen and every error screen show it.
  String serverStatus = 'checking';

  /// Tries the saved address first, then the addresses this phone might reach the laptop on
  /// (USB cable, Wi-Fi, hotspot, emulator), and keeps the first one that answers.
  Future<void> findServer() async {
    serverStatus = 'checking';
    notifyListeners();
    final List<String> candidates = <String>[];
    void add(String? url) {
      if (url != null && url.isNotEmpty && !candidates.contains(url)) candidates.add(url);
    }

    add(api.baseUrl);
    serverCandidates().forEach(add);
    if (!kIsWeb) add('http://10.0.2.2:4000');
    final List<bool> ok = await Future.wait<bool>(candidates.map((String u) => api.ping(u, timeout: kServerProbeTimeout)));
    final int hit = ok.indexOf(true);
    if (hit >= 0) {
      if (candidates[hit] != api.baseUrl) await setBaseUrl(candidates[hit]);
      serverStatus = 'ok';
    } else {
      serverStatus = 'down';
    }
    notifyListeners();
  }

  /// Checks only the current address (used after typing one by hand).
  Future<void> checkServer() async {
    serverStatus = 'checking';
    notifyListeners();
    serverStatus = await api.ping(api.baseUrl, timeout: const Duration(seconds: 3)) ? 'ok' : 'down';
    notifyListeners();
  }

  Future<void> init() async {
    // The splash always shows for a moment, so it is seen even when the server answers at once.
    final Future<void> minSplash = Future<void>.delayed(kSplashMinimum);
    _prefs = await SharedPreferences.getInstance();
    // A build from run-phone.cmd starts on its address (the USB cable) once.
    // After that, an address saved with the plug icon (like Wi-Fi) is kept.
    if (kServerFromBuild.isNotEmpty && _prefs!.getString('server_from_build') != kServerFromBuild) {
      await _prefs!.setString('server_from_build', kServerFromBuild);
      await _prefs!.setString('server', kServerFromBuild);
    }
    api.baseUrl = _prefs!.getString('server') ?? api.baseUrl;
    lang = _prefs!.getString('lang') ?? 'fil';
    seenOnboarding = _prefs!.getBool('seen_onboarding') ?? false;
    browseOrigin = _prefs!.getString('browse_origin') ?? '';
    api.token = await _readToken();
    api.onUnauthorized = _expired;

    await findServer();

    if (api.token != null) {
      // Use the saved profile first so the app opens even without a connection.
      final String? cached = _prefs!.getString('user');
      if (cached != null) {
        try {
          user = mapOf(jsonDecode(cached));
        } catch (_) {
          user = null;
        }
      }
      // No server, no waiting: keep the saved profile and let the screens explain.
      if (serverStatus == 'ok') {
        try {
          await refreshMe();
          await loadMeta();
        } on ApiException catch (e) {
          if (e.status == 401 || e.status == 403) await _clear();
        }
      }
    }
    await minSplash;
    ready = true;
    notifyListeners();
  }

  Future<void> _startSession(dynamic res) async {
    final Map<String, dynamic> body = mapOf(res);
    final Map<String, dynamic> u = mapOf(body['user']);
    if (u['role'] != 'resident') {
      throw ApiException('This app is for residents. LGU staff use the web portal.', code: 'staff_in_app');
    }
    api.token = str(body['token']);
    user = u;
    await _saveToken(api.token!);
    await _prefs?.setString('user', jsonEncode(u));
    await loadMeta();
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    final dynamic res = await api.post('/auth/login', <String, dynamic>{'email': email.trim(), 'password': password});
    await _startSession(res);
  }

  Future<void> register({required String name, required String email, required String password, String? phone, String? purok, bool acceptPrivacy = false}) async {
    final dynamic res = await api.post('/auth/register', <String, dynamic>{
      'name': name.trim(),
      'email': email.trim(),
      'password': password,
      'phone': phone,
      'purok': purok,
      'language': lang,
      'accept_privacy': acceptPrivacy,
    });
    await _startSession(res);
  }

  /// Saves profile fields (PATCH /me) and keeps the answer as the current user.
  Future<void> updateProfile(Map<String, dynamic> fields) async {
    user = mapOf(await api.patch('/me', fields));
    await _prefs?.setString('user', jsonEncode(user));
    notifyListeners();
  }

  Future<void> refreshMe() async {
    final Map<String, dynamic> r = mapOf(await api.get('/me'));
    // The server sends a fresh token once a day while the app is used, so active people stay logged in.
    final String renewed = str(r.remove('token'));
    if (renewed.isNotEmpty) {
      api.token = renewed;
      await _saveToken(renewed);
    }
    user = r;
    await _prefs?.setString('user', jsonEncode(user));
    notifyListeners();
  }

  Future<void> loadMeta() async {
    final Map<String, dynamic> m = mapOf(await api.get('/meta'));
    categories = listOf(m['categories']);
    pickupPoints = listOf(m['pickup_points']);
    puroks = (m['puroks'] is List ? m['puroks'] as List<dynamic> : <dynamic>[]).map((dynamic p) => p.toString()).toList();
    rules = mapOf(m['rules']);
    hallPhone = str(m['hall_phone']);
  }

  /// Call after something changed on the server (a request, a listing, credits).
  Future<void> bump() async {
    version++;
    notifyListeners();
    try {
      await refreshMe();
    } catch (_) {
      // Offline for a moment: lists will show their own retry button.
    }
  }

  Future<void> setBrowseOrigin(String origin) async {
    browseOrigin = origin;
    notifyListeners();
    await _prefs?.setString('browse_origin', origin);
  }

  Future<void> setLang(String l) async {
    lang = l;
    await _prefs?.setString('lang', l);
    notifyListeners();
    if (user != null) {
      try {
        await api.patch('/me', <String, dynamic>{'language': l});
      } catch (_) {
        // The language still changes on this phone even if saving it fails.
      }
    }
  }

  Future<void> setBaseUrl(String url) async {
    String clean = url.trim();
    while (clean.endsWith('/')) {
      clean = clean.substring(0, clean.length - 1);
    }
    if (!clean.startsWith('http')) clean = 'http://$clean';
    api.baseUrl = clean;
    await _prefs?.setString('server', clean);
    notifyListeners();
  }

  Future<void> finishOnboarding() async {
    seenOnboarding = true;
    await _prefs?.setBool('seen_onboarding', true);
    notifyListeners();
  }

  /// Logging out ends the session on the server too, so the token cannot be used again.
  Future<void> logout() async {
    try {
      if (api.token != null) await api.post('/auth/logout');
    } catch (_) {
      // Offline: the token is still forgotten on this phone.
    }
    await _clear();
    notifyListeners();
  }

  /// Other sessions end; this phone gets a new token.
  Future<void> changePassword(String current, String next) async {
    final Map<String, dynamic> body = mapOf(await api.post('/me/password', <String, dynamic>{'current': current, 'new_password': next}));
    api.token = str(body['token']);
    await _saveToken(api.token!);
    user = <String, dynamic>{...?user, ...mapOf(body['user'])};
    await _prefs?.setString('user', jsonEncode(user));
    notifyListeners();
  }

  // The login token lives in the phone's encrypted storage (Android Keystore). Older versions kept it in
  // plain preferences: it is moved over once. If secure storage is unavailable, preferences are the fallback.
  static const FlutterSecureStorage _secure = FlutterSecureStorage();

  Future<String?> _readToken() async {
    try {
      final String? saved = await _secure.read(key: 'token').timeout(const Duration(seconds: 3));
      if (saved != null) return saved;
      final String? old = _prefs?.getString('token');
      if (old != null) {
        await _secure.write(key: 'token', value: old);
        await _prefs?.remove('token');
      }
      return old;
    } catch (_) {
      return _prefs?.getString('token');
    }
  }

  Future<void> _saveToken(String token) async {
    try {
      await _secure.write(key: 'token', value: token);
      await _prefs?.remove('token');
    } catch (_) {
      await _prefs?.setString('token', token);
    }
  }

  Future<void> _clear() async {
    api.token = null;
    user = null;
    try {
      await _secure.delete(key: 'token');
    } catch (_) {
      // Nothing saved there.
    }
    await _prefs?.remove('token');
    await _prefs?.remove('user');
  }

  void _expired() {
    _clear().then((_) {
      rootNavigatorKey.currentState?.popUntil((Route<dynamic> r) => r.isFirst);
      notifyListeners();
    });
  }
}

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
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
  SharedPreferences? _prefs;

  bool get isApproved => user?['verification_status'] == 'approved';
  String get verification => str(user?['verification_status'], 'unverified');
  int get credits => intOf(user?['credits']);
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

  Future<void> init() async {
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
    api.token = _prefs!.getString('token');
    api.onUnauthorized = _expired;

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
      try {
        await refreshMe();
        await loadMeta();
      } on ApiException catch (e) {
        if (e.status == 401 || e.status == 403) await _clear();
      }
    }
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
    await _prefs?.setString('token', api.token!);
    await _prefs?.setString('user', jsonEncode(u));
    await loadMeta();
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    final dynamic res = await api.post('/auth/login', <String, dynamic>{'email': email.trim(), 'password': password});
    await _startSession(res);
  }

  Future<void> register({required String name, required String email, required String password, String? phone, String? purok}) async {
    final dynamic res = await api.post('/auth/register', <String, dynamic>{
      'name': name.trim(),
      'email': email.trim(),
      'password': password,
      'phone': phone,
      'purok': purok,
      'language': lang,
    });
    await _startSession(res);
  }

  Future<void> refreshMe() async {
    final dynamic r = await api.get('/me');
    user = mapOf(r);
    await _prefs?.setString('user', jsonEncode(user));
    notifyListeners();
  }

  Future<void> loadMeta() async {
    final Map<String, dynamic> m = mapOf(await api.get('/meta'));
    categories = listOf(m['categories']);
    pickupPoints = listOf(m['pickup_points']);
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

  Future<void> logout() async {
    await _clear();
    notifyListeners();
  }

  Future<void> _clear() async {
    api.token = null;
    user = null;
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

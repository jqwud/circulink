import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb;
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';

/// Server address, connection status and the plug button are for testing only. Real (release) builds show
/// residents none of it: the address is built in. Test builds (debug, or --dart-define=HIRAMAN_SERVER_TOOLS=true) keep them.
const bool kShowServerTools = kDebugMode || bool.fromEnvironment('HIRAMAN_SERVER_TOOLS');

/// Server address given at build time. A new value replaces the saved address once (see AppState.init).
const String kServerFromBuild = String.fromEnvironment('HIRAMAN_SERVER');

/// Other addresses the app may try, given at build time as a comma-separated list
/// (tools/run-phone.ps1 fills it with this computer's own addresses).
const String kServerCandidates = String.fromEnvironment('HIRAMAN_SERVERS');

List<String> serverCandidates() => kServerCandidates.split(',').map((String s) => s.trim()).where((String s) => s.isNotEmpty).toList();

class ApiException implements Exception {
  final String message;
  final String code;
  final int status;
  ApiException(this.message, {this.code = 'error', this.status = 0});

  @override
  String toString() => message;
}

/// Talks to the Hiraman API (the same server the LGU portal uses).
class Api {
  Api._();
  static final Api instance = Api._();

  /// tools/run-phone.cmd builds with --dart-define=HIRAMAN_SERVER=http://localhost:4000
  /// and tunnels that port over USB, so a phone needs no Wi-Fi setup.
  /// Otherwise: the browser reaches the computer as localhost, and the Android emulator
  /// as 10.0.2.2. A phone on Wi-Fi uses the server address set on the login screen.
  String baseUrl = kServerFromBuild.isNotEmpty ? kServerFromBuild : (kIsWeb ? 'http://localhost:4000' : 'http://10.0.2.2:4000');
  String? token;
  void Function()? onUnauthorized;

  Uri _uri(String path, [Map<String, String>? query]) {
    final Uri base = Uri.parse('$baseUrl/api$path');
    return query == null || query.isEmpty ? base : base.replace(queryParameters: query);
  }

  Map<String, String> _headers({bool json = true}) {
    final Map<String, String> h = <String, String>{};
    if (token != null) h['Authorization'] = 'Bearer $token';
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  dynamic _handle(http.Response res) {
    dynamic body;
    try {
      body = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {
      body = null;
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return body;
    final String message = (body is Map && body['error'] is String) ? body['error'] as String : 'Request failed (${res.statusCode})';
    final String code = (body is Map && body['code'] is String) ? body['code'] as String : 'error';
    if (res.statusCode == 401 && token != null && onUnauthorized != null) {
      onUnauthorized!();
    }
    throw ApiException(message, code: code, status: res.statusCode);
  }

  Future<dynamic> _send(Future<http.Response> Function() call) async {
    try {
      final http.Response res = await call().timeout(const Duration(seconds: 25));
      return _handle(res);
    } on SocketException {
      throw ApiException('Cannot reach the Hiraman server. Check your Wi-Fi and the server address.', code: 'network');
    } on TimeoutException {
      throw ApiException('The server took too long to answer. Please try again.', code: 'timeout');
    } on http.ClientException {
      throw ApiException('Cannot reach the Hiraman server. Check your Wi-Fi and the server address.', code: 'network');
    }
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) =>
      _send(() => http.get(_uri(path, query), headers: _headers(json: false)));

  Future<dynamic> post(String path, [Map<String, dynamic>? body]) =>
      _send(() => http.post(_uri(path), headers: _headers(), body: jsonEncode(body ?? <String, dynamic>{})));

  Future<dynamic> patch(String path, Map<String, dynamic> body) =>
      _send(() => http.patch(_uri(path), headers: _headers(), body: jsonEncode(body)));

  Future<dynamic> delete(String path) => _send(() => http.delete(_uri(path), headers: _headers(json: false)));

  /// Uploads one photo as multipart form data. The content type is set from the file
  /// extension, because the server only accepts JPG, PNG or WEBP photos.
  /// Reads bytes instead of a file path so it also works on the web, where the path is a blob URL.
  Future<dynamic> upload(String path, XFile file) {
    return _send(() async {
      final http.MultipartRequest req = http.MultipartRequest('POST', _uri(path));
      req.headers.addAll(_headers(json: false));
      final String lower = '${file.mimeType ?? ''} ${file.name}'.toLowerCase();
      final MediaType type = lower.contains('png')
          ? MediaType('image', 'png')
          : (lower.contains('webp') ? MediaType('image', 'webp') : MediaType('image', 'jpeg'));
      req.files.add(http.MultipartFile.fromBytes('file', await file.readAsBytes(), filename: file.name, contentType: type));
      final http.StreamedResponse streamed = await req.send();
      return http.Response.fromStream(streamed);
    });
  }

  /// Full address for a photo path like /uploads/public/abc.jpg
  String absolute(String? url) {
    if (url == null || url.isEmpty) return '';
    return url.startsWith('http') ? url : '$baseUrl$url';
  }

  /// Quick check used by the "Test connection" button.
  Future<bool> ping(String url, {Duration timeout = const Duration(seconds: 6)}) async {
    try {
      final http.Response res = await http.get(Uri.parse('$url/api/health')).timeout(timeout);
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}

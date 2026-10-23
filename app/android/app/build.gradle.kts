import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing. The key is the team's and never goes in the repository (key.properties, *.jks and
// *.keystore are git-ignored). Make it once with docs/RELEASE.md, then write android/key.properties:
//   storeFile=C:/keys/hiraman-release.jks   storePassword=...   keyAlias=hiraman   keyPassword=...
// Without that file, release builds are signed with the debug key, so `flutter run --release` still works,
// but such a build must not be given to residents.
val keyProperties = Properties().apply {
    val file = rootProject.file("key.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val hasReleaseKey = keyProperties.getProperty("storeFile") != null

android {
    namespace = "com.hiraman.hiraman"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        // The app's permanent identity on phones and in stores. Decide it before the first public release
        // (docs/RELEASE.md); after that it can never change.
        applicationId = "com.hiraman.hiraman"
        // The version comes from pubspec.yaml ("version: 1.0.0+1" = name 1.0.0, build number 1).
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = file(keyProperties.getProperty("storeFile"))
                storePassword = keyProperties.getProperty("storePassword")
                keyAlias = keyProperties.getProperty("keyAlias")
                keyPassword = keyProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (hasReleaseKey) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}

# Android store release: checklist and draft Play Console answers

Draft for Clive to check before anything is submitted. Nothing here is published, and no store account is used.

## Done in the repo

- **Version:** `versionName` is package.json's version and `versionCode` is worked out from it (major x 10000 + minor x 100 + patch, so 1.0.0 is 10000 and 1.2.3 is 10203). Bump package.json and both go up together. Minor and patch stay at 99 or under (the build stops if not).
- **Release signing:** used only when a keystore kept outside the repo is given, otherwise the release build is unsigned as before. Give either:
  - environment variables `SITEWRITE_KEYSTORE_PATH`, `SITEWRITE_KEYSTORE_PASSWORD`, `SITEWRITE_KEY_ALIAS`, `SITEWRITE_KEY_PASSWORD`; or
  - `SITEWRITE_KEYSTORE_PROPERTIES`, the path to a properties file outside the repo with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
- **Kept out of git:** `*.jks`, `*.keystore`, `keystore.properties` and `app/google-services.json` (android/.gitignore). A test checks that none is tracked.
- **Server address:** every page reads the `sitewrite-api` meta tag (PR #310). Set it to the production address in every page before `npx cap sync`.
- **Builds:** `./gradlew assembleRelease` (APK) and `bundleRelease` (AAB, what Play wants). Checked 11 Nov with a throwaway key: the env and properties paths both give a signed APK that `apksigner verify` accepts.

## Still needed (Clive)

1. **Upload key.** Make one on a machine you control (`keytool -genkeypair -v -keystore sitewrite-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`), keep the file and passwords in your password manager with a backup, and never put them in the repo or chat. Use Play App Signing, so Google holds the app signing key and a lost upload key can be reset.
2. **Push notifications.** Make a Firebase project for `com.sitewrite.app` and put its `google-services.json` in `android/app/` on the build machine only. Without it, the app builds and push stays off.
3. **Play Console developer account** (one-off fee, needs ID verification).
4. **Store listing:** title, short and full description, 512 px icon, 1024 x 500 feature graphic, phone screenshots, a privacy policy address (/privacy.html on the production domain), category (Business or Productivity), and contact email.
5. **Content rating** questionnaire, target audience (adults; not for children), and the Data safety form (draft below).
6. **Testing track.** New personal developer accounts must run a closed test with at least 12 testers for 14 days before production. An organisation account does not. Choose which kind of account to open.

## Permissions the release APK asks for

From the built APK (11 Nov): `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS` (Android 13+, asked at run time), `WAKE_LOCK` and `c2dm RECEIVE` (push), plus the app's own receiver permission. There is no location permission. The camera plugin opens the system camera or photo picker when the user chooses to attach a photo, and declares no `CAMERA` permission. minSdk 24 (Android 7), targetSdk 36.

## Draft Data safety answers (check against privacy.html)

- **Data collected:**
  - Personal info: email address (account sign-in, notices), name (account and SWMS prepared by, sign-on records), phone and business details (company profile, SWMS).
  - App content: SWMS text, answers and uploaded files (documents and photos the user attaches).
  - Sign-on records: worker name, employer, signature and time, collected for the business that owns the SWMS.
  - Not collected: location, contacts, device identifiers for advertising, analytics or tracking.
- **Purpose:** app functionality and account management. Not advertising.
- **Shared with third parties:** the SWMS text is sent to OpenRouter for the AI features (names, emails and account details are not sent with it), payments go to Stripe, and sign-in email goes through the email provider. Play treats service providers acting for SiteWrite as not "shared", so these may be declared as processing only. Clive to confirm.
- **Shared (declared, Clive 11 Nov, D344):** the privacy policy keeps "We may share or sell these statistics to third parties such as insurers, industry bodies, training providers and researchers." Declare it in Data safety as data shared with third parties: App content (SWMS content, de-identified, with names, phone numbers, emails, ABNs and addresses taken out, and SWMS created before 3 October 2026 left out), purpose "Analytics" (industry statistics), not for advertising. Note in the form that users can opt out by email, as the policy says. Do not answer "not shared", even though the data is de-identified.
- **Security:** data is encrypted in transit (HTTPS only), and sessions are stored as one-way hashes.
- **Deletion:** users can ask for their data to be deleted (privacy.html: within 30 days). Play also wants a web link for account deletion requests. The privacy page's email route may do; a dedicated page is better.

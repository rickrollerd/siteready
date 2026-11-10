const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;
const buildGradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const gitignore = fs.readFileSync('android/.gitignore', 'utf8');

describe('android-release-config', () => {
  it('build.gradle reads package.json for version and computes versionCode', () => {
    assert(buildGradle.includes('new JsonSlurper().parseText(packageJsonFile.text)'));
    assert(buildGradle.includes('def appVersion = String.valueOf(packageJson.version)'));
    assert(buildGradle.includes('versionCode computedVersionCode'));
    assert(buildGradle.includes('versionName appVersion'));
    assert(buildGradle.includes('major * 10000 + minor * 100 + patch'));
  });

  it('build.gradle names the four SITEWRITE_ env vars and SITEWRITE_KEYSTORE_PROPERTIES', () => {
    assert(buildGradle.includes('SITEWRITE_KEYSTORE_PATH'));
    assert(buildGradle.includes('SITEWRITE_KEYSTORE_PASSWORD'));
    assert(buildGradle.includes('SITEWRITE_KEY_ALIAS'));
    assert(buildGradle.includes('SITEWRITE_KEY_PASSWORD'));
    assert(buildGradle.includes('SITEWRITE_KEYSTORE_PROPERTIES'));
  });

  it('build.gradle contains no storePassword or keyPassword literal value in quotes', () => {
    const lines = buildGradle.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) continue;
      assert(!/storePassword\s+"[^"]+"/.test(trimmed), `Found literal storePassword in: ${line}`);
      assert(!/keyPassword\s+"[^"]+"/.test(trimmed), `Found literal keyPassword in: ${line}`);
    }
  });

  it('android/.gitignore ignores *.jks, *.keystore, keystore.properties and google-services.json', () => {
    assert(gitignore.includes('*.jks'));
    assert(gitignore.includes('*.keystore'));
    assert(gitignore.includes('keystore.properties'));
    assert(gitignore.includes('google-services.json'));
  });

  it('git ls-files lists no .jks, .keystore, keystore.properties or google-services.json file', () => {
    const tracked = execSync('git ls-files').toString();
    const lines = tracked.split('\n');
    for (const line of lines) {
      assert(!line.endsWith('.jks'), `Tracked .jks file: ${line}`);
      assert(!line.endsWith('.keystore'), `Tracked .keystore file: ${line}`);
      assert(!line.includes('keystore.properties'), `Tracked keystore.properties file: ${line}`);
      assert(!line.includes('google-services.json'), `Tracked google-services.json file: ${line}`);
    }
  });

  it('expected versionCode from package.json is above 1', () => {
    const parts = version.split('.');
    assert.strictEqual(parts.length, 3, `Version must be three parts: ${version}`);
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    const patch = parseInt(parts[2], 10);
    const versionCode = major * 10000 + minor * 100 + patch;
    assert(Number.isInteger(versionCode));
    assert(versionCode > 1, `Expected versionCode > 1, got ${versionCode}`);
  });
});

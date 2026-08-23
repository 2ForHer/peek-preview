import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = join(root, "android");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const customFiles = [
  "app/build.gradle",
  "app/src/main/AndroidManifest.xml",
  "app/src/main/res/xml/file_paths.xml",
  "app/src/main/res/xml/data_extraction_rules.xml",
  "app/src/main/java/com/peekpreview/grok/MainActivity.java",
];

const requiredPlatformFiles = [
  "build.gradle",
  "settings.gradle",
  "variables.gradle",
  "gradlew",
  "gradlew.bat",
  "gradle/wrapper/gradle-wrapper.jar",
  "gradle/wrapper/gradle-wrapper.properties",
  "app/proguard-rules.pro",
  "app/src/main/res/values/strings.xml",
];

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.status}.`);
  }
}

function hasCompleteAndroidPlatform() {
  return requiredPlatformFiles.every((relativePath) =>
    existsSync(join(androidDir, relativePath)),
  );
}

function readCustomFiles() {
  const files = new Map();

  for (const relativePath of customFiles) {
    const absolutePath = join(androidDir, relativePath);
    if (!existsSync(absolutePath)) {
      throw new Error(`Required custom Android source is missing: android/${relativePath}`);
    }
    files.set(relativePath, readFileSync(absolutePath));
  }

  return files;
}

function restoreCustomFiles(files) {
  for (const [relativePath, contents] of files) {
    const absolutePath = join(androidDir, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
}

run(npmCommand, ["run", "mobile:build"]);

if (!hasCompleteAndroidPlatform()) {
  const preservedFiles = readCustomFiles();
  const backupRoot = mkdtempSync(join(tmpdir(), "peek-preview-android-backup-"));
  const backupAndroidDir = join(backupRoot, "android");

  if (existsSync(androidDir)) {
    cpSync(androidDir, backupAndroidDir, { recursive: true });
    rmSync(androidDir, { recursive: true, force: true });
  }

  try {
    run(npxCommand, ["--yes", "@capacitor/cli@8.4.0", "add", "android"]);
    restoreCustomFiles(preservedFiles);
  } catch (error) {
    rmSync(androidDir, { recursive: true, force: true });
    if (existsSync(backupAndroidDir)) {
      cpSync(backupAndroidDir, androidDir, { recursive: true });
    }
    rmSync(backupRoot, { recursive: true, force: true });
    throw error;
  }

  rmSync(backupRoot, { recursive: true, force: true });
}

run(npxCommand, ["--yes", "@capacitor/cli@8.4.0", "sync", "android"]);

console.log("Android project prepared successfully.");

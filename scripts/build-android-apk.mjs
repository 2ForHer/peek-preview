import { chmodSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = join(root, "android");
const prepareScript = join(root, "scripts", "prepare-android.mjs");

function run(command, args, cwd = root, shell = false) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with code ${result.status}.`);
  }
}

run(process.execPath, [prepareScript]);

const isRelease = process.env.PEEK_BUILD_VARIANT === "release";
const gradleTask = isRelease ? "assembleRelease" : "assembleDebug";

if (process.platform === "win32") {
  run("gradlew.bat", [gradleTask], androidDir, true);
} else {
  const gradleWrapper = join(androidDir, "gradlew");
  if (!existsSync(gradleWrapper)) {
    throw new Error("Android Gradle wrapper is missing.");
  }
  chmodSync(gradleWrapper, 0o755);
  run("./gradlew", [gradleTask], androidDir);
}

const apkPath = join(
  androidDir,
  "app",
  "build",
  "outputs",
  "apk",
  isRelease ? "release" : "debug",
  isRelease ? "app-release.apk" : "app-debug.apk",
);

if (!existsSync(apkPath)) {
  throw new Error(`APK was not created at ${apkPath}`);
}

console.log(`APK created: ${apkPath}`);

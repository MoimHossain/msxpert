const packageJson = require("./package.json");
const { valid } = require("semver");

if (!valid(packageJson.version) || !/^\d+\.\d+\.\d+-alpha\.\d+$/.test(packageJson.version)) {
  throw new Error("Unsigned test packages require an explicit <major>.<minor>.<patch>-alpha.<number> version.");
}

const build = structuredClone(packageJson.build);
build.extraMetadata = { updateMode: "unsigned-test" };
build.forceCodeSigning = false;
delete build.win.signtoolOptions;
build.win.signExecutable = false;
build.win.verifyUpdateCodeSignature = false;
build.publish.releaseType = "prerelease";
build.publish.channel = "alpha";
module.exports = build;

const packageJson = require("./package.json");

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} before creating a signed package.`);
  }
  return value;
}

const build = structuredClone(packageJson.build);
const publisher = required("ARTIFACT_SIGNING_PUBLISHER");
if (!publisher.startsWith("CN=")) {
  throw new Error("ARTIFACT_SIGNING_PUBLISHER must be the full approved certificate subject (CN=...).");
}
build.forceCodeSigning = true;
build.extraMetadata = { updatePublisher: publisher };
delete build.win.signtoolOptions;
build.win.azureSignOptions = {
  endpoint: required("ARTIFACT_SIGNING_ENDPOINT"),
  codeSigningAccountName: required("ARTIFACT_SIGNING_ACCOUNT"),
  certificateProfileName: required("ARTIFACT_SIGNING_PROFILE"),
  publisherName: publisher,
  fileDigest: "SHA256",
  timestampDigest: "SHA256",
  timestampRfc3161: "http://timestamp.acs.microsoft.com",
};

module.exports = build;

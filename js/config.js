/* App configuration. Everything here is PUBLIC (this file is served with the app), so never put tokens or keys here.
   The GitHub token is entered once per device in Settings → tap the version label 5 times → Admin panel. */
const APP_CONFIG = {
  version: '1.3.2',
  githubOwner: 'devang-openweboffice',   // account that owns the PRIVATE data repo
  githubRepo: 'loan-tracker-data',       // private repo: images/ (photos) and data/ (files + settings)
  githubBranch: 'main'
};

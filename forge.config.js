const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: path.resolve(__dirname, 'assets', 'icon.ico'),
    ignore: [
      /^\/\.git/,
      /^\/out/,
      /^\/\.vscode/,
      /^\/\.idea/,
      /^\/\.DS_Store/,
      /^\/Thumbs\.db/,
      /^\/package-lock\.json/,
      /^\/webpack\.config\.js/,
      /^\/build-preload\.js/,
      /^\/forge\.config\.js/,
      /^\/forge\.config\.simple\.js/
    ],
    prune: true,
    overwrite: true
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'aiserviceapp',
        iconUrl: 'file:///C:/AiServiceApp/assets/icon.ico',
        setupIcon: path.resolve(__dirname, 'assets', 'icon.ico'), // ikon a telepítőhöz
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: path.resolve(__dirname, 'assets', 'icon.png')
      }},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

// Config plugin local: remove "fetch" de UIBackgroundModes no Info.plist do iOS.
//
// Por que: o plugin do expo-task-manager (aplicado automaticamente no prebuild) adiciona "fetch" aos modos de
// segundo plano, mas o app NAO usa Background Fetch (nao ha expo-background-fetch nem registerTaskAsync; o
// expo-task-manager so serve a task de localizacao, que precisa apenas de "location"). A App Review pode
// reprovar modo de segundo plano declarado sem uso.
//
// Ordem: este plugin deve ficar por ULTIMO em "plugins" do app.json. Os mods de Info.plist rodam em ordem
// reversa de registro e o plugin automatico do task-manager e registrado depois dos de app.json, entao ele
// adiciona "fetch" antes deste filtro rodar. "location" (do expo-location) nao e tocado.
//
// Defensivo: se UIBackgroundModes nao existir ou "fetch" nao estiver la, nao faz nada.
const { withInfoPlist } = require('expo/config-plugins');

const BLOCKED_MODES = ['fetch'];

const withoutFetchBackgroundMode = (config) =>
  withInfoPlist(config, (cfg) => {
    const modes = cfg.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      cfg.modResults.UIBackgroundModes = modes.filter((mode) => !BLOCKED_MODES.includes(mode));
    }
    return cfg;
  });

module.exports = withoutFetchBackgroundMode;

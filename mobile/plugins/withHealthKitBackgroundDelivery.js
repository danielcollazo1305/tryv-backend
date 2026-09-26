const { withAppDelegate } = require('@expo/config-plugins');

/**
 * Plugin local pra suprir um gap real do @kingstinct/react-native-healthkit
 * (confirmado na 14.0.2 e ainda presente na 14.1.0, instalada nesta tarefa):
 * o pacote tem um `app.plugin.ts` (fonte) que injeta
 * `BackgroundDeliveryManager.shared.setupBackgroundObservers()` no
 * AppDelegate, mas o `app.plugin.js` COMPILADO -- o unico que o Expo de fato
 * carrega do node_modules -- nao inclui esse passo (so entitlements/Info.plist).
 * Sem essa chamada nativa, o app so registra o HKObserverQuery de segundo
 * plano enquanto o JS estiver rodando; depois de o app ser encerrado pelo
 * sistema, a chamada nunca seria refeita e a entrega em segundo plano para de
 * funcionar silenciosamente. Este plugin replica literalmente a logica do
 * `app.plugin.ts` da propria lib (mesmo regex, mesma checagem de idempotencia)
 * ate que uma versao publicada corrija o `app.plugin.js`.
 *
 * Precisa de um build novo no EAS pra valer -- e uma mudanca em
 * ios/AppDelegate.swift gerado pelo prebuild, entitlement/codigo nativo nao
 * aparece num binario ja instalado.
 */
const withHealthKitBackgroundDelivery = (config) => {
  return withAppDelegate(config, (configDelegate) => {
    const contents = configDelegate.modResults.contents;

    if (!contents.includes('import HealthKit')) {
      configDelegate.modResults.contents = configDelegate.modResults.contents.replace(
        /^(import .+\n)/m,
        '$1import HealthKit\n'
      );
    }

    const setupCall = '    BackgroundDeliveryManager.shared.setupBackgroundObservers()\n';

    if (!configDelegate.modResults.contents.includes('BackgroundDeliveryManager')) {
      const withSetup = configDelegate.modResults.contents.replace(
        /(func application\([^{]*didFinishLaunchingWithOptions[^{]*\{)\n/,
        `$1\n${setupCall}`
      );

      if (withSetup === configDelegate.modResults.contents) {
        console.warn(
          '[withHealthKitBackgroundDelivery] Nao encontrou didFinishLaunchingWithOptions no AppDelegate; ' +
            'BackgroundDeliveryManager.shared.setupBackgroundObservers() nao foi inserido. ' +
            'A entrega em segundo plano do HealthKit nao vai sobreviver ao encerramento do app.'
        );
      }

      configDelegate.modResults.contents = withSetup;
    }

    return configDelegate;
  });
};

module.exports = withHealthKitBackgroundDelivery;

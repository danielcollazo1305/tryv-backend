import { getSdkStatus, initialize, requestPermission, getGrantedPermissions, SdkAvailabilityStatus } from 'react-native-health-connect';
import type { Permission } from 'react-native-health-connect';

/**
 * ESQUELETO INICIAL — Etapa 2 do plano de suporte a Health Connect
 * (Android). So inicializacao + permissao dos 2 tipos mais simples (Steps,
 * ActiveCaloriesBurned), validando o fluxo num device real antes de
 * implementar leitura de dado (etapa 3+) ou ligar isto na fachada
 * services/health.ts. Ainda NAO conectado ao resto do app.
 */

/** So os 2 tipos de leitura mais simples por enquanto — mesma lista cresce nas proximas etapas (FC, sono, corrida/GPS). */
const HEALTH_CONNECT_READ_PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
];

/**
 * true se o Health Connect esta instalado e pronto pra uso. false (sem
 * lancar excecao) tanto se o app Health Connect nao esta instalado quanto
 * se precisa de atualizacao — quem chamar decide como orientar o usuario
 * nesses 2 casos (ver getSdkStatus, que distingue os 2).
 */
export async function isHealthConnectAvailable(): Promise<boolean> {
  const status = await getSdkStatus();
  return status === SdkAvailabilityStatus.SDK_AVAILABLE;
}

/** Inicializa o SDK do Health Connect — precisa rodar (e retornar true) antes de qualquer requestPermission/readRecords. */
export async function initializeHealthConnect(): Promise<boolean> {
  return initialize();
}

/** Pede autorizacao de leitura pros tipos basicos (Steps, ActiveCaloriesBurned). Devolve so as permissoes que o usuario de fato concedeu. */
export async function requestHealthConnectPermissions(): Promise<Permission[]> {
  const granted = await requestPermission(HEALTH_CONNECT_READ_PERMISSIONS);
  return granted as Permission[];
}

/** Checa quais das permissoes ja pedidas estao concedidas agora — sem abrir dialogo nenhum. */
export async function getGrantedHealthConnectPermissions(): Promise<Permission[]> {
  const granted = await getGrantedPermissions();
  return granted as Permission[];
}

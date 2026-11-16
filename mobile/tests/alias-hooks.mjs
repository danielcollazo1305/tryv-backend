// Hook de resolucao de modulos so para os TESTES (Node >= 22.18/24 executa .ts direto, apagando os tipos): resolve o alias "@/..." do tsconfig e imports
// sem extensao (como "./healthkitState") para o arquivo .ts/.tsx do projeto. Sem dependencias: so o Node. Carregado por tests/register-alias.mjs.
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MOBILE_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONS = ['.ts', '.tsx'];

function withExtension(basePath) {
  if (existsSync(basePath) && statSync(basePath).isFile()) return basePath;
  for (const ext of EXTENSIONS) if (existsSync(basePath + ext)) return basePath + ext;
  for (const ext of EXTENSIONS) if (existsSync(resolvePath(basePath, 'index' + ext))) return resolvePath(basePath, 'index' + ext);
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const found = withExtension(resolvePath(MOBILE_ROOT, specifier.slice(2)));
    if (found) return nextResolve(pathToFileURL(found).href, context);
  } else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    if (parentDir.startsWith(MOBILE_ROOT) && !/\.(m?js|c?js|json|ts|tsx)$/.test(specifier)) {
      const found = withExtension(resolvePath(parentDir, specifier));
      if (found) return nextResolve(pathToFileURL(found).href, context);
    }
  }
  return nextResolve(specifier, context);
}

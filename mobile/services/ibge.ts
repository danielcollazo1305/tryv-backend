/**
 * API publica de localidades do IBGE (servicodados.ibge.gov.br) -- gratuita,
 * sem chave. Usada pelo seletor de cidade (Estado -> Municipio) do cadastro
 * (register-body.tsx). Sem endpoint de busca textual no IBGE -- a lista de
 * municipios de um estado (no maximo ~650, em SP) e pequena o bastante pra
 * filtrar no cliente depois de baixada uma vez, ver CityPickerModal.tsx.
 */

const IBGE_BASE_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades';

export interface IbgeState {
  id: number;
  sigla: string;
  nome: string;
}

export interface IbgeCity {
  id: number;
  nome: string;
}

export async function listIbgeStates(): Promise<IbgeState[]> {
  const response = await fetch(`${IBGE_BASE_URL}/estados?orderBy=nome`);
  if (!response.ok) throw new Error('Nao foi possivel carregar a lista de estados.');
  return response.json();
}

export async function listIbgeCitiesByState(uf: string): Promise<IbgeCity[]> {
  const response = await fetch(`${IBGE_BASE_URL}/estados/${uf}/municipios`);
  if (!response.ok) throw new Error('Nao foi possivel carregar os municipios deste estado.');
  const cities: IbgeCity[] = await response.json();
  return [...cities].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

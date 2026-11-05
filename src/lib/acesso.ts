import type { Papel } from './types';

/**
 * Páginas acessíveis por perfil. Fonte única: o middleware usa para bloquear a rota e o menu
 * usa para esconder o link. Admin acessa tudo; gerente/comum só estas.
 */
const PAGINAS_RESTRITAS = ['/', '/senha', '/software', '/inventario'];

export function paginaPermitida(papel: Papel, pathname: string) {
  if (papel === 'admin') return true;
  return PAGINAS_RESTRITAS.includes(pathname) || pathname.startsWith('/inventario/');
}

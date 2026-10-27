/** 旧 SPA 回退/缓存可能携带博客首页，不能将它当作 Anki 的 SSR 树水合。 */
export function shouldHydrateRoot(
  root: HTMLElement,
  pathname: string,
  basename: string,
  deployTarget: string | undefined,
): boolean {
  if (root.childElementCount === 0) return false;
  const base = basename === '/' ? '' : basename;
  const ankiPath = `${base}/anki`;
  const isAnki = pathname === ankiPath || pathname.startsWith(`${ankiPath}/`);
  if (deployTarget === 'cloud' && isAnki) {
    return root.querySelector('.anki-surface') !== null;
  }
  return true;
}

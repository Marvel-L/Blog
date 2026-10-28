import type { AbilityData } from '@/abilities/ability-core.mjs';
const generatedAbilities = import.meta.glob<AbilityData>('../../../../generated/abilities.json', {
  eager: true,
  import: 'default',
});
/** 同一构建快照供 SSR 和客户端首帧消费，内容修改后重新生成。 */
export function getAbilityData(): AbilityData {
  return Object.values(generatedAbilities)[0] ?? { config: {}, documents: [] };
}

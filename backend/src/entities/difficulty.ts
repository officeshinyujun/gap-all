/** 시험 난이도. DB 엔티티와 분리해 출제 엔진(에이전트 스킬 번들 포함)이 TypeORM 없이 쓸 수 있게 한다. */
export enum Difficulty {
  LOW = 'LOW',
  MIDDLE = 'MIDDLE',
  HIGH = 'HIGH',
  INTERGRATE = 'INTERGRATE',
}

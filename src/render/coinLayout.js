// Hand-arranged groups: short, uneven stacks and separate loose coins.
// The toss coin rests in a neutral area on the left, away from both purses.
export const COIN_STACKS = [
  { metal: 'gold', n: 7, seed: 11, x: -8.4, z: 9.4 },
  { metal: 'gold', n: 3, seed: 14, x: 8.6, z: -9.5 },
  { metal: 'silver', n: 5, seed: 12, x: -6.5, z: 10.5 },
  { metal: 'silver', n: 6, seed: 15, x: 6.3, z: -10.4 },
  { metal: 'copper', n: 4, seed: 21, x: -10.4, z: 10.2 },
  { metal: 'copper', n: 4, seed: 22, x: 10.5, z: -11.2 },
];
export const LOOSE_COINS = [
  { metal: 'copper', x: -4.6, z: 11.6, yaw: .7 },
  { metal: 'gold', x: 6.2, z: -8.3, yaw: -.45 },
  { metal: 'silver', x: 10.9, z: -8.8, yaw: 1.2 },
];
export const PURSES = [
  { seed: 13, x: -12.4, z: 13.2, yaw: 0.5 },
  { seed: 16, x: 13.0, z: -14.8, yaw: 3.4 },
];
export const TOSS_SCALE = 1.8;
// 桌上实心的东西（x, z, 半径, 顶高，高度从桌面算）：币碰到被推开，骰盅、骰子的路线也要绕开
export const MUG = { x: 17.6, z: -3.9, r: 2, top: 5.4 };
export const CUPS = [{ x: 11.6, z: 7.4 }, { x: -11.6, z: -7.4 }];
export const CUP_R = 1.75; // 骰盅放在桌上占多大
export const CUP_TOP_Y = 4.2;
export const CANDLE = { x: -6.2, z: -7.9, r: 1.28, top: 2.6 };
export const PURSE = { r: 2.3, top: 2.4 };
export const NEUTRAL_COIN_SPOT = { x: -14.2, z: -1.8 };

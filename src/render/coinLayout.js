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
export const TOSS_SCALE = 1.8;
export const NEUTRAL_COIN_SPOT = { x: -14.2, z: -1.8 };

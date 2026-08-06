export enum Timeframe {
  M1 = "M1",
  M5 = "M5",
  M15 = "M15",
  M30 = "M30",

  H1 = "H1",
  H4 = "H4",

  D1 = "D1",
  W1 = "W1",
  MN1 = "MN1",
}

export const TimeframeMinutes: Record<Timeframe, number> = {
  [Timeframe.M1]: 1,
  [Timeframe.M5]: 5,
  [Timeframe.M15]: 15,
  [Timeframe.M30]: 30,

  [Timeframe.H1]: 60,
  [Timeframe.H4]: 240,

  [Timeframe.D1]: 1440,
  [Timeframe.W1]: 10080,
  [Timeframe.MN1]: 43200,
};
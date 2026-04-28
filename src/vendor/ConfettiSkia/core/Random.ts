export default class Random {
  static range(min: number, max: number): number {
    return Math.random() * (max - min) + min
  }
}

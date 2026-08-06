import { SwingType } from "./SwingType";

export interface SwingPoint {
  /**
   * Candle index trong chuỗi dữ liệu
   */
  index: number;

  /**
   * Unix timestamp (milliseconds)
   */
  timestamp: number;

  /**
   * Giá tại Swing
   */
  price: number;

  /**
   * Swing High / Swing Low
   */
  type: SwingType;

  /**
   * Độ mạnh của swing
   */
  strength: number;
}
import { marketMock } from "../mock/market.mock";

export async function getMarket() {
  // Tạm thời trả về mock
  // Sau này sẽ thay bằng API/WebSocket
  return Promise.resolve(marketMock);
}
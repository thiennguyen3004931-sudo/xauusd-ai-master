import { http } from "../core/api/http";

export async function healthCheck() {
  const response = await http.get("/health");
  return response.data;
}
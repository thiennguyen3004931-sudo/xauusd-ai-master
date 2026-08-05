import axios from "axios";
import { env } from "../config/env";

export const http = axios.create({
  baseURL: env.apiUrl,

  timeout: 10000,

  headers: {
    "Content-Type": "application/json",
  },
});
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 200,
  duration: "5m",
  thresholds: {
    http_req_duration: ["p(95)<400"],
    checks: ["rate>0.99"]
  }
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000/api/v1";
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN || "";

export default function () {
  const res = http.get(`${BASE_URL}/appointments/me`, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`
    }
  });

  check(res, {
    "status is 200": (r) => r.status === 200
  });

  sleep(1);
}

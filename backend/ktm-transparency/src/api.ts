const BASE_URL = process.env.EXPO_PUBLIC_API_URL! || "https://a6f6f929227d.ngrok-free.app";
if (!BASE_URL) {
  console.warn("EXPO_PUBLIC_API_URL is not set. Edit your Expo .env file.");
}

export async function getDistricts() {
  const r = await fetch(`${BASE_URL}/districts`);
  return r.json();
}

export async function getProjects(district: string, limit = 20, offset = 0) {
  const r = await fetch(`${BASE_URL}/projects?district=${encodeURIComponent(district)}&limit=${limit}&offset=${offset}`);
  return r.json();
}

export async function getReports(params: {
  district?: string;
  project_id?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  if (params.district) q.set("district", params.district);
  if (params.project_id) q.set("project_id", params.project_id);
  q.set("limit", String(params.limit ?? 20));
  q.set("offset", String(params.offset ?? 0));
  const r = await fetch(`${BASE_URL}/reports?${q.toString()}`);
  return r.json();
}

export async function postReport(body: any) {
  const r = await fetch(`${BASE_URL}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function getSummary(district: string) {
  const r = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/stats/summary?district=${encodeURIComponent(district)}`);
  return r.json();
}


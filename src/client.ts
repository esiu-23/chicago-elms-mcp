const BASE_URL = "https://api.chicityclerkelms.chicago.gov";

export async function get(
  path: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== null && v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

interface MeetingDetails {
  meetingId: string;
  location?: string;
  videoLinks: string[];
  files: { name: string; type: string; url: string }[];
  attendance: unknown[];
}

type JsonObj = Record<string, unknown>;

export async function fetchMeetingForAction(
  body: string,
  dateStr: string,
): Promise<MeetingDetails | null> {
  try {
    const results = (await get("/meeting-agenda", { search: body, top: 200 })) as {
      data?: JsonObj[];
    };
    for (const m of results.data ?? []) {
      const mDate = ((m.date as string) ?? "").slice(0, 10);
      const mBody = ((m.body as string) ?? "").toLowerCase();
      if (mDate === dateStr && mBody.includes(body.toLowerCase())) {
        const meetingId = m.meetingId as string;
        const full = (await get(`/meeting-agenda/${meetingId}`)) as JsonObj;
        return {
          meetingId,
          location: full.location as string | undefined,
          videoLinks: (full.videoLink as string[] | undefined) ?? [],
          files: ((full.files as JsonObj[]) ?? []).map((f) => ({
            name: f.fileName as string,
            type: f.attachmentType as string,
            url: f.path as string,
          })),
          attendance: (full.attendance as unknown[]) ?? [],
        };
      }
    }
  } catch {
    // best-effort
  }
  return null;
}

export async function enrichMatter(matter: JsonObj): Promise<JsonObj> {
  const actions = (matter.actions as JsonObj[]) ?? [];

  const keys = [
    ...new Set(
      actions
        .map((a) => {
          const body = (a.actionByName as string) ?? "";
          const date = ((a.actionDate as string) ?? "").slice(0, 10);
          return body && date ? `${body}|${date}` : null;
        })
        .filter(Boolean) as string[],
    ),
  ];

  const meetings = await Promise.all(
    keys.map((key) => {
      const [body, date] = key.split("|");
      return fetchMeetingForAction(body, date);
    }),
  );
  const meetingMap = new Map(keys.map((k, i) => [k, meetings[i]]));

  for (const a of actions) {
    const body = (a.actionByName as string) ?? "";
    const date = ((a.actionDate as string) ?? "").slice(0, 10);
    const meeting = meetingMap.get(`${body}|${date}`);
    if (meeting) a.meetingDetails = meeting;
  }

  matter.actions = actions;
  return matter;
}

const BASE_URL = "https://api.chicityclerkelms.chicago.gov";
export async function get(path, params) {
    const url = new URL(path, BASE_URL);
    for (const [k, v] of Object.entries(params ?? {})) {
        if (v !== null && v !== undefined)
            url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) });
    if (!res.ok)
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
}
export async function fetchMeetingForAction(body, dateStr) {
    try {
        const results = (await get("/meeting-agenda", { search: body, top: 200 }));
        for (const m of results.data ?? []) {
            const mDate = (m.date ?? "").slice(0, 10);
            const mBody = (m.body ?? "").toLowerCase();
            if (mDate === dateStr && mBody.includes(body.toLowerCase())) {
                const meetingId = m.meetingId;
                const full = (await get(`/meeting-agenda/${meetingId}`));
                return {
                    meetingId,
                    location: full.location,
                    videoLinks: full.videoLink ?? [],
                    files: (full.files ?? []).map((f) => ({
                        name: f.fileName,
                        type: f.attachmentType,
                        url: f.path,
                    })),
                    attendance: full.attendance ?? [],
                };
            }
        }
    }
    catch {
        // best-effort
    }
    return null;
}
export async function enrichMatter(matter) {
    const actions = matter.actions ?? [];
    const keys = [
        ...new Set(actions
            .map((a) => {
            const body = a.actionByName ?? "";
            const date = (a.actionDate ?? "").slice(0, 10);
            return body && date ? `${body}|${date}` : null;
        })
            .filter(Boolean)),
    ];
    const meetings = await Promise.all(keys.map((key) => {
        const [body, date] = key.split("|");
        return fetchMeetingForAction(body, date);
    }));
    const meetingMap = new Map(keys.map((k, i) => [k, meetings[i]]));
    for (const a of actions) {
        const body = a.actionByName ?? "";
        const date = (a.actionDate ?? "").slice(0, 10);
        const meeting = meetingMap.get(`${body}|${date}`);
        if (meeting)
            a.meetingDetails = meeting;
    }
    matter.actions = actions;
    return matter;
}

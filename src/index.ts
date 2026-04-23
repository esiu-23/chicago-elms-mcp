#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { get, enrichMatter } from "./client.js";

const server = new McpServer({ name: "chicago-elms", version: "0.1.0" });

// ── Matters ───────────────────────────────────────────────────────────────────

server.tool(
  "search_legislation",
  "Full-text search across all Chicago legislation (matters/ordinances).",
  {
    search: z.string().describe('Text to search for (e.g. "TIF district", "affordable housing").'),
    filter: z
      .string()
      .optional()
      .describe(
        "OData filter expression. Valid fields: status, type, introductionDate, finalActionDate, fileYear, filingSponsor, controllingBody, keyLegislation, filingOffice.",
      ),
    sort: z
      .string()
      .optional()
      .describe(
        "Sort order. Options: title, filingOffice, keyLegislation, introductionDate, finalActionDate, fileYear, status, recordNumber, type, controllingBody, filingSponsor, recordCreateDate — append ' asc' or ' desc'.",
      ),
    include_attachments: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include attachment text in search results."),
    top: z.number().int().optional().default(25).describe("Results per page (max 1000)."),
    skip: z.number().int().optional().default(0).describe("Results to skip for pagination."),
  },
  async ({ search, filter, sort, include_attachments, top, skip }) => {
    const result = await get("/search", {
      search,
      filter,
      sort,
      includeAttachments: String(include_attachments),
      top,
      skip,
    });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

server.tool(
  "list_matters",
  "List Chicago legislative matters (ordinances, resolutions, etc.) with filtering.",
  {
    filter: z
      .string()
      .optional()
      .describe(
        "OData filter expression. Valid fields: status, type, introductionDate, finalActionDate, fileYear, filingSponsor, filingSponsorId, controllingBody, controllingBodyId, keyLegislation, filingOffice, recordCreateDate.",
      ),
    search: z.string().optional().describe("Optional full-text search query."),
    sort: z
      .string()
      .optional()
      .describe(
        "Sort order. Options: fileYear, recordCreateDate, finalActionDate, introductionDate, status — append ' asc' or ' desc'.",
      ),
    top: z.number().int().optional().default(25).describe("Results per page (max 1000)."),
    skip: z.number().int().optional().default(0).describe("Results to skip for pagination."),
  },
  async ({ filter, search, sort, top, skip }) => {
    const result = await get("/matter", { filter, search, sort, top, skip });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

server.tool(
  "get_matter",
  "Get full details for a legislative matter by its internal ID, including all actions enriched with meeting details.",
  {
    matter_id: z.string().describe("Internal matter ID (UUID or integer from list_matters)."),
  },
  async ({ matter_id }) => {
    const matter = (await get(`/matter/${matter_id}`)) as Record<string, unknown>;
    const result = await enrichMatter(matter);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

server.tool(
  "get_matter_by_record_number",
  "Get a legislative matter by its public record number (e.g. 'O2024-1234'), enriched with meeting details.",
  {
    record_number: z
      .string()
      .describe("Public record number string, e.g. 'O2024-1234'. Prefix codes: O=Ordinance, R=Resolution, A=Appointment."),
  },
  async ({ record_number }) => {
    const matter = (await get(`/matter/recordNumber/${record_number}`)) as Record<string, unknown>;
    const result = await enrichMatter(matter);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

// ── Meetings ──────────────────────────────────────────────────────────────────

server.tool(
  "list_meetings",
  "List Chicago City Council and committee meetings.",
  {
    filter: z
      .string()
      .optional()
      .describe(
        "OData filter expression. Valid fields: date, body, bodyId, status. Example: \"date ge '2024-01-01' and body eq 'City Council'\".",
      ),
    search: z.string().optional().describe("Optional full-text search."),
    sort: z
      .string()
      .optional()
      .describe("Sort order. Options: date, body, status — append ' asc' or ' desc'."),
    top: z.number().int().optional().default(25).describe("Results per page (max 1000)."),
    skip: z.number().int().optional().default(0).describe("Results to skip for pagination."),
  },
  async ({ filter, search, sort, top, skip }) => {
    const result = await get("/meeting", { filter, search, sort, top, skip });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

server.tool(
  "list_meeting_agendas",
  "List meeting agendas with summary info for each meeting.",
  {
    search: z
      .string()
      .optional()
      .describe('Search by committee/body name (e.g. "Finance Committee", "City Council").'),
    sort: z
      .string()
      .optional()
      .describe("Sort order. Options: date, body, status — append ' asc' or ' desc'."),
    top: z.number().int().optional().default(25).describe("Results per page (max 1000)."),
    skip: z.number().int().optional().default(0).describe("Results to skip for pagination."),
  },
  async ({ search, sort, top, skip }) => {
    const result = await get("/meeting-agenda", { search, sort, top, skip });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

server.tool(
  "get_meeting_agenda",
  "Get the full agenda for a specific meeting, including all line items, vote flags, video links, and PDF files.",
  {
    meeting_id: z.string().describe("Meeting ID from list_meeting_agendas results."),
  },
  async ({ meeting_id }) => {
    const result = await get(`/meeting-agenda/${meeting_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

server.tool(
  "get_votes",
  "Get the per-alderperson vote breakdown for a specific agenda item.",
  {
    meeting_id: z.string().describe("Meeting ID (from get_meeting_agenda)."),
    line_id: z
      .string()
      .describe(
        "Agenda line item ID — use the matterId or commentId from an agendaItem where hasVotes is true.",
      ),
  },
  async ({ meeting_id, line_id }) => {
    const result = await get(`/meeting-agenda/${meeting_id}/matter/${line_id}/votes`);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

// ── Bodies (committees) ───────────────────────────────────────────────────────

server.tool(
  "list_bodies",
  "List Chicago legislative bodies (City Council, committees, subcommittees).",
  {
    filter: z
      .string()
      .optional()
      .describe("OData filter expression. Valid field: body (name)."),
    search: z.string().optional().describe("Full-text search on body names."),
    sort: z
      .string()
      .optional()
      .describe("Sort order. Options: body, 'body asc', 'body desc'."),
    top: z.number().int().optional().default(50).describe("Results per page (max 1000)."),
    skip: z.number().int().optional().default(0).describe("Results to skip for pagination."),
  },
  async ({ filter, search, sort, top, skip }) => {
    const result = await get("/body", { filter, search, sort, top, skip });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

server.tool(
  "get_body",
  "Get details for a legislative body including its current and past members.",
  {
    body_id: z.string().describe("Body ID from list_bodies results."),
  },
  async ({ body_id }) => {
    const result = await get(`/body/${body_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

// ── Persons (alderpersons) ────────────────────────────────────────────────────

server.tool(
  "list_persons",
  "List Chicago alderpersons and other council members.",
  {
    filter: z
      .string()
      .optional()
      .describe(
        "OData filter expression. Valid fields: displayName, isActive. Example: \"isActive eq true\".",
      ),
    search: z.string().optional().describe("Full-text search on names."),
    sort: z
      .string()
      .optional()
      .describe("Sort order. Options: displayName, 'displayName asc', 'displayName desc'."),
    top: z.number().int().optional().default(50).describe("Results per page (max 1000)."),
    skip: z.number().int().optional().default(0).describe("Results to skip for pagination."),
  },
  async ({ filter, search, sort, top, skip }) => {
    const result = await get("/person", { filter, search, sort, top, skip });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

server.tool(
  "get_person",
  "Get full profile for an alderperson: ward, contact info, active status, and photo URL.",
  {
    person_id: z
      .string()
      .describe("Person ID from list_persons or sponsor/vote records."),
  },
  async ({ person_id }) => {
    const result = await get(`/person/${person_id}`);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

// ── Resources ─────────────────────────────────────────────────────────────────

server.resource(
  "matter",
  new ResourceTemplate("elms://matter/{matter_id}", { list: undefined }),
  async (uri, { matter_id }) => {
    const matter = (await get(`/matter/${matter_id}`)) as Record<string, unknown>;
    const enriched = await enrichMatter(matter);
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(enriched, null, 2) }],
    };
  },
);

server.resource(
  "meeting-agenda",
  new ResourceTemplate("elms://meeting-agenda/{meeting_id}", { list: undefined }),
  async (uri, { meeting_id }) => {
    const agenda = await get(`/meeting-agenda/${meeting_id}`);
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(agenda, null, 2) }],
    };
  },
);

server.resource(
  "person",
  new ResourceTemplate("elms://person/{person_id}", { list: undefined }),
  async (uri, { person_id }) => {
    const person = await get(`/person/${person_id}`);
    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(person, null, 2) }],
    };
  },
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

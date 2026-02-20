import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  ScanCommand,
  BatchWriteCommand,
  UpdateCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const client = new DynamoDBClient({ region: "us-east-1" });
const ddb = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({ region: "us-east-1" });

const USER_POOL_ID = "us-east-1_AatsAsuay";

const TABLES = {
  users: "mindset-users",
  assessments: "mindset-assessments",
  auditLog: "mindset-audit-log",
  notes: "mindset-notes",
  vbus: "mindset-vbus",
};

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

const ok = (body) => ({ statusCode: 200, headers, body: JSON.stringify(body) });
const err = (code, msg) => ({ statusCode: code, headers, body: JSON.stringify({ error: msg }) });

function getAssessor(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims || {};
  return {
    id: claims.email || claims["cognito:username"] || "unknown",
    name: claims.name || claims.email || "Unknown",
  };
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.rawPath || event.path || "";
  const qs = event.queryStringParameters || {};

  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // ===== PARTICIPANTS =====

    // GET /participants
    if (method === "GET" && path === "/participants") {
      const result = await ddb.send(new ScanCommand({ TableName: TABLES.users }));
      const participants = (result.Items || []).map((p) => ({
        ...p,
        vbu: p.vbu || p.vpiName || "",
      }));
      return ok({ participants });
    }

    // POST /participants — add single participant
    if (method === "POST" && path === "/participants") {
      const body = JSON.parse(event.body);
      const { email, name, vbu, track, aiMaturityLevel } = body;
      if (!email || !name) return err(400, "email and name required");
      const item = {
        userId: email.toLowerCase(),
        name,
        email: email.toLowerCase(),
        vbu: vbu || "",
        track: track || "product",
        createdAt: new Date().toISOString(),
      };
      if (aiMaturityLevel !== undefined && aiMaturityLevel !== null && aiMaturityLevel !== "") {
        item.aiMaturityLevel = Number(aiMaturityLevel);
      }
      await ddb.send(new PutCommand({ TableName: TABLES.users, Item: item }));
      return ok({ success: true });
    }

    // DELETE /participants/{email}
    if (method === "DELETE" && path.startsWith("/participants/")) {
      const email = decodeURIComponent(path.split("/participants/")[1]);
      if (!email) return err(400, "email required");
      await ddb.send(
        new DeleteCommand({ TableName: TABLES.users, Key: { userId: email.toLowerCase() } })
      );
      return ok({ success: true });
    }

    // POST /participants/ai-level — update AI maturity level
    if (method === "POST" && path === "/participants/ai-level") {
      const assessor = getAssessor(event);
      const body = JSON.parse(event.body);
      const { participantId, aiLevel } = body;
      if (!participantId || aiLevel === undefined || aiLevel === null) {
        return err(400, "participantId and aiLevel required");
      }
      const level = Number(aiLevel);
      if (![0, 1, 2, 3].includes(level)) {
        return err(400, "aiLevel must be 0, 1, 2, or 3");
      }

      // Read current value
      let previousLevel = null;
      try {
        const existing = await ddb.send(
          new GetCommand({ TableName: TABLES.users, Key: { userId: participantId } })
        );
        if (existing.Item) {
          previousLevel = existing.Item.aiMaturityLevel !== undefined ? existing.Item.aiMaturityLevel : null;
        }
      } catch (_) {}

      // Update participant record
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.users,
          Key: { userId: participantId },
          UpdateExpression: "SET aiMaturityLevel = :lvl",
          ExpressionAttributeValues: { ":lvl": level },
        })
      );

      // Write audit log
      await ddb.send(
        new PutCommand({
          TableName: TABLES.auditLog,
          Item: {
            participantId,
            timestamp: new Date().toISOString(),
            action: "ai-level-update",
            assessorId: assessor.id,
            assessorName: assessor.name,
            day: "AI",
            previousLevel: previousLevel !== null ? String(previousLevel) : null,
            newLevel: String(level),
          },
        })
      );

      return ok({ success: true });
    }

    // POST /participants/import — bulk import
    if (method === "POST" && path === "/participants/import") {
      const body = JSON.parse(event.body);
      const { participants } = body;
      if (!Array.isArray(participants) || participants.length === 0) {
        return err(400, "participants array required");
      }

      // BatchWrite in chunks of 25
      const chunks = [];
      for (let i = 0; i < participants.length; i += 25) {
        chunks.push(participants.slice(i, i + 25));
      }

      let imported = 0;
      for (const chunk of chunks) {
        const requests = chunk.map((p) => {
          const item = {
            userId: p.email.toLowerCase(),
            name: p.name,
            email: p.email.toLowerCase(),
            vbu: p.vbu || "",
            track: p.track || "product",
            createdAt: new Date().toISOString(),
          };
          if (p.aiMaturityLevel !== undefined && p.aiMaturityLevel !== null && p.aiMaturityLevel !== "") {
            item.aiMaturityLevel = Number(p.aiMaturityLevel);
          }
          return { PutRequest: { Item: item } };
        });
        await ddb.send(
          new BatchWriteCommand({ RequestItems: { [TABLES.users]: requests } })
        );
        imported += chunk.length;
      }
      return ok({ success: true, imported });
    }

    // ===== ASSESSMENTS =====

    // GET /assessments?participantId=X&day=D1
    if (method === "GET" && path === "/assessments") {
      const { participantId, day } = qs;
      if (!participantId) return err(400, "participantId required");

      const params = {
        TableName: TABLES.assessments,
        KeyConditionExpression: day
          ? "participantId = :pid AND begins_with(#sk, :day)"
          : "participantId = :pid",
        ExpressionAttributeValues: { ":pid": participantId },
      };
      if (day) {
        params.ExpressionAttributeNames = { "#sk": "dayAssessor" };
        params.ExpressionAttributeValues[":day"] = day + "#";
      }

      const result = await ddb.send(new QueryCommand(params));
      return ok({ assessments: result.Items || [] });
    }

    // POST /assessments — save assessment + audit log
    if (method === "POST" && path === "/assessments") {
      const assessor = getAssessor(event);
      const body = JSON.parse(event.body);
      const { participantId, day, level } = body;
      if (!participantId || !day || !level) {
        return err(400, "participantId, day, and level required");
      }

      const validLevels = ["toxic", "talker", "action", "driver"];
      if (!validLevels.includes(level.toLowerCase())) {
        return err(400, "level must be one of: toxic, talker, action, driver");
      }

      const sk = `${day}#${assessor.id}`;
      const now = new Date().toISOString();

      // Check for existing assessment to log previous value
      let previousLevel = null;
      try {
        const existing = await ddb.send(
          new QueryCommand({
            TableName: TABLES.assessments,
            KeyConditionExpression: "participantId = :pid AND dayAssessor = :sk",
            ExpressionAttributeValues: { ":pid": participantId, ":sk": sk },
          })
        );
        if (existing.Items && existing.Items.length > 0) {
          previousLevel = existing.Items[0].level;
        }
      } catch (_) {
        // ignore — first assessment
      }

      // Save assessment
      await ddb.send(
        new PutCommand({
          TableName: TABLES.assessments,
          Item: {
            participantId,
            dayAssessor: sk,
            day,
            assessorId: assessor.id,
            assessorName: assessor.name,
            level: level.toLowerCase(),
            timestamp: now,
          },
        })
      );

      // Write audit log
      await ddb.send(
        new PutCommand({
          TableName: TABLES.auditLog,
          Item: {
            participantId,
            timestamp: now,
            action: previousLevel ? "update" : "create",
            assessorId: assessor.id,
            assessorName: assessor.name,
            day,
            previousLevel,
            newLevel: level.toLowerCase(),
          },
        })
      );

      return ok({ success: true });
    }

    // DELETE /assessments — remove an assessment
    if (method === "DELETE" && path === "/assessments") {
      const assessor = getAssessor(event);
      const { participantId, day } = qs;
      if (!participantId || !day) {
        return err(400, "participantId and day required");
      }

      const sk = `${day}#${assessor.id}`;

      // Get existing assessment for audit log
      let previousLevel = null;
      try {
        const existing = await ddb.send(
          new QueryCommand({
            TableName: TABLES.assessments,
            KeyConditionExpression: "participantId = :pid AND dayAssessor = :sk",
            ExpressionAttributeValues: { ":pid": participantId, ":sk": sk },
          })
        );
        if (existing.Items && existing.Items.length > 0) {
          previousLevel = existing.Items[0].level;
        }
      } catch (_) {}

      if (!previousLevel) {
        return ok({ success: true, message: "No assessment found to delete" });
      }

      await ddb.send(
        new DeleteCommand({
          TableName: TABLES.assessments,
          Key: { participantId, dayAssessor: sk },
        })
      );

      // Write audit log
      await ddb.send(
        new PutCommand({
          TableName: TABLES.auditLog,
          Item: {
            participantId,
            timestamp: new Date().toISOString(),
            action: "delete",
            assessorId: assessor.id,
            assessorName: assessor.name,
            day,
            previousLevel,
            newLevel: null,
          },
        })
      );

      return ok({ success: true });
    }

    // ===== CONSENSUS =====

    // GET /consensus?day=D1
    if (method === "GET" && path === "/consensus") {
      const { day } = qs;
      if (!day) return err(400, "day required");

      // Get all participants
      const usersResult = await ddb.send(new ScanCommand({ TableName: TABLES.users }));
      const participants = usersResult.Items || [];

      // Get all assessments for the day
      const assessResult = await ddb.send(
        new ScanCommand({
          TableName: TABLES.assessments,
          FilterExpression: "#d = :day",
          ExpressionAttributeNames: { "#d": "day" },
          ExpressionAttributeValues: { ":day": day },
        })
      );
      const assessments = assessResult.Items || [];

      const levelValues = { toxic: 1, talker: 2, action: 3, driver: 4 };
      const valueLabels = { 1: "toxic", 2: "talker", 3: "action", 4: "driver" };

      // Group assessments by participant
      const assessByParticipant = {};
      for (const a of assessments) {
        if (!assessByParticipant[a.participantId]) {
          assessByParticipant[a.participantId] = [];
        }
        assessByParticipant[a.participantId].push(a);
      }

      // Also get previous day assessments for movement arrows
      const prevDay = day === "D1" ? null : `D${parseInt(day.slice(1)) - 1}`;
      let prevAssessments = [];
      if (prevDay) {
        const prevResult = await ddb.send(
          new ScanCommand({
            TableName: TABLES.assessments,
            FilterExpression: "#d = :day",
            ExpressionAttributeNames: { "#d": "day" },
            ExpressionAttributeValues: { ":day": prevDay },
          })
        );
        prevAssessments = prevResult.Items || [];
      }

      const prevByParticipant = {};
      for (const a of prevAssessments) {
        if (!prevByParticipant[a.participantId]) {
          prevByParticipant[a.participantId] = [];
        }
        prevByParticipant[a.participantId].push(a);
      }

      function calcConsensus(assessArr) {
        if (!assessArr || assessArr.length === 0) return null;
        const sum = assessArr.reduce((s, a) => s + (levelValues[a.level] || 0), 0);
        const mean = sum / assessArr.length;
        const rounded = Math.round(mean * 100) / 100;
        let label;
        if (rounded < 1.5) label = "toxic";
        else if (rounded < 2.5) label = "talker";
        else if (rounded < 3.5) label = "action";
        else label = "driver";
        return { mean: rounded, label, count: assessArr.length };
      }

      const consensus = participants.map((p) => {
        const current = calcConsensus(assessByParticipant[p.userId]);
        const prev = calcConsensus(prevByParticipant[p.userId]);
        let movement = "none";
        if (current && prev) {
          if (current.mean > prev.mean) movement = "up";
          else if (current.mean < prev.mean) movement = "down";
          else movement = "same";
        }
        return {
          ...p,
          vbu: p.vbu || p.vpiName || "",
          consensus: current,
          movement,
          assessments: assessByParticipant[p.userId] || [],
        };
      });

      return ok({ consensus, day });
    }

    // ===== AUDIT LOG =====

    // GET /audit-log?participantId=X
    if (method === "GET" && path === "/audit-log") {
      const { participantId } = qs;

      if (participantId) {
        const result = await ddb.send(
          new QueryCommand({
            TableName: TABLES.auditLog,
            KeyConditionExpression: "participantId = :pid",
            ExpressionAttributeValues: { ":pid": participantId },
            ScanIndexForward: false,
          })
        );
        return ok({ entries: result.Items || [] });
      }

      // All entries (scan)
      const result = await ddb.send(new ScanCommand({ TableName: TABLES.auditLog }));
      const sorted = (result.Items || []).sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
      return ok({ entries: sorted });
    }

    // ===== NOTES =====

    // GET /notes/{participantId}
    if (method === "GET" && path.startsWith("/notes/")) {
      const participantId = decodeURIComponent(path.split("/notes/")[1]);
      if (!participantId) return err(400, "participantId required");
      const result = await ddb.send(
        new QueryCommand({
          TableName: TABLES.notes,
          KeyConditionExpression: "participantId = :pid",
          ExpressionAttributeValues: { ":pid": participantId },
          ScanIndexForward: false,
        })
      );
      return ok({ notes: result.Items || [] });
    }

    // POST /notes
    if (method === "POST" && path === "/notes") {
      const assessor = getAssessor(event);
      const body = JSON.parse(event.body);
      const { participantId, note } = body;
      if (!participantId || !note) return err(400, "participantId and note required");

      await ddb.send(
        new PutCommand({
          TableName: TABLES.notes,
          Item: {
            participantId,
            timestamp: new Date().toISOString(),
            authorId: assessor.id,
            authorName: assessor.name,
            note,
          },
        })
      );
      return ok({ success: true });
    }

    // ===== VBUs =====

    // GET /vbus
    if (method === "GET" && path === "/vbus") {
      const result = await ddb.send(new ScanCommand({ TableName: TABLES.vbus }));
      const vbus = (result.Items || []).sort((a, b) => a.name.localeCompare(b.name));
      return ok({ vbus });
    }

    // POST /vbus — add VBU
    if (method === "POST" && path === "/vbus") {
      const body = JSON.parse(event.body);
      const { name } = body;
      if (!name) return err(400, "name required");
      const vbuId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await ddb.send(
        new PutCommand({
          TableName: TABLES.vbus,
          Item: { vbuId, name, createdAt: new Date().toISOString() },
        })
      );
      return ok({ success: true, vbuId, name });
    }

    // PUT /vbus/{vbuId} — rename VBU and update all participants
    if (method === "PUT" && path.startsWith("/vbus/")) {
      const vbuId = decodeURIComponent(path.split("/vbus/")[1]);
      if (!vbuId) return err(400, "vbuId required");
      const body = JSON.parse(event.body);
      const { name: newName, oldName } = body;
      if (!newName) return err(400, "name required");
      // Update VBU record
      const newVbuId = newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (newVbuId !== vbuId) {
        await ddb.send(new DeleteCommand({ TableName: TABLES.vbus, Key: { vbuId } }));
      }
      await ddb.send(
        new PutCommand({
          TableName: TABLES.vbus,
          Item: { vbuId: newVbuId, name: newName, createdAt: new Date().toISOString() },
        })
      );
      // Update all participants with the old VBU name
      if (oldName) {
        const scan = await ddb.send(new ScanCommand({ TableName: TABLES.users }));
        const toUpdate = (scan.Items || []).filter(p => p.vbu === oldName || p.vpiName === oldName);
        for (const p of toUpdate) {
          await ddb.send(
            new UpdateCommand({
              TableName: TABLES.users,
              Key: { userId: p.userId },
              UpdateExpression: "SET vbu = :v REMOVE vpiName",
              ExpressionAttributeValues: { ":v": newName },
            })
          );
        }
      }
      return ok({ success: true, vbuId: newVbuId, name: newName });
    }

    // DELETE /vbus/{vbuId}
    if (method === "DELETE" && path.startsWith("/vbus/")) {
      const vbuId = decodeURIComponent(path.split("/vbus/")[1]);
      if (!vbuId) return err(400, "vbuId required");
      await ddb.send(
        new DeleteCommand({ TableName: TABLES.vbus, Key: { vbuId } })
      );
      return ok({ success: true });
    }

    return err(404, "Not found");
  } catch (e) {
    console.error("Error:", e);
    return err(500, e.message);
  }
};

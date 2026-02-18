import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const ddb = DynamoDBDocumentClient.from(client);
const TABLE = "csi-bingo-journal";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.rawPath || event.path || "";

  // CORS preflight
  if (method === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // GET /journal?userId=xxx - get all journal entries for a user
    if (method === "GET" && path.startsWith("/journal")) {
      const userId = event.queryStringParameters?.userId;
      if (!userId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "userId required" }) };
      }

      const result = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId }
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ entries: result.Items || [] })
      };
    }

    // POST /journal - save a journal entry
    if (method === "POST" && path.startsWith("/journal")) {
      const body = JSON.parse(event.body);
      const { userId, ahaText, note, track, timestamp, day } = body;

      if (!userId || !ahaText) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "userId and ahaText required" }) };
      }

      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: { userId, ahaText, note: note || "", track: track || "general", day: day || 1, timestamp: timestamp || new Date().toISOString() }
      }));

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // DELETE /journal?userId=xxx&ahaText=yyy - delete a journal entry
    if (method === "DELETE" && path.startsWith("/journal")) {
      const userId = event.queryStringParameters?.userId;
      const ahaText = event.queryStringParameters?.ahaText;

      if (!userId || !ahaText) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "userId and ahaText required" }) };
      }

      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { userId, ahaText }
      }));

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: "Not found" }) };
  } catch (err) {
    console.error("Error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

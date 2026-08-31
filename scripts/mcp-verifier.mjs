function rpc(id, method, params) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

export async function sendVerificationRequests(write, waitForResponse) {
  write(
    rpc(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "verify-mcp", version: "0" },
    }),
  );

  await waitForResponse(1);

  write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }));
  write(rpc(2, "tools/list", {}));
}

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using GatewayService.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<CytoplasmReader>();
builder.Services.AddCors(options => {
	options.AddDefaultPolicy(policy => {
		policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
	});
});

var app = builder.Build();

app.UseCors();
app.UseWebSockets();

var connectedClients = new ConcurrentDictionary<string, WebSocket>();
var cytoplasmReader = app.Services.GetRequiredService<CytoplasmReader>();

// Julia / R Autopoietic Loop Notification Endpoint
app.MapPost("/api/v1/topoloty/event", async (HttpContext ctx) => {
	using var reader = new StreamReader(ctx.Request.Body);
	var jsonBody = await reader.ReadToEndAsync();

	// Read Top Trigger Posts from Shared Memory (Zero-Copy)
	var triggerPosts = cytoplasmReader.ReadTopTriggerPosts();

	var broadcastPayload = JsonSerializer.Serialize(new {
		type = "AUTOPOIETIC_EVENT",
		payload = JsonSerializer.Deserialize<JsonElement>(string.IsNullOrWhiteSpace(jsonBody) ? "{}" : jsonBody),
		triggerPosts = triggerPosts
	});

	var buffer = Encoding.UTF8.GetBytes(broadcastPayload);
	var deadClients = new List<string>();

	foreach (var (id, client) in connectedClients) {
		if (client.State == WebSocketState.Open) {
			await client.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, CancellationToken.None);
		} else {
			deadClients.Add(id);
		}
	}

	foreach (var id in deadClients) {
		connectedClients.TryRemove(id, out _);
	}

	return Results.Ok(new { status = "ACK", extractedTriggerCount = triggerPosts.Count });
});

// WebSocket Endpoint for React WebUI
app.Map("/ws", async (HttpContext context) => {
	if (context.WebSockets.IsWebSocketRequest) {
		using var webSocket = await context.WebSockets.AcceptWebSocketAsync();
		var clientId = Guid.NewGuid().ToString();
		connectedClients.TryAdd(clientId, webSocket);

		var buffer = new byte[4096];
		while (webSocket.State == WebSocketState.Open) {
			var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
			if (result.MessageType == WebSocketMessageType.Close) {
				await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
				connectedClients.TryRemove(clientId, out _);
			}
		}
	} else {
		context.Response.StatusCode = StatusCodes.Status400BadRequest;
	}
});

Console.WriteLine("=== REVELATIO // Gateway Service (.NET) Runnin on http://localhost:5000 ===");
app.Run("http://localhost:5000");



			





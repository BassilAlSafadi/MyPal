using System.Security.Cryptography;
using System.Text;
using Npgsql;

namespace MyPal.Orders.Middleware;

/// <summary>
/// Enforces deterministic replay for requests bearing the Idempotency-Key header.
/// Port of Backend/Go/internal/gateway/middleware.Idempotency.
///
/// The gateway applied this to every authenticated route, but api_idempotency is an
/// orders-owned table and order placement is the operation that actually needs
/// replay protection, so it now runs here. The fingerprint, the FOR UPDATE claim,
/// the 409 on concurrent/mismatched reuse and the detached response save are unchanged.
/// </summary>
public sealed class IdempotencyMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string _connectionString;
    private readonly ILogger<IdempotencyMiddleware> _log;

    public IdempotencyMiddleware(RequestDelegate next, string connectionString, ILogger<IdempotencyMiddleware> log)
    {
        _next = next;
        _connectionString = connectionString;
        _log = log;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var idempotencyKey = context.Request.Headers["Idempotency-Key"].FirstOrDefault();
        if (string.IsNullOrEmpty(idempotencyKey))
        {
            // No key, skip idempotency
            await _next(context);
            return;
        }

        var traceId = context.Request.Headers["X-Trace-ID"].FirstOrDefault() ?? context.TraceIdentifier;

        // 1. Request fingerprinting (method + path + body hash if available)
        context.Request.EnableBuffering();
        string bodyHash;
        using (var ms = new MemoryStream())
        {
            await context.Request.Body.CopyToAsync(ms);
            bodyHash = Convert.ToHexString(SHA256.HashData(ms.ToArray())).ToLowerInvariant();
            context.Request.Body.Position = 0; // restore
        }
        var fingerprint = $"{context.Request.Method}:{context.Request.Path}:{bodyHash}";

        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(context.RequestAborted);

        // 2. Check and Lock Idempotency Record
        await using (var tx = await conn.BeginTransactionAsync(context.RequestAborted))
        {
            string? status = null;
            int? statusCode = null;
            byte[]? responsePayload = null;
            string? storedFingerprint = null;

            await using (var select = new NpgsqlCommand("""
                SELECT status, status_code, response_payload, fingerprint
                FROM api_idempotency
                WHERE idempotency_key = $1
                FOR UPDATE
                """, conn, tx))
            {
                select.Parameters.AddWithValue(idempotencyKey);
                await using var reader = await select.ExecuteReaderAsync(context.RequestAborted);
                if (await reader.ReadAsync(context.RequestAborted))
                {
                    status = reader.GetString(0);
                    statusCode = reader.IsDBNull(1) ? null : reader.GetInt32(1);
                    responsePayload = reader.IsDBNull(2) ? null : (byte[])reader.GetValue(2);
                    storedFingerprint = reader.IsDBNull(3) ? null : reader.GetString(3);
                }
            }

            if (status is not null)
            {
                // Record exists — release the lock early.
                await tx.RollbackAsync(context.RequestAborted);

                if (status == "IN_PROGRESS")
                {
                    // Concurrent identical request
                    _log.LogWarning("idempotency: concurrent request rejected key={Key} trace_id={TraceId}", idempotencyKey, traceId);
                    await WriteJson(context, StatusCodes.Status409Conflict, """{"error":"concurrent_request_in_progress"}""");
                    return;
                }

                if (status == "COMPLETED")
                {
                    if (storedFingerprint != fingerprint)
                    {
                        _log.LogWarning("idempotency: fingerprint mismatch key={Key} trace_id={TraceId}", idempotencyKey, traceId);
                        await WriteJson(context, StatusCodes.Status409Conflict, """{"error":"idempotency_key_reuse_with_different_request"}""");
                        return;
                    }

                    // Replay previous response
                    _log.LogInformation("idempotency: replaying response key={Key} trace_id={TraceId}", idempotencyKey, traceId);
                    context.Response.Headers["Idempotent-Replay"] = "true";
                    context.Response.ContentType = "application/json";
                    context.Response.StatusCode = statusCode ?? StatusCodes.Status200OK;
                    if (responsePayload is not null) await context.Response.Body.WriteAsync(responsePayload);
                    return;
                }
            }

            // 3. Create IN_PROGRESS record
            var now = DateTime.UtcNow;
            try
            {
                await using var insert = new NpgsqlCommand("""
                    INSERT INTO api_idempotency (idempotency_key, fingerprint, correlation_id, status, created_at, updated_at, expires_at)
                    VALUES ($1, $2, $3, 'IN_PROGRESS', $4, $4, $5)
                    """, conn, tx);
                insert.Parameters.AddWithValue(idempotencyKey);
                insert.Parameters.AddWithValue(fingerprint);
                insert.Parameters.AddWithValue(traceId);
                insert.Parameters.AddWithValue(now);
                insert.Parameters.AddWithValue(now.AddHours(24));
                await insert.ExecuteNonQueryAsync(context.RequestAborted);
            }
            catch (PostgresException)
            {
                // likely unique constraint violation from a race
                await tx.RollbackAsync(context.RequestAborted);
                _log.LogWarning("idempotency: concurrent insertion race key={Key} trace_id={TraceId}", idempotencyKey, traceId);
                await WriteJson(context, StatusCodes.Status409Conflict, """{"error":"concurrent_request_in_progress"}""");
                return;
            }

            await tx.CommitAsync(context.RequestAborted);
        }

        // 4. Intercept Downstream Handler
        var originalBody = context.Response.Body;
        using var buffer = new MemoryStream();
        context.Response.Body = buffer;

        try
        {
            await _next(context);
        }
        finally
        {
            buffer.Position = 0;
            await buffer.CopyToAsync(originalBody);
            context.Response.Body = originalBody;
        }

        // 5. Save Response Payload — on a detached token, since the response is already
        // on the wire and failing to record it would silently break replay.
        try
        {
            using var saveCts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await using var update = new NpgsqlCommand("""
                UPDATE api_idempotency
                SET status = 'COMPLETED',
                    status_code = $2,
                    response_payload = $3,
                    updated_at = now()
                WHERE idempotency_key = $1
                """, conn);
            update.Parameters.AddWithValue(idempotencyKey);
            update.Parameters.AddWithValue(context.Response.StatusCode);
            update.Parameters.AddWithValue(buffer.ToArray());
            await update.ExecuteNonQueryAsync(saveCts.Token);
        }
        catch (Exception ex)
        {
            // We cannot return a 500 to the client since we already wrote the response,
            // but we must log it so we know idempotency was broken.
            _log.LogError(ex, "idempotency: failed to save response payload key={Key}", idempotencyKey);
        }
    }

    private static Task WriteJson(HttpContext context, int statusCode, string json)
    {
        context.Response.ContentType = "application/json";
        context.Response.StatusCode = statusCode;
        return context.Response.WriteAsync(json);
    }
}

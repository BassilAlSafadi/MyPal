using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace MyPal.ServiceDefaults;

/// <summary>
/// Guards the /internal/* routes services call on each other.
///
/// Port of the gateway's middleware.InternalAuth. These routes carry no end-user
/// token — they are one service reading data another service owns — so they are
/// exempt from JWT validation and authenticated by the shared
/// INTERNAL_SERVICE_TOKEN instead.
/// </summary>
public sealed class InternalAuthMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string _token;

    public InternalAuthMiddleware(RequestDelegate next, IConfiguration config)
    {
        _next = next;
        _token = config["INTERNAL_SERVICE_TOKEN"] ?? "";
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments("/internal"))
        {
            await _next(context);
            return;
        }

        // An unset token means local development with no shared secret; the gateway
        // behaved the same way, only enforcing when one was configured.
        if (!string.IsNullOrEmpty(_token))
        {
            var provided = context.Request.Headers["X-Internal-Token"].FirstOrDefault();
            if (!FixedTimeEquals(provided, _token))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new { error = "Forbidden: internal endpoints require X-Internal-Token" });
                return;
            }
        }

        await _next(context);
    }

    private static bool FixedTimeEquals(string? a, string? b)
    {
        if (a is null || b is null) return false;
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(a), Encoding.UTF8.GetBytes(b));
    }
}

public static class InternalAuthExtensions
{
    /// <summary>
    /// Installs the internal-token gate. Call before UseJwtValidation, and treat
    /// /internal as anonymous in the JWT predicate so the two do not both fire.
    /// </summary>
    public static void UseInternalAuth(this WebApplication app) =>
        app.UseMiddleware<InternalAuthMiddleware>();
}

using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.IdentityModel.Tokens;

namespace MyPal.ServiceDefaults;

/// <summary>
/// Validates the Bearer access token and republishes the identity onto the request
/// as the X-User-* headers. Port of the Go gateway's JWTValidation middleware
/// (internal/gateway/middleware.JWTValidation + internal/gateway/auth.Validator).
///
/// Rules preserved from the gateway:
///  - HS256 only; any other alg is rejected (algorithm-switching defence).
///  - `exp` is required.
///  - `sub` is required; a token without it is rejected as missing claims.
///  - Issuer/audience are only checked when configured.
///  - An absent `roles` claim defaults to ["buyer"].
///
/// Inbound X-User-* headers are stripped first — exactly like the gateway's
/// stripIdentityHeaders — so a client cannot forge an identity.
/// </summary>
/// <remarks>
/// Configuration arrives as a single options object rather than loose
/// constructor arguments: UseMiddleware resolves constructor parameters by the
/// runtime type of each extra argument, and JWT_ISSUER / JWT_AUDIENCE are
/// routinely unset — a null argument has no type to match against, so the
/// middleware would fail to activate at startup.
/// </remarks>
public sealed class JwtValidationOptions
{
    public required string Secret { get; init; }
    public string? Issuer { get; init; }
    public string? Audience { get; init; }
    public required Func<PathString, bool> IsAnonymous { get; init; }
}

public sealed class JwtValidationMiddleware
{
    private readonly RequestDelegate _next;
    private readonly TokenValidationParameters _parameters;
    private readonly Func<PathString, bool> _isAnonymous;

    public JwtValidationMiddleware(RequestDelegate next, JwtValidationOptions options)
    {
        _next = next;
        _isAnonymous = options.IsAnonymous;
        _parameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.Secret)),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            ValidateLifetime = true,
            RequireExpirationTime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
            ValidateIssuer = !string.IsNullOrWhiteSpace(options.Issuer),
            ValidIssuer = options.Issuer,
            ValidateAudience = !string.IsNullOrWhiteSpace(options.Audience),
            ValidAudience = options.Audience,
        };
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Never trust identity headers that arrived from outside.
        context.Request.Headers.Remove(JwtIdentityHeaders.UserId);
        context.Request.Headers.Remove(JwtIdentityHeaders.UserEmail);
        context.Request.Headers.Remove(JwtIdentityHeaders.UserRoles);
        context.Request.Headers.Remove(JwtIdentityHeaders.IsBuyer);
        context.Request.Headers.Remove(JwtIdentityHeaders.IsSeller);

        if (_isAnonymous(context.Request.Path))
        {
            await _next(context);
            return;
        }

        var header = context.Request.Headers.Authorization.FirstOrDefault();
        if (string.IsNullOrEmpty(header) || !header.StartsWith("Bearer ", StringComparison.Ordinal))
        {
            await WriteUnauthorized(context, "missing or malformed Authorization header");
            return;
        }

        var raw = header["Bearer ".Length..].Trim();

        ClaimsPrincipal principal;
        try
        {
            principal = new JwtSecurityTokenHandler().ValidateToken(raw, _parameters, out var securityToken);
            if (securityToken is not JwtSecurityToken jwt ||
                !jwt.Header.Alg.Equals(SecurityAlgorithms.HmacSha256, StringComparison.OrdinalIgnoreCase))
            {
                await WriteUnauthorized(context, "token is invalid");
                return;
            }
        }
        catch (SecurityTokenExpiredException)
        {
            await WriteUnauthorized(context, "token has expired");
            return;
        }
        catch (Exception)
        {
            await WriteUnauthorized(context, "token is invalid");
            return;
        }

        var identity = ToIdentity(principal);
        if (identity is null)
        {
            await WriteUnauthorized(context, "required claims are missing");
            return;
        }

        context.Request.Headers[JwtIdentityHeaders.UserId] = identity.UserId.ToString();
        context.Request.Headers[JwtIdentityHeaders.UserEmail] = identity.Email;
        context.Request.Headers[JwtIdentityHeaders.UserRoles] = string.Join(",", identity.Roles);
        context.Request.Headers[JwtIdentityHeaders.IsBuyer] = identity.IsBuyer ? "true" : "false";
        context.Request.Headers[JwtIdentityHeaders.IsSeller] = identity.IsSeller ? "true" : "false";
        context.Items[nameof(JwtIdentity)] = identity;

        await _next(context);
    }

    private static JwtIdentity? ToIdentity(ClaimsPrincipal principal)
    {
        var subject = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(subject, out var userId)) return null;

        var email = principal.FindFirstValue(JwtRegisteredClaimNames.Email)
            ?? principal.FindFirstValue(ClaimTypes.Email)
            ?? "";

        return new JwtIdentity(
            userId,
            email,
            ParseRoles(principal.FindFirstValue("roles")),
            ParseBool(principal.FindFirstValue("is_buyer")),
            ParseBool(principal.FindFirstValue("is_seller")));
    }

    // Mirrors auth.parseRoles: comma separated, empty falls back to the buyer default.
    private static string[] ParseRoles(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return ["buyer"];
        var parts = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts.Length == 0 ? ["buyer"] : parts;
    }

    private static bool ParseBool(string? raw) =>
        bool.TryParse(raw, out var parsed) && parsed;

    private static Task WriteUnauthorized(HttpContext context, string message)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return context.Response.WriteAsJsonAsync(new { error = message });
    }
}

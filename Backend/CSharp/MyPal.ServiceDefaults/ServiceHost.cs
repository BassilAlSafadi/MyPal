using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace MyPal.ServiceDefaults;

/// <summary>
/// The cross-cutting host setup every MyPal C# service shares.
///
/// These concerns used to live in one place — CORS and JWT validation in the Go
/// gateway, Kestrel/Swagger/forwarded-headers in the single MyPal.API. Each of the
/// four services now owns them, so the behaviour is collected here rather than
/// copy-pasted four times.
/// </summary>
public static class ServiceHost
{
    /// <summary>
    /// Resolution order (first non-empty wins) — unchanged from the monolith, except
    /// that each service reads its own service-scoped variable first so the three
    /// databases can be addressed independently:
    ///   1. {PREFIX}_POSTGRES_URL     – this service's database
    ///   2. POSTGRES_SESSION_URL      – Supabase session-mode / PgBouncer
    ///   3. POSTGRES_URL              – standard connection URL env var
    ///   4. ConnectionStrings:DefaultConnection
    /// </summary>
    public static string ResolveConnectionString(IConfiguration config, string prefix, string fallbackDatabase) =>
        config[$"{prefix}_POSTGRES_URL"]
        ?? config["POSTGRES_SESSION_URL"]
        ?? config["POSTGRES_URL"]
        ?? config.GetConnectionString("DefaultConnection")
        ?? $"Host=localhost;Port=5432;Database={fallbackDatabase};Username=postgres;Password=postgres";

    public static WebApplicationBuilder CreateBuilder(string[] args, string serviceName, int defaultPort)
    {
        // The Supabase schema stores created_at/updated_at as `timestamp without time zone`,
        // while the domain code assigns DateTime.UtcNow (Kind=Utc). Npgsql 6+ rejects writing a
        // UTC DateTime to a non-tz column. Legacy timestamp behavior maps both the way EF expects
        // without retyping every timestamp column across all entities. Must run before any Npgsql use.
        AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

        EnvLoader.LoadDotEnv(Directory.GetCurrentDirectory());

        var builder = WebApplication.CreateBuilder(args);
        builder.Configuration.AddEnvironmentVariables();

        var port = int.Parse(Environment.GetEnvironmentVariable("PORT") ?? defaultPort.ToString());
        builder.WebHost.ConfigureKestrel(kestrel =>
        {
            kestrel.ListenAnyIP(port, o =>
                o.Protocols = Microsoft.AspNetCore.Server.Kestrel.Core.HttpProtocols.Http1);
        });

        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor
                | ForwardedHeaders.XForwardedHost
                | ForwardedHeaders.XForwardedProto;
            options.KnownNetworks.Clear();
            options.KnownProxies.Clear();
        });

        builder.Services.AddServiceCache(serviceName);
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen(c =>
        {
            c.SwaggerDoc("v1", new() { Title = $"MyPal {serviceName} service", Version = "v1" });
            c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Name = "Authorization",
                Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
                Scheme = "bearer",
                BearerFormat = "JWT",
                In = Microsoft.OpenApi.Models.ParameterLocation.Header,
            });
            c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
            {
                {
                    new Microsoft.OpenApi.Models.OpenApiSecurityScheme
                    {
                        Reference = new Microsoft.OpenApi.Models.OpenApiReference
                        {
                            Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                            Id = "Bearer"
                        }
                    },
                    Array.Empty<string>()
                }
            });
        });

        return builder;
    }

    /// <summary>
    /// Browser access policy. Port of the gateway's middleware.CORS, including the
    /// single-'*' wildcard form used for preview deployments (https://*.vercel.app).
    /// Every service is now called directly by the SPA, so each needs its own policy.
    /// </summary>
    public static void UseServiceCors(this WebApplication app, IConfiguration config)
    {
        var allowed = (config["CORS_ALLOWED_ORIGINS"] ?? "http://localhost:5173,http://127.0.0.1:5173")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var exact = new HashSet<string>(allowed.Where(o => !o.Contains('*')), StringComparer.Ordinal);
        var wildcards = allowed.Where(o => o.Contains('*')).ToArray();

        bool OriginAllowed(string origin)
        {
            if (string.IsNullOrEmpty(origin)) return false;
            if (exact.Contains(origin)) return true;
            foreach (var pattern in wildcards)
            {
                var idx = pattern.IndexOf('*');
                var prefix = pattern[..idx];
                var suffix = pattern[(idx + 1)..];
                if (origin.StartsWith(prefix, StringComparison.Ordinal) &&
                    origin.EndsWith(suffix, StringComparison.Ordinal)) return true;
            }
            return false;
        }

        app.Use(async (context, next) =>
        {
            var origin = context.Request.Headers.Origin.FirstOrDefault() ?? "";
            if (OriginAllowed(origin))
            {
                context.Response.Headers["Access-Control-Allow-Origin"] = origin;
                context.Response.Headers["Access-Control-Allow-Credentials"] = "true";
                context.Response.Headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Trace-ID, Idempotency-Key";
                context.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
                context.Response.Headers.Append("Vary", "Origin");
            }

            if (HttpMethods.IsOptions(context.Request.Method))
            {
                context.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }

            await next();
        });
    }

    /// <summary>
    /// Installs the token validation that the gateway used to perform. Paths for which
    /// <paramref name="isAnonymous"/> returns true skip validation (health, Swagger,
    /// login/signup/refresh, and the browser-driven Google OAuth redirects).
    /// </summary>
    public static void UseJwtValidation(
        this WebApplication app,
        IConfiguration config,
        Func<PathString, bool> isAnonymous)
    {
        var secret = config["JWT_SECRET"]
            ?? throw new InvalidOperationException("JWT_SECRET is missing");

        app.UseMiddleware<JwtValidationMiddleware>(new JwtValidationOptions
        {
            Secret = secret,
            Issuer = config["JWT_ISSUER"],
            Audience = config["JWT_AUDIENCE"],
            IsAnonymous = isAnonymous,
        });
    }

    /// <summary>Paths every service exposes without a token.</summary>
    public static bool IsCommonAnonymousPath(PathString path) =>
        path == "/"
        || path.StartsWithSegments("/health")
        || path.StartsWithSegments("/ready")
        || path.StartsWithSegments("/swagger");

    /// <summary>
    /// Reads the identity the JWT middleware attached to the request. Handlers that
    /// previously did <c>ResolveUserAsync(req, db)</c> against the single database now
    /// call this when all they need are claims the token already carries.
    /// </summary>
    public static JwtIdentity? Identity(this HttpRequest req)
    {
        if (req.HttpContext.Items.TryGetValue(nameof(JwtIdentity), out var value) && value is JwtIdentity id)
            return id;

        // Fall back to the headers so the accessor also works for code paths that
        // only ever saw the gateway-injected headers.
        var rawId = req.Headers[JwtIdentityHeaders.UserId].FirstOrDefault();
        if (!Guid.TryParse(rawId, out var userId)) return null;

        var roles = (req.Headers[JwtIdentityHeaders.UserRoles].FirstOrDefault() ?? "buyer")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return new JwtIdentity(
            userId,
            req.Headers[JwtIdentityHeaders.UserEmail].FirstOrDefault() ?? "",
            roles.Length == 0 ? ["buyer"] : roles,
            req.Headers[JwtIdentityHeaders.IsBuyer].FirstOrDefault() == "true",
            req.Headers[JwtIdentityHeaders.IsSeller].FirstOrDefault() == "true");
    }

    public static Guid? UserId(this HttpRequest req) => req.Identity()?.UserId;
}

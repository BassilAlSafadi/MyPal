using System.Security.Claims;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.EntityFrameworkCore;
using MyPal.Auth.Data;
using MyPal.Auth.Data.Entities;
using MyPal.Auth.Services;
using MyPal.ServiceDefaults;

// MyPal Auth service — identity, sessions and user profiles, on mypal_auth.
//
// Split out of the former MyPal.API monolith. The endpoint bodies below are the
// monolith's, unchanged; what changed around them is the wiring:
//   - the routes are published on their public /api/v1/... paths, because the Go
//     gateway that used to translate /api/v1/* to /api/* is gone;
//   - the token is validated here rather than at the gateway;
//   - the welcome wallet is no longer seeded at signup. wallet_balance moved to
//     the payments-owned public.wallets table, and Payments seeds the welcome
//     grant on first access.

var builder = ServiceHost.CreateBuilder(args, "auth", defaultPort: 5000);

builder.Services.AddDbContext<AuthDbContext>(options =>
    options.UseNpgsql(ServiceHost.ResolveConnectionString(builder.Configuration, "AUTH", "mypal_auth")));

builder.Services.AddScoped<IJwtService, JwtService>();

string? googleClientId = builder.Configuration["GOOGLE_CLIENT_ID"];
string? googleClientSecret = builder.Configuration["GOOGLE_CLIENT_SECRET"];
var googleConfigured = !string.IsNullOrWhiteSpace(googleClientId) && !string.IsNullOrWhiteSpace(googleClientSecret);

var authBuilder = builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = googleConfigured
        ? GoogleDefaults.AuthenticationScheme
        : CookieAuthenticationDefaults.AuthenticationScheme;
})
.AddCookie();

if (googleConfigured)
{
    authBuilder.AddGoogle(options =>
    {
        options.ClientId = googleClientId!;
        options.ClientSecret = googleClientSecret!;
        options.CallbackPath = "/api/auth/google/callback";
    });
}

builder.Services.AddAuthorization();

var app = builder.Build();

app.UseForwardedHeaders();
app.UseSwagger();
app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "MyPal Auth v1"));
app.UseServiceCors(builder.Configuration);

// Login / signup / refresh / logout are public, and the Google OAuth routes are
// hit by the browser mid-redirect with no token of ours yet. Everything else
// requires a valid access token.
app.UseJwtValidation(builder.Configuration, path =>
    ServiceHost.IsCommonAnonymousPath(path)
    || path.StartsWithSegments("/api/auth/google")
    || path == "/api/v1/auth/login"
    || path == "/api/v1/auth/signup"
    || path == "/api/v1/auth/refresh"
    || path == "/api/v1/auth/logout");

app.UseAuthentication();
app.UseAuthorization();

var connectionString = ServiceHost.ResolveConnectionString(builder.Configuration, "AUTH", "mypal_auth");

app.MapGet("/", async (AuthDbContext db) =>
{
    var dbOk = false;
    var dbError = "";
    try { dbOk = await db.Database.CanConnectAsync(); }
    catch (Exception ex) { dbError = ex.Message.Split('\n')[0]; }

    return Results.Json(new
    {
        service   = "MyPal Auth service",
        status    = dbOk ? "ok" : "degraded",
        version   = "1.0.0",
        database  = "mypal_auth",
        postgres  = new { configured = !string.IsNullOrEmpty(connectionString), connected = dbOk, error = dbError.Length > 0 ? dbError : null },
        endpoints = new[]
        {
            "POST /api/v1/auth/signup", "POST /api/v1/auth/login", "POST /api/v1/auth/refresh", "POST /api/v1/auth/logout",
            "POST /api/v1/auth/bootstrap-session",
            "GET  /api/auth/google/login",
            "GET  /api/v1/users/me", "PUT /api/v1/users/me", "PATCH /api/v1/users/me/location",
        }
    });
});

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "auth" }));

// ─── Auth ──────────────────────────────────────────────────────────────────

app.MapPost("/api/v1/auth/signup", async (SignupRequest request, HttpContext context, AuthDbContext db, IJwtService jwtService) =>
{
    if (string.IsNullOrWhiteSpace(request.Email))
        return Results.BadRequest(new { error = "Email is required" });
    if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
        return Results.BadRequest(new { error = "Password must be at least 8 characters" });

    var user = await db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
    if (user != null) return Results.BadRequest(new { error = "User already exists" });

    var displayName = string.IsNullOrWhiteSpace(request.Name)
        ? request.Email.Split('@')[0]
        : request.Name.Trim();
    var nameParts = displayName.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    user = new User
    {
        Id = Guid.NewGuid(),
        Email = request.Email,
        FirstName = nameParts.Length > 0 ? nameParts[0] : displayName,
        LastName = nameParts.Length > 1 ? string.Join(" ", nameParts.Skip(1)) : "",
        Country = string.IsNullOrWhiteSpace(request.Country) ? null : request.Country.Trim(),
        State = string.IsNullOrWhiteSpace(request.State) ? null : request.State.Trim(),
        City = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim(),
        PasswordHash = PasswordHasher.Hash(request.Password),
        IsBuyer = true,
        Roles = ["buyer"],
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    db.Users.Add(user);
    await db.SaveChangesAsync();

    var accessToken = jwtService.GenerateAccessToken(user);
    var refreshToken = jwtService.GenerateRefreshToken(user);
    SetRefreshCookie(context, refreshToken);

    return Results.Ok(AuthPayload(user, accessToken, refreshToken));
});

app.MapPost("/api/v1/auth/login", async (LoginRequest request, HttpContext context, AuthDbContext db, IJwtService jwtService) =>
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        return Results.Unauthorized();

    var user = await db.Users.FirstOrDefaultAsync(u => u.Email == request.Email && u.IsDeleted != true);
    if (user == null) return Results.Unauthorized();

    if (!string.IsNullOrEmpty(user.PasswordHash))
    {
        // Account has a password set — verify it.
        if (!PasswordHasher.Verify(request.Password, user.PasswordHash))
            return Results.Unauthorized();
    }
    else
    {
        // Legacy/OAuth account with no password yet. Trust-on-first-use: the next
        // password login establishes the password for this account. This migrates
        // pre-existing demo accounts without locking anyone out; new accounts always
        // have a hash from signup so they take the verify branch above.
        user.PasswordHash = PasswordHasher.Hash(request.Password);
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    var accessToken = jwtService.GenerateAccessToken(user);
    var refreshToken = jwtService.GenerateRefreshToken(user);
    SetRefreshCookie(context, refreshToken);

    return Results.Ok(AuthPayload(user, accessToken, refreshToken));
});

app.MapGet("/api/auth/google/login", () =>
{
    var properties = new AuthenticationProperties { RedirectUri = "/api/auth/google/complete" };
    return Results.Challenge(properties, [GoogleDefaults.AuthenticationScheme]);
});

app.MapGet("/api/auth/google/complete", async (HttpContext context, AuthDbContext db, IJwtService jwtService, IConfiguration config) =>
{
    var result = await context.AuthenticateAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    if (!result.Succeeded) return Results.BadRequest("Google authentication failed");

    var email = result.Principal.FindFirstValue(ClaimTypes.Email);
    if (string.IsNullOrEmpty(email)) return Results.BadRequest("Email not found in Google response");

    var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
    if (user == null)
    {
        user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            FirstName = result.Principal.FindFirstValue(ClaimTypes.GivenName) ?? "",
            LastName = result.Principal.FindFirstValue(ClaimTypes.Surname) ?? "",
            IsBuyer = true,
            Roles = ["buyer"],
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
    }

    user.UpdatedAt = DateTime.UtcNow;

    var accessToken = jwtService.GenerateAccessToken(user);
    var refreshToken = jwtService.GenerateRefreshToken(user);
    SetRefreshCookie(context, refreshToken);

    var frontendUrl = config["FRONTEND_URL"] ?? "http://localhost:5173";
    // Include the refresh token in the URL so the SPA can persist it in localStorage
    // immediately — needed on iOS Safari and other browsers that block cross-site cookies.
    // The SPA navigates away with replace:true so the token doesn't stay in browser history.
    return Results.Redirect($"{frontendUrl}/auth/callback?access_token={Uri.EscapeDataString(accessToken)}&refresh_token={Uri.EscapeDataString(refreshToken)}");
});

app.MapPost("/api/v1/auth/refresh", async (RefreshRequest request, HttpContext context, AuthDbContext db, IJwtService jwtService) =>
{
    var refreshToken = request.RefreshToken ?? context.Request.Cookies["mypal_refresh"];
    if (string.IsNullOrWhiteSpace(refreshToken)) return Results.Unauthorized();

    ClaimsPrincipal? principal;
    try { principal = jwtService.ValidateRefreshToken(refreshToken); }
    catch { return Results.Unauthorized(); }

    var subject = principal?.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? principal?.FindFirstValue("sub");
    if (!Guid.TryParse(subject, out var userId)) return Results.Unauthorized();

    var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
    if (user == null) return Results.Unauthorized();

    var accessToken = jwtService.GenerateAccessToken(user);
    var rotatedRefreshToken = jwtService.GenerateRefreshToken(user);
    SetRefreshCookie(context, rotatedRefreshToken);

    return Results.Ok(AuthPayload(user, accessToken, rotatedRefreshToken));
});

// Issues a refresh cookie for an already-authenticated session. Used after Google
// OAuth, whose original refresh cookie was set during the redirect chain and may be
// unreachable to the SPA's later /refresh call.
app.MapPost("/api/v1/auth/bootstrap-session", async (HttpRequest req, HttpContext context, AuthDbContext db, IJwtService jwtService) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    var refreshToken = jwtService.GenerateRefreshToken(user);
    SetRefreshCookie(context, refreshToken);
    return Results.Ok(new { ok = true });
});

app.MapPost("/api/v1/auth/logout", (HttpContext context) =>
{
    // Delete must mirror the SameSite/Secure attributes the cookie was set with,
    // or the browser won't match and clear it.
    context.Response.Cookies.Delete("mypal_refresh", RefreshCookieOptions(context, DateTimeOffset.UtcNow.AddDays(-1)));
    return Results.Ok();
});

// ─── Users ─────────────────────────────────────────────────────────────────

app.MapGet("/api/v1/users/me", async (HttpRequest req, AuthDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();
    return Results.Ok(ToUserIdentity(user));
});

app.MapPut("/api/v1/users/me", async (HttpRequest req, UpdateProfileRequest body, AuthDbContext db, IServiceCache cache) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    if (!string.IsNullOrWhiteSpace(body.FirstName)) user.FirstName = body.FirstName.Trim();
    if (!string.IsNullOrWhiteSpace(body.LastName))  user.LastName  = body.LastName.Trim();
    if (body.Phone          is not null) user.Phone          = body.Phone;
    if (body.LifeTrackStory is not null) user.LifeTrackStory = body.LifeTrackStory;
    // Location — set by signup form AND by the post-Google-OAuth onboarding screen
    if (!string.IsNullOrWhiteSpace(body.Country)) user.Country = body.Country.Trim();
    if (!string.IsNullOrWhiteSpace(body.State))   user.State   = body.State.Trim();
    if (!string.IsNullOrWhiteSpace(body.City))    user.City    = body.City.Trim();
    user.UpdatedAt = DateTime.UtcNow;

    await db.SaveChangesAsync();
    await cache.InvalidateAsync($"profile:{user.Id}");
    return Results.Ok(ToUserIdentity(user));
});

app.MapPatch("/api/v1/users/me/location", async (HttpRequest req, UpdateLocationRequest body, AuthDbContext db, IServiceCache cache) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    user.GooglePlaceId = body.GooglePlaceId;
    user.Lat           = body.Lat;
    user.Lng           = body.Lng;
    user.City          = body.City;
    user.State         = body.State;
    user.UpdatedAt     = DateTime.UtcNow;

    await db.SaveChangesAsync();
    await cache.InvalidateAsync($"profile:{user.Id}");
    return Results.Ok(new { ok = true });
});

// Called by the Listings service the first time a user publishes a product.
// Before the split this was the inline `user.IsSeller = true` inside POST /api/products;
// the users table now belongs to this service, so the write happens here.
app.MapPost("/api/v1/users/me/promote-seller", async (HttpRequest req, AuthDbContext db, IServiceCache cache) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    if (!user.IsSeller)
    {
        user.IsSeller = true;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await cache.InvalidateAsync($"profile:{user.Id}");
    }

    return Results.Ok(new { ok = true, is_seller = user.IsSeller });
});

app.Run();

// ─── Helpers ────────────────────────────────────────────────────────────────

static async Task<User?> ResolveUserAsync(HttpRequest req, AuthDbContext db)
{
    var userId = req.UserId();
    if (userId is null) return null;
    return await db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.IsDeleted != true);
}

static AuthResponse AuthPayload(User user, string accessToken, string refreshToken) =>
    new(ToUserIdentity(user), accessToken, refreshToken, 900);

static UserIdentityResponse ToUserIdentity(User user)
{
    var username = user.Email.Split('@')[0];
    return new UserIdentityResponse(
        user.Id, user.Email, username,
        user.FirstName, user.LastName,
        user.Phone,
        // wallet_balance is payments-owned since the split. The field stays in the
        // response so the client contract is unchanged; the SPA reads the live
        // balance from the payments service via GET /api/v1/wallet.
        null,
        user.IsBuyer, user.IsSeller,
        user.Roles, user.CreatedAt, user.UpdatedAt,
        user.Country, user.State, user.City,
        user.GooglePlaceId, user.Lat, user.Lng);
}

static void SetRefreshCookie(HttpContext context, string refreshToken)
{
    context.Response.Cookies.Append("mypal_refresh", refreshToken, RefreshCookieOptions(context, DateTimeOffset.UtcNow.AddDays(3650)));
}

// The SPA talks to this service cross-site, so the refresh cookie must be
// SameSite=None to be sent on cross-origin fetch — otherwise the browser drops it
// on reload and the user is forced to log in again. SameSite=None requires Secure,
// which local HTTP dev can't provide, so fall back to Lax there.
static CookieOptions RefreshCookieOptions(HttpContext context, DateTimeOffset expires)
{
    var crossSite = context.Request.IsHttps;
    return new CookieOptions
    {
        HttpOnly = true,
        Secure   = crossSite,
        SameSite = crossSite ? SameSiteMode.None : SameSiteMode.Lax,
        Expires  = expires,
        Path     = "/",
    };
}

// ─── Request / Response records ─────────────────────────────────────────────

public record LoginRequest(string Email, string? Password);
public record SignupRequest(
    string Email, string Password, string? Name,
    string? Country, string? State, string? City);
public record RefreshRequest([property: JsonPropertyName("refresh_token")] string? RefreshToken);

public record UpdateProfileRequest(
    string? FirstName, string? LastName,
    string? Phone, string? LifeTrackStory,
    string? Country, string? State, string? City);

public record UpdateLocationRequest(
    string? GooglePlaceId, double? Lat, double? Lng,
    string? City, string? State);

public record AuthResponse(
    UserIdentityResponse User,
    [property: JsonPropertyName("access_token")]  string AccessToken,
    [property: JsonPropertyName("refresh_token")] string RefreshToken,
    [property: JsonPropertyName("expires_in")]    int ExpiresIn);

public record UserIdentityResponse(
    Guid Id,
    string Email,
    string Username,
    [property: JsonPropertyName("first_name")] string FirstName,
    [property: JsonPropertyName("last_name")]  string LastName,
    string? Phone,
    [property: JsonPropertyName("wallet_balance")] decimal? WalletBalance,
    [property: JsonPropertyName("is_buyer")]   bool IsBuyer,
    [property: JsonPropertyName("is_seller")]  bool IsSeller,
    string[] Roles,
    [property: JsonPropertyName("created_at")] DateTime? CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTime? UpdatedAt,
    // Location fields — null means the user hasn't completed onboarding yet.
    // The frontend uses country == null to detect incomplete Google signups.
    string? Country,
    string? State,
    string? City,
    // Exposed so the orders service can snapshot the saved delivery address
    // onto a new order, which it used to read straight off the users table.
    [property: JsonPropertyName("google_place_id")] string? GooglePlaceId,
    double? Lat,
    double? Lng);

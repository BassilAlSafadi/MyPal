using System.Security.Claims;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using MyPal.API.Services;
using MyPal.Infrastructure.Data;
using MyPal.Infrastructure.Data.Entities;

var builder = WebApplication.CreateBuilder(args);

// Ensure the application reads environment variables
builder.Configuration.AddEnvironmentVariables();

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor
        | ForwardedHeaders.XForwardedHost
        | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

var connectionString = builder.Configuration["POSTGRES_SESSION_URL"] ?? builder.Configuration["POSTGRES_URL"];
builder.Services.AddDbContext<MyPalDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddScoped<IJwtService, JwtService>();

builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = GoogleDefaults.AuthenticationScheme;
})
.AddCookie()
.AddGoogle(options =>
{
    options.ClientId = builder.Configuration["GOOGLE_CLIENT_ID"] ?? "placeholder";
    options.ClientSecret = builder.Configuration["GOOGLE_CLIENT_SECRET"] ?? "placeholder";
    options.CallbackPath = "/api/auth/google/callback";
});

builder.Services.AddAuthorization();

var app = builder.Build();

app.UseForwardedHeaders();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/", () => $"C# Backend running! Postgres Configured: {!string.IsNullOrEmpty(connectionString)}");

// --- Auth Endpoints ---

app.MapPost("/api/auth/signup", async (SignupRequest request, MyPalDbContext db, IJwtService jwtService) =>
{
    if (string.IsNullOrWhiteSpace(request.Email))
    {
        return Results.BadRequest(new { error = "Email is required" });
    }

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
        IsBuyer = true,
        Roles = ["buyer"],
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    db.Users.Add(user);
    await db.SaveChangesAsync();

    var accessToken = jwtService.GenerateAccessToken(user);
    var refreshToken = jwtService.GenerateRefreshToken();

    return Results.Ok(AuthPayload(user, accessToken, refreshToken));
});

app.MapPost("/api/auth/login", async (LoginRequest request, MyPalDbContext db, IJwtService jwtService) =>
{
    var user = await db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
    if (user == null) return Results.Unauthorized();

    // In a real app, verify password hash here.

    var accessToken = jwtService.GenerateAccessToken(user);
    var refreshToken = jwtService.GenerateRefreshToken();

    return Results.Ok(AuthPayload(user, accessToken, refreshToken));
});

app.MapGet("/api/auth/google/login", () =>
{
    var properties = new AuthenticationProperties { RedirectUri = "/api/auth/google/complete" };
    return Results.Challenge(properties, [GoogleDefaults.AuthenticationScheme]);
});

app.MapGet("/api/auth/google/complete", async (HttpContext context, MyPalDbContext db, IJwtService jwtService) =>
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
    var refreshToken = jwtService.GenerateRefreshToken();

    var frontendUrl = builder.Configuration["FRONTEND_URL"] ?? "http://localhost:5173";
    return Results.Redirect($"{frontendUrl}/auth/callback?access_token={accessToken}&refresh_token={refreshToken}");
});

app.MapPost("/api/auth/refresh", (RefreshRequest request, IJwtService jwtService) =>
{
    // Validate refresh token and issue new access token.
    return Results.Ok(new { access_token = "new-access-token" });
});

app.MapPost("/api/auth/logout", () => Results.Ok());

static AuthResponse AuthPayload(User user, string accessToken, string refreshToken) =>
    new(ToUserIdentity(user), accessToken, refreshToken, 900);

static UserIdentityResponse ToUserIdentity(User user)
{
    var username = user.Email.Split('@')[0];
    return new UserIdentityResponse(
        user.Id,
        user.Email,
        username,
        user.IsBuyer,
        user.IsSeller,
        user.Roles,
        user.CreatedAt,
        user.UpdatedAt
    );
}

app.Run();

public record LoginRequest(string Email, string? Password);
public record SignupRequest(string Email, string Password, string? Name);
public record RefreshRequest(string? RefreshToken);

public record AuthResponse(
    UserIdentityResponse User,
    [property: JsonPropertyName("access_token")] string AccessToken,
    [property: JsonPropertyName("refresh_token")] string RefreshToken,
    [property: JsonPropertyName("expires_in")] int ExpiresIn
);

public record UserIdentityResponse(
    Guid Id,
    string Email,
    string Username,
    [property: JsonPropertyName("is_buyer")] bool IsBuyer,
    [property: JsonPropertyName("is_seller")] bool IsSeller,
    string[] Roles,
    [property: JsonPropertyName("created_at")] DateTime? CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTime? UpdatedAt
);

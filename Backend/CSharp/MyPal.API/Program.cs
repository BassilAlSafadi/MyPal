using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.EntityFrameworkCore;
using MyPal.API.Services;
using MyPal.Infrastructure.Data;
using MyPal.Infrastructure.Data.Entities;

var builder = WebApplication.CreateBuilder(args);

// Ensure the application reads environment variables
builder.Configuration.AddEnvironmentVariables();

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

app.MapGet("/", () => $"C# Backend running! Postgres Configured: {!string.IsNullOrEmpty(connectionString)}");

// --- Auth Endpoints ---

app.MapPost("/api/auth/signup", async (SignupRequest request, MyPalDbContext db, IJwtService jwtService) =>
{
    var user = await db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
    if (user != null) return Results.BadRequest("User already exists");

    user = new User
    {
        Id = Guid.NewGuid(),
        Email = request.Email,
        FirstName = request.Name.Split(' ')[0],
        LastName = request.Name.Contains(' ') ? request.Name.Split(' ')[1] : "",
        IsBuyer = true,
        Roles = ["buyer"]
    };

    db.Users.Add(user);
    await db.SaveChangesAsync();
    
    var accessToken = jwtService.GenerateAccessToken(user);
    var refreshToken = jwtService.GenerateRefreshToken();

    return Results.Ok(new
    {
        user = new { user.Id, user.Email, user.IsBuyer, user.IsSeller, user.Roles },
        access_token = accessToken,
        refresh_token = refreshToken,
        expires_in = 900
    });
});

app.MapPost("/api/auth/login", async (LoginRequest request, MyPalDbContext db, IJwtService jwtService) =>
{
    var user = await db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
    if (user == null) return Results.Unauthorized();

    // In a real app, verify password hash here.
    
    var accessToken = jwtService.GenerateAccessToken(user);
    var refreshToken = jwtService.GenerateRefreshToken();

    return Results.Ok(new
    {
        user = new { user.Id, user.Email, user.IsBuyer, user.IsSeller, user.Roles },
        access_token = accessToken,
        refresh_token = refreshToken,
        expires_in = 900 // 15 mins
    });
});

app.MapGet("/api/auth/google/login", () =>
{
    var properties = new AuthenticationProperties { RedirectUri = "/api/auth/google/callback" };
    return Results.Challenge(properties, [GoogleDefaults.AuthenticationScheme]);
});

app.MapGet("/api/auth/google/callback", async (HttpContext context, MyPalDbContext db, IJwtService jwtService) =>
{
    var result = await context.AuthenticateAsync(GoogleDefaults.AuthenticationScheme);
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
            Roles = ["buyer"]
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
    }

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

app.Run();

public record LoginRequest(string Email, string? Password);
public record SignupRequest(string Email, string Password, string Name);
public record RefreshRequest(string RefreshToken);

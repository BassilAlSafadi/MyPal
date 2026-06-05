using System.IO;
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
using MyPal.Infrastructure.Data.Entities.Enums;

// The Supabase schema stores created_at/updated_at as `timestamp without time zone`,
// while the domain code assigns DateTime.UtcNow (Kind=Utc). Npgsql 6+ rejects writing a
// UTC DateTime to a non-tz column. Legacy timestamp behavior maps both the way EF expects
// without retyping every timestamp column across all entities. Must run before any Npgsql use.
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

LoadDotEnv(Directory.GetCurrentDirectory());
var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddEnvironmentVariables();

// HTTP port for the existing REST API (used by browser-facing flows and by the
// gRPC service self-calls).  gRPC listens on GRPC_PORT (default 5010) over
// plain HTTP/2 — no TLS needed since it's localhost-only.
var httpPort  = int.Parse(Environment.GetEnvironmentVariable("PORT")      ?? "5000");
var grpcPort  = int.Parse(Environment.GetEnvironmentVariable("GRPC_PORT") ?? "5010");

builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.ListenAnyIP(httpPort, o => o.Protocols = Microsoft.AspNetCore.Server.Kestrel.Core.HttpProtocols.Http1);
    kestrel.ListenAnyIP(grpcPort, o => o.Protocols = Microsoft.AspNetCore.Server.Kestrel.Core.HttpProtocols.Http2);
});

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor
        | ForwardedHeaders.XForwardedHost
        | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

// Resolution order (first non-empty wins):
//   1. POSTGRES_SESSION_URL   – Supabase session-mode / PgBouncer
//   2. POSTGRES_URL           – standard connection URL env var
//   3. ConnectionStrings:DefaultConnection – appsettings / dev override
var connectionString =
    builder.Configuration["POSTGRES_SESSION_URL"]
    ?? builder.Configuration["POSTGRES_URL"]
    ?? builder.Configuration.GetConnectionString("DefaultConnection");

builder.Services.AddDbContext<MyPalDbContext>(options =>
{
    var cs = connectionString ?? "Host=localhost;Port=5432;Database=mypal;Username=postgres;Password=postgres";
    options.UseNpgsql(cs);
});

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

// ── gRPC services ─────────────────────────────────────────────────────────────
// Each gRPC service class uses IHttpClientFactory to self-call the REST handlers
// on the same Kestrel HTTP port, so all business logic stays in one place.
builder.Services.AddGrpc();
// UseCookies must be false so Set-Cookie headers from self-call responses are
// accessible in resp.Headers — otherwise SocketsHttpHandler silently stores them
// in its internal cookie container and they are never seen by the gRPC service.
builder.Services.AddHttpClient("grpc-internal")
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { UseCookies = false });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "MyPal API", Version = "v1" });
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

var app = builder.Build();

app.UseForwardedHeaders();
app.UseSwagger();
app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "MyPal API v1"));
app.UseAuthentication();
app.UseAuthorization();

// ── gRPC service endpoints (bound on grpcPort via Kestrel HTTP/2) ─────────────
app.MapGrpcService<MyPal.API.GrpcServices.AuthGrpcService>();
app.MapGrpcService<MyPal.API.GrpcServices.UserGrpcService>();
app.MapGrpcService<MyPal.API.GrpcServices.ProductGrpcService>();
app.MapGrpcService<MyPal.API.GrpcServices.OrderGrpcService>();
app.MapGrpcService<MyPal.API.GrpcServices.CartGrpcService>();
app.MapGrpcService<MyPal.API.GrpcServices.WalletGrpcService>();
app.MapGrpcService<MyPal.API.GrpcServices.WishlistGrpcService>();
app.MapGrpcService<MyPal.API.GrpcServices.NotificationGrpcService>();
app.MapGrpcService<MyPal.API.GrpcServices.ListingGrpcService>();

// ─── Internal-service gate (defense in depth) ────────────────────────────────
// Every request reaches C# through the Go gateway, which injects X-Internal-Token.
// Requiring it here means the C# space cannot be called directly with a forged
// X-User-Id to impersonate users. Exempt: root health, Swagger, and the Google
// OAuth routes (those are hit by the browser directly, not via the gateway).
var internalServiceToken = builder.Configuration["INTERNAL_SERVICE_TOKEN"];
app.Use(async (context, next) =>
{
    var path = context.Request.Path.Value ?? "";
    var exempt = path == "/"
        || path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase)
        || path.StartsWith("/api/auth/google", StringComparison.OrdinalIgnoreCase)
        // gRPC service paths all begin with "/mypal." (the proto package name).
        // They arrive on the HTTP/2 gRPC port from the gateway — not from the browser —
        // so they never carry X-Internal-Token as an HTTP header.
        // The gateway-to-gRPC trust is implicit: the gRPC port is localhost-only.
        || path.StartsWith("/mypal.", StringComparison.OrdinalIgnoreCase);

    if (!exempt && !string.IsNullOrEmpty(internalServiceToken))
    {
        var provided = context.Request.Headers["X-Internal-Token"].FirstOrDefault();
        if (!CryptographicEquals(provided, internalServiceToken))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { error = "Forbidden: requests must go through the gateway" });
            return;
        }
    }

    await next();
});

app.MapGet("/", async (MyPalDbContext db) =>
{
    var dbOk = false;
    var dbError = "";
    try { dbOk = await db.Database.CanConnectAsync(); }
    catch (Exception ex) { dbError = ex.Message.Split('\n')[0]; }

    return Results.Json(new
    {
        service   = "MyPal C# API",
        status    = dbOk ? "ok" : "degraded",
        version   = "1.0.0",
        postgres  = new { configured = !string.IsNullOrEmpty(connectionString), connected = dbOk, error = dbError.Length > 0 ? dbError : null },
        endpoints = new[]
        {
            "POST /api/auth/signup", "POST /api/auth/login", "POST /api/auth/refresh", "POST /api/auth/logout",
            "GET  /api/auth/google/login",
            "GET  /api/users/me", "PUT /api/users/me", "PATCH /api/users/me/location",
            "GET  /api/products", "GET /api/products/{id}", "POST /api/products", "PUT /api/products/{id}", "DELETE /api/products/{id}",
            "GET  /api/orders", "GET /api/orders/{id}", "POST /api/orders",
            "GET  /api/cart", "POST /api/cart/items", "DELETE /api/cart/items/{productId}",
            "GET  /api/notifications", "PATCH /api/notifications/{id}/read",
        }
    });
});

static void LoadDotEnv(string contentRootPath)
{
    var possiblePaths = new[]
    {
        Path.Combine(contentRootPath, ".env"),
        Path.GetFullPath(Path.Combine(contentRootPath, "..", "..", "..", ".env"))
    };

    foreach (var path in possiblePaths)
    {
        if (!File.Exists(path)) continue;

        foreach (var rawLine in File.ReadLines(path))
        {
            var line = rawLine.Trim();
            if (string.IsNullOrEmpty(line) || line.StartsWith("#")) continue;
            var separatorIndex = line.IndexOf('=');
            if (separatorIndex <= 0) continue;

            var key = line[..separatorIndex].Trim();
            var value = line[(separatorIndex + 1)..].Trim().Trim('"');
            if (string.IsNullOrEmpty(key)) continue;
            if (Environment.GetEnvironmentVariable(key) is null)
            {
                Environment.SetEnvironmentVariable(key, value);
            }
        }

        break;
    }
}

// ─── Auth ──────────────────────────────────────────────────────────────────

app.MapPost("/api/auth/signup", async (SignupRequest request, HttpContext context, MyPalDbContext db, IJwtService jwtService) =>
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
    SeedWelcomeWallet(user, db);
    await db.SaveChangesAsync();

    var accessToken = jwtService.GenerateAccessToken(user);
    var refreshToken = jwtService.GenerateRefreshToken(user);
    SetRefreshCookie(context, refreshToken);

    return Results.Ok(AuthPayload(user, accessToken, refreshToken));
});

app.MapPost("/api/auth/login", async (LoginRequest request, HttpContext context, MyPalDbContext db, IJwtService jwtService) =>
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
        SeedWelcomeWallet(user, db);
        await db.SaveChangesAsync();
    }

    user.UpdatedAt = DateTime.UtcNow;

    var accessToken = jwtService.GenerateAccessToken(user);
    var refreshToken = jwtService.GenerateRefreshToken(user);
    SetRefreshCookie(context, refreshToken);

    var frontendUrl = builder.Configuration["FRONTEND_URL"] ?? "http://localhost:5173";
    // Include the refresh token in the URL so the SPA can persist it in localStorage
    // immediately — needed on iOS Safari and other browsers that block cross-site cookies.
    // The SPA navigates away with replace:true so the token doesn't stay in browser history.
    return Results.Redirect($"{frontendUrl}/auth/callback?access_token={Uri.EscapeDataString(accessToken)}&refresh_token={Uri.EscapeDataString(refreshToken)}");
});

app.MapPost("/api/auth/refresh", async (RefreshRequest request, HttpContext context, MyPalDbContext db, IJwtService jwtService) =>
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

// Issues a refresh cookie for an already-authenticated session. The gateway validates
// the access token and injects X-User-Id before this runs. Used after Google OAuth,
// whose original refresh cookie was set on the C# domain (hf.space) and is therefore
// unreachable by the gateway-routed /refresh. Because this response flows back through
// the gateway, the Set-Cookie lands on the gateway domain where /refresh can read it.
app.MapPost("/api/auth/bootstrap-session", async (HttpRequest req, HttpContext context, MyPalDbContext db, IJwtService jwtService) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    var refreshToken = jwtService.GenerateRefreshToken(user);
    SetRefreshCookie(context, refreshToken);
    return Results.Ok(new { ok = true });
});

app.MapPost("/api/auth/logout", (HttpContext context) =>
{
    // Delete must mirror the SameSite/Secure attributes the cookie was set with,
    // or the browser won't match and clear it.
    context.Response.Cookies.Delete("mypal_refresh", RefreshCookieOptions(context, DateTimeOffset.UtcNow.AddDays(-1)));
    return Results.Ok();
});

// ─── Users ─────────────────────────────────────────────────────────────────

app.MapGet("/api/users/me", async (HttpRequest req, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();
    return Results.Ok(ToUserIdentity(user));
});

app.MapPut("/api/users/me", async (HttpRequest req, UpdateProfileRequest body, MyPalDbContext db) =>
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
    return Results.Ok(ToUserIdentity(user));
});

app.MapPatch("/api/users/me/location", async (HttpRequest req, UpdateLocationRequest body, MyPalDbContext db) =>
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
    return Results.Ok(new { ok = true });
});

// ─── Products ──────────────────────────────────────────────────────────────

app.MapGet("/api/products", async (MyPalDbContext db, int page = 1, int pageSize = 20, string? category = null, string? type = null) =>
{
    if (page < 1) page = 1;
    if (pageSize is < 1 or > 100) pageSize = 20;

    var query = db.Products
        .Where(p => p.IsDeleted != true)
        .AsQueryable();

    if (!string.IsNullOrWhiteSpace(category)) query = query.Where(p => p.Category == category);
    if (!string.IsNullOrWhiteSpace(type))     query = query.Where(p => p.Type == type);

    var total   = await query.CountAsync();
    var results = await query
        .OrderByDescending(p => p.CreatedAt)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(p => new
        {
            id            = p.Id,
            name          = p.Name,
            description   = p.Description,
            category      = p.Category,
            type          = p.Type,
            current_price = p.CurrentPrice,
            stock_qty     = p.StockQty,
            rating        = p.ProductReviews.Where(r => r.Score != null).Average(r => (double?)r.Score) ?? 0,
            review_count  = p.ProductReviews.Count,
            image         = p.ProductMedia.OrderBy(m => m.DisplayOrder).Select(m => m.Url).FirstOrDefault(),
            media         = p.ProductMedia.OrderBy(m => m.DisplayOrder)
                             .Select(m => new { m.Id, m.Url, m.MediaType, display_order = m.DisplayOrder })
                             .ToList(),
            // No vendor/seller table exists in this DB; the catalog is MyPal-resident inventory.
            seller        = new { name = "MyPal", is_mypal = true },
            created_at    = p.CreatedAt,
            updated_at    = p.UpdatedAt,
        })
        .ToListAsync();

    return Results.Ok(new { total, page, pageSize, products = results });
});

app.MapGet("/api/products/{id:guid}", async (Guid id, MyPalDbContext db) =>
{
    var p = await db.Products
        .Include(x => x.ProductMedia)
        .Include(x => x.ProductAttributes)
        .Include(x => x.ProductReviews)
        .FirstOrDefaultAsync(x => x.Id == id && x.IsDeleted != true);

    if (p == null) return Results.NotFound(new { error = "Product not found" });

    var scored = p.ProductReviews.Where(r => r.Score != null).ToList();

    return Results.Ok(new
    {
        id            = p.Id,
        name          = p.Name,
        description   = p.Description,
        category      = p.Category,
        type          = p.Type,
        current_price = p.CurrentPrice,
        stock_qty     = p.StockQty,
        rating        = scored.Count > 0 ? scored.Average(r => r.Score!.Value) : 0,
        review_count  = p.ProductReviews.Count,
        image         = p.ProductMedia.OrderBy(m => m.DisplayOrder).Select(m => m.Url).FirstOrDefault(),
        // No vendor/seller table exists in this DB; the catalog is MyPal-resident inventory.
        seller        = new { name = "MyPal", is_mypal = true },
        media         = p.ProductMedia.OrderBy(m => m.DisplayOrder)
                         .Select(m => new { m.Id, m.Url, m.MediaType, display_order = m.DisplayOrder }),
        attributes    = p.ProductAttributes.Select(a => new { a.Id, a.Name, a.Value }),
        reviews       = p.ProductReviews.OrderByDescending(r => r.CreatedAt).Take(20)
                          .Select(r => new { r.Id, score = r.Score, comment = r.Comment, created_at = r.CreatedAt }),
        created_at    = p.CreatedAt,
        updated_at    = p.UpdatedAt,
    });
});

app.MapPost("/api/products", async (HttpRequest req, CreateProductRequest body, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(body.Name))
        return Results.BadRequest(new { error = "Name is required" });
    if (body.CurrentPrice is null or <= 0)
        return Results.BadRequest(new { error = "A price greater than 0 is required" });

    var media = (body.Media ?? new List<ProductMediaInput>())
        .Where(m => !string.IsNullOrWhiteSpace(m.Url))
        .ToList();
    if (media.Count == 0)
        return Results.BadRequest(new { error = "At least one product photo is required" });

    // Listing a product makes the user a seller.
    if (!user.IsSeller)
    {
        user.IsSeller = true;
        user.UpdatedAt = DateTime.UtcNow;
    }

    var product = new Product
    {
        Id           = Guid.NewGuid(),
        Name         = body.Name.Trim(),
        Description  = body.Description,
        Category     = body.Category,
        Type         = body.Type,
        CurrentPrice = body.CurrentPrice,
        StockQty     = body.StockQty ?? 1,
        CreatedBy    = user.Id,
        CreatedAt    = DateTime.UtcNow,
        UpdatedAt    = DateTime.UtcNow,
    };

    var order = 0;
    foreach (var m in media)
    {
        product.ProductMedia.Add(new ProductMedia
        {
            Id           = Guid.NewGuid(),
            ProductId    = product.Id,
            Url          = m.Url.Trim(),
            MediaType    = string.IsNullOrWhiteSpace(m.MediaType) ? "photo" : m.MediaType!.Trim(),
            DisplayOrder = m.DisplayOrder ?? order,
            CreatedAt    = DateTime.UtcNow,
        });
        order++;
    }

    db.Products.Add(product);
    await db.SaveChangesAsync();
    return Results.Created($"/api/products/{product.Id}",
        new ProductResponse(product.Id, product.Name, product.Description,
            product.Category, product.Type, product.CurrentPrice,
            product.StockQty, product.CreatedAt, product.UpdatedAt));
});

app.MapPut("/api/products/{id:guid}", async (Guid id, HttpRequest req, UpdateProductRequest body, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();
    // Return a real 403 JSON, not Results.Forbid() — the latter triggers the cookie
    // auth handler's 302 redirect to /Account/AccessDenied, which is wrong for an API.
    if (!user.IsSeller) return Results.Json(new { error = "Only sellers can edit listings" }, statusCode: StatusCodes.Status403Forbidden);

    var product = await db.Products.FirstOrDefaultAsync(p => p.Id == id && p.IsDeleted != true);
    if (product == null) return Results.NotFound(new { error = "Product not found" });

    // Ownership: a seller may only edit their own listings. Legacy/seeded catalog
    // rows (CreatedBy == null) are not owned by any seller and cannot be edited.
    if (product.CreatedBy != user.Id)
        return Results.Json(new { error = "You can only edit your own listings" }, statusCode: StatusCodes.Status403Forbidden);

    if (body.Name is not null)         product.Name         = body.Name.Trim();
    if (body.Description is not null)  product.Description  = body.Description;
    if (body.Category is not null)     product.Category     = body.Category;
    if (body.Type is not null)         product.Type         = body.Type;
    if (body.CurrentPrice.HasValue)    product.CurrentPrice = body.CurrentPrice;
    if (body.StockQty.HasValue)        product.StockQty     = body.StockQty;
    product.UpdatedAt = DateTime.UtcNow;

    await db.SaveChangesAsync();
    return Results.Ok(new ProductResponse(product.Id, product.Name, product.Description,
        product.Category, product.Type, product.CurrentPrice,
        product.StockQty, product.CreatedAt, product.UpdatedAt));
});

app.MapDelete("/api/products/{id:guid}", async (Guid id, HttpRequest req, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();
    if (!user.IsSeller) return Results.Json(new { error = "Only sellers can delete listings" }, statusCode: StatusCodes.Status403Forbidden);

    var product = await db.Products.FirstOrDefaultAsync(p => p.Id == id && p.IsDeleted != true);
    if (product == null) return Results.NotFound(new { error = "Product not found" });

    // Ownership: a seller may only delete their own listings.
    if (product.CreatedBy != user.Id)
        return Results.Json(new { error = "You can only delete your own listings" }, statusCode: StatusCodes.Status403Forbidden);

    product.IsDeleted = true;
    product.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();

    return Results.Ok(new { ok = true });
});

// ─── Orders ─────────────────────────────────────────────────────────────────

app.MapGet("/api/orders", async (HttpRequest req, MyPalDbContext db, int page = 1, int pageSize = 20) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    if (page < 1) page = 1;
    if (pageSize is < 1 or > 100) pageSize = 20;

    var total = await db.Orders.CountAsync(o => o.UserId == user.Id);
    var orders = await db.Orders
        .Where(o => o.UserId == user.Id)
        .Include(o => o.OrderItems)
        .OrderByDescending(o => o.CreatedAt)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .ToListAsync();

    return Results.Ok(new { total, page, pageSize, orders = orders.Select(ToOrderResponse) });
});

app.MapGet("/api/orders/{id:guid}", async (Guid id, HttpRequest req, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    var order = await db.Orders
        .Include(o => o.OrderItems)
        .ThenInclude(i => i.Product)
        .FirstOrDefaultAsync(o => o.Id == id && o.UserId == user.Id);

    if (order == null) return Results.NotFound(new { error = "Order not found" });
    return Results.Ok(ToOrderResponse(order));
});

app.MapPost("/api/orders", async (HttpRequest req, CreateOrderRequest body, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    if (body.Items == null || body.Items.Count == 0)
        return Results.BadRequest(new { error = "Order must contain at least one item" });

    // Validate products, check stock, and sum total. Keep product references so
    // we can decrement stock atomically with the order below.
    decimal total = 0m;
    var orderItems = new List<OrderItem>();
    var purchasedProducts = new List<(Product Product, int Quantity)>();
    foreach (var item in body.Items)
    {
        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == item.ProductId && p.IsDeleted != true);
        if (product == null)
            return Results.BadRequest(new { error = $"Product {item.ProductId} not found" });
        if (item.Quantity <= 0)
            return Results.BadRequest(new { error = "Quantity must be > 0" });
        // Enforce stock when the product tracks it (null = untracked/unlimited).
        if (product.StockQty.HasValue && product.StockQty.Value < item.Quantity)
            return Results.BadRequest(new { error = $"Insufficient stock for {product.Name}: {product.StockQty} left" });

        var price = product.CurrentPrice ?? 0m;
        total += price * item.Quantity;
        purchasedProducts.Add((product, item.Quantity));
        orderItems.Add(new OrderItem
        {
            Id               = Guid.NewGuid(),
            ProductId        = product.Id,
            Quantity         = item.Quantity,
            PriceAtPurchase  = price,
            CreatedAt        = DateTime.UtcNow,
        });
    }

    var order = new Order
    {
        Id                       = Guid.NewGuid(),
        UserId                   = user.Id,
        Status                   = OrderStatus.Pending,
        TotalAmount              = total,
        PaymentMethod            = body.PaymentMethod,
        WalletAmountUsed         = body.WalletAmountUsed ?? 0m,
        CodAmountDue             = body.CodAmountDue     ?? 0m,
        DestinationGooglePlaceId = body.DestinationGooglePlaceId ?? user.GooglePlaceId,
        DestinationLat           = body.DestinationLat   ?? user.Lat,
        DestinationLng           = body.DestinationLng   ?? user.Lng,
        DestinationAddress       = body.DestinationAddress,
        CreatedAt                = DateTime.UtcNow,
        UpdatedAt                = DateTime.UtcNow,
    };

    foreach (var item in orderItems)
        item.OrderId = order.Id;

    await using var tx = await db.Database.BeginTransactionAsync();

    db.Orders.Add(order);
    db.OrderItems.AddRange(orderItems);
    await db.SaveChangesAsync();

    // The BEFORE-INSERT process_wallet_payment trigger recomputes wallet_amount_used,
    // cod_amount_due, payment_method and debits the wallet. Reload so the in-memory
    // entity (and the response) reflect the authoritative trigger-set values.
    await db.Entry(order).ReloadAsync();

    // Record the wallet spend in the ledger so balance and transaction history agree.
    var walletSpent = order.WalletAmountUsed;
    if (walletSpent > 0)
    {
        db.Transactions.Add(new Transaction
        {
            Id        = Guid.NewGuid(),
            UserId    = user.Id,
            Type      = "Purchase",
            Amount    = -walletSpent,
            OrderId   = order.Id,
            CreatedAt = DateTime.UtcNow,
        });
    }

    // Decrement stock for tracked products.
    foreach (var (product, qty) in purchasedProducts)
    {
        if (product.StockQty.HasValue)
        {
            product.StockQty = Math.Max(0, product.StockQty.Value - qty);
            product.UpdatedAt = DateTime.UtcNow;
        }
    }

    // Clear the cart atomically with the order so the frontend sees an empty cart
    var cart = await db.Carts.Include(c => c.CartItems)
        .FirstOrDefaultAsync(c => c.UserId == user.Id);
    if (cart != null)
    {
        db.CartItems.RemoveRange(cart.CartItems);
        db.Carts.Remove(cart);
    }

    await db.SaveChangesAsync();
    await tx.CommitAsync();

    order.OrderItems = orderItems;
    return Results.Created($"/api/orders/{order.Id}", ToOrderResponse(order));
});

// ─── Cart ──────────────────────────────────────────────────────────────────

app.MapGet("/api/cart", async (HttpRequest req, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    var cart = await db.Carts
        .Include(c => c.CartItems)
        .ThenInclude(i => i.Product)
        .FirstOrDefaultAsync(c => c.UserId == user.Id);

    if (cart == null) return Results.Ok(new { items = Array.Empty<object>(), total = 0m });

    var items = cart.CartItems.Select(i => new
    {
        id         = i.Id,
        product_id = i.ProductId,
        product    = i.Product == null ? null : new ProductResponse(
            i.Product.Id, i.Product.Name, i.Product.Description,
            i.Product.Category, i.Product.Type, i.Product.CurrentPrice,
            i.Product.StockQty, i.Product.CreatedAt, i.Product.UpdatedAt),
        quantity   = i.Quantity,
    }).ToList();

    var cartTotal = cart.CartItems.Sum(i =>
        (i.Product?.CurrentPrice ?? 0m) * (i.Quantity ?? 1));

    return Results.Ok(new { cart_id = cart.Id, items, total = cartTotal });
});

app.MapPost("/api/cart/items", async (HttpRequest req, AddCartItemRequest body, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    var product = await db.Products.FirstOrDefaultAsync(p => p.Id == body.ProductId && p.IsDeleted != true);
    if (product == null) return Results.NotFound(new { error = "Product not found" });

    var cart = await db.Carts.Include(c => c.CartItems)
        .FirstOrDefaultAsync(c => c.UserId == user.Id);

    if (cart == null)
    {
        cart = new Cart { Id = Guid.NewGuid(), UserId = user.Id };
        db.Carts.Add(cart);
    }

    var existing = cart.CartItems.FirstOrDefault(i => i.ProductId == body.ProductId);
    if (existing != null)
    {
        existing.Quantity = (existing.Quantity ?? 0) + (body.Quantity > 0 ? body.Quantity : 1);
    }
    else
    {
        db.CartItems.Add(new CartItem
        {
            Id        = Guid.NewGuid(),
            CartId    = cart.Id,
            ProductId = body.ProductId,
            Quantity  = body.Quantity > 0 ? body.Quantity : 1,
        });
    }

    await db.SaveChangesAsync();
    return Results.Ok(new { ok = true });
});

app.MapDelete("/api/cart/items/{productId:guid}", async (Guid productId, HttpRequest req, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    var cart = await db.Carts.Include(c => c.CartItems)
        .FirstOrDefaultAsync(c => c.UserId == user.Id);

    if (cart == null) return Results.NotFound(new { error = "Cart not found" });

    var item = cart.CartItems.FirstOrDefault(i => i.ProductId == productId);
    if (item == null) return Results.NotFound(new { error = "Item not in cart" });

    db.CartItems.Remove(item);
    await db.SaveChangesAsync();
    return Results.Ok(new { ok = true });
});

// ─── Notifications ──────────────────────────────────────────────────────────

app.MapGet("/api/notifications", async (HttpRequest req, MyPalDbContext db, bool unreadOnly = false) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    var query = db.Notifications.Where(n => n.UserId == user.Id);
    if (unreadOnly) query = query.Where(n => n.IsRead != true);

    var notifications = await query
        .OrderByDescending(n => n.CreatedAt)
        .Take(50)
        .ToListAsync();

    return Results.Ok(new { notifications });
});

app.MapPatch("/api/notifications/{id:guid}/read", async (Guid id, HttpRequest req, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    var notification = await db.Notifications
        .FirstOrDefaultAsync(n => n.Id == id && n.UserId == user.Id);
    if (notification == null) return Results.NotFound();

    notification.IsRead = true;
    await db.SaveChangesAsync();
    return Results.Ok(new { ok = true });
});

// ─── Wallet ────────────────────────────────────────────────────────────────

app.MapGet("/api/wallet", async (HttpRequest req, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    // Funds tied up in not-yet-completed orders are shown as "escrow".
    var escrow = await db.Orders
        .Where(o => o.UserId == user.Id && o.Status == OrderStatus.Pending)
        .SumAsync(o => (decimal?)o.WalletAmountUsed) ?? 0m;

    return Results.Ok(new
    {
        balance  = user.WalletBalance ?? 0m,
        escrow,
        currency = "USD",
    });
});

app.MapGet("/api/wallet/transactions", async (HttpRequest req, MyPalDbContext db, int page = 1, int pageSize = 50) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    if (page < 1) page = 1;
    if (pageSize is < 1 or > 100) pageSize = 50;

    var query = db.Transactions.Where(t => t.UserId == user.Id);
    var total = await query.CountAsync();
    var txns = await query
        .OrderByDescending(t => t.CreatedAt)
        .Skip((page - 1) * pageSize)
        .Take(pageSize)
        .Select(t => new
        {
            id         = t.Id,
            type       = t.Type,
            amount     = t.Amount,
            order_id   = t.OrderId,
            created_at = t.CreatedAt,
        })
        .ToListAsync();

    return Results.Ok(new { total, page, pageSize, transactions = txns });
});

app.MapPost("/api/wallet/deposit", async (HttpRequest req, WalletAmountRequest body, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();
    if (body.Amount <= 0) return Results.BadRequest(new { error = "Amount must be greater than zero" });

    user.WalletBalance = (user.WalletBalance ?? 0m) + body.Amount;
    user.UpdatedAt = DateTime.UtcNow;

    // transactions.type CHECK allows only 'Purchase' | 'Refund' | 'Deposit'.
    db.Transactions.Add(new Transaction
    {
        Id        = Guid.NewGuid(),
        UserId    = user.Id,
        Type      = "Deposit",
        Amount    = body.Amount,
        CreatedAt = DateTime.UtcNow,
    });

    await db.SaveChangesAsync();
    return Results.Ok(new { balance = user.WalletBalance });
});

app.MapPost("/api/wallet/withdraw", async (HttpRequest req, WalletAmountRequest body, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();
    if (body.Amount <= 0) return Results.BadRequest(new { error = "Amount must be greater than zero" });

    var balance = user.WalletBalance ?? 0m;
    if (balance < body.Amount) return Results.BadRequest(new { error = "Insufficient funds" });

    user.WalletBalance = balance - body.Amount;
    user.UpdatedAt = DateTime.UtcNow;

    // A withdrawal is recorded as a negative-amount Deposit so it satisfies the
    // transactions.type CHECK ('Purchase' | 'Refund' | 'Deposit') while still
    // showing as an outflow in the ledger.
    db.Transactions.Add(new Transaction
    {
        Id        = Guid.NewGuid(),
        UserId    = user.Id,
        Type      = "Deposit",
        Amount    = -body.Amount,
        CreatedAt = DateTime.UtcNow,
    });

    await db.SaveChangesAsync();
    return Results.Ok(new { balance = user.WalletBalance });
});

// ─── Listings (the authenticated seller's own products) ──────────────────────

app.MapGet("/api/listings", async (HttpRequest req, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    // The products schema has no per-user owner/seller column in this database,
    // so a user's own listings cannot be derived yet. Returns an empty set until
    // product ownership is modelled. (Endpoint exists so the client has a real
    // source instead of mock listings.)
    return Results.Ok(new { listings = Array.Empty<object>() });
});

// ─── Wishlist ────────────────────────────────────────────────────────────────

app.MapGet("/api/wishlist", async (HttpRequest req, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    var items = await db.WishlistItems
        .Where(w => w.UserId == user.Id && w.Product != null && w.Product.IsDeleted != true)
        .OrderByDescending(w => w.CreatedAt)
        .Select(w => new
        {
            id            = w.ProductId,
            name          = w.Product!.Name,
            description   = w.Product.Description,
            category      = w.Product.Category,
            type          = w.Product.Type,
            current_price = w.Product.CurrentPrice,
            stock_qty     = w.Product.StockQty,
            rating        = w.Product.ProductReviews.Where(r => r.Score != null).Average(r => (double?)r.Score) ?? 0,
            review_count  = w.Product.ProductReviews.Count,
            image         = w.Product.ProductMedia.OrderBy(m => m.DisplayOrder).Select(m => m.Url).FirstOrDefault(),
            media         = w.Product.ProductMedia.OrderBy(m => m.DisplayOrder)
                             .Select(m => new { m.Id, m.Url, m.MediaType, display_order = m.DisplayOrder })
                             .ToList(),
            seller        = new { name = "MyPal", is_mypal = true },
            added_at      = w.CreatedAt,
        })
        .ToListAsync();

    return Results.Ok(new { items });
});

app.MapPost("/api/wishlist", async (HttpRequest req, WishlistRequest body, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    var product = await db.Products.FirstOrDefaultAsync(p => p.Id == body.ProductId && p.IsDeleted != true);
    if (product == null) return Results.NotFound(new { error = "Product not found" });

    var exists = await db.WishlistItems.AnyAsync(w => w.UserId == user.Id && w.ProductId == body.ProductId);
    if (!exists)
    {
        db.WishlistItems.Add(new WishlistItem
        {
            Id        = Guid.NewGuid(),
            UserId    = user.Id,
            ProductId = body.ProductId,
            CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    return Results.Ok(new { ok = true });
});

app.MapDelete("/api/wishlist/{productId:guid}", async (Guid productId, HttpRequest req, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();

    var item = await db.WishlistItems.FirstOrDefaultAsync(w => w.UserId == user.Id && w.ProductId == productId);
    if (item != null)
    {
        db.WishlistItems.Remove(item);
        await db.SaveChangesAsync();
    }

    return Results.Ok(new { ok = true });
});

app.Run();

// ─── Helpers ────────────────────────────────────────────────────────────────

static bool CryptographicEquals(string? a, string? b)
{
    if (a is null || b is null) return false;
    var ba = System.Text.Encoding.UTF8.GetBytes(a);
    var bb = System.Text.Encoding.UTF8.GetBytes(b);
    return System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(ba, bb);
}

static void SeedWelcomeWallet(User user, MyPalDbContext db)
{
    // Simulated starting funds. MyPal is a demo marketplace — wallet money is
    // fake but persisted in the DB so deposits/withdrawals/purchases behave for real.
    const decimal welcomeAmount = 1000.00m;
    user.WalletBalance = welcomeAmount;
    db.Transactions.Add(new Transaction
    {
        Id        = Guid.NewGuid(),
        UserId    = user.Id,
        Type      = "Deposit",
        Amount    = welcomeAmount,
        CreatedAt = DateTime.UtcNow,
    });
}

static async Task<User?> ResolveUserAsync(HttpRequest req, MyPalDbContext db)
{
    var rawId = req.Headers["X-User-Id"].FirstOrDefault();
    if (!Guid.TryParse(rawId, out var userId)) return null;
    return await db.Users.FirstOrDefaultAsync(u => u.Id == userId && u.IsDeleted != true);
}

static object ToOrderResponse(Order o) => new
{
    id              = o.Id,
    status          = o.Status?.ToString().ToLowerInvariant(),
    total_amount    = o.TotalAmount,
    payment_method  = o.PaymentMethod?.ToString(),
    wallet_amount_used = o.WalletAmountUsed,
    cod_amount_due  = o.CodAmountDue,
    destination     = new
    {
        google_place_id = o.DestinationGooglePlaceId,
        lat     = o.DestinationLat,
        lng     = o.DestinationLng,
        address = o.DestinationAddress,
    },
    items = o.OrderItems.Select(i => new
    {
        id               = i.Id,
        product_id       = i.ProductId,
        product_name     = i.Product?.Name,
        quantity         = i.Quantity,
        price_at_purchase = i.PriceAtPurchase,
    }),
    created_at = o.CreatedAt,
    updated_at = o.UpdatedAt,
};

static AuthResponse AuthPayload(User user, string accessToken, string refreshToken) =>
    new(ToUserIdentity(user), accessToken, refreshToken, 900);

static UserIdentityResponse ToUserIdentity(User user)
{
    var username = user.Email.Split('@')[0];
    return new UserIdentityResponse(
        user.Id, user.Email, username,
        user.FirstName, user.LastName,
        user.Phone, user.WalletBalance,
        user.IsBuyer, user.IsSeller,
        user.Roles, user.CreatedAt, user.UpdatedAt,
        user.Country, user.State, user.City);
}

static void SetRefreshCookie(HttpContext context, string refreshToken)
{
    context.Response.Cookies.Append("mypal_refresh", refreshToken, RefreshCookieOptions(context, DateTimeOffset.UtcNow.AddDays(3650)));
}

// The SPA (Vercel) talks to the gateway (Render) cross-site, so the refresh cookie
// must be SameSite=None to be sent on cross-origin fetch — otherwise the browser
// drops it on reload and the user is forced to log in again. SameSite=None requires
// Secure, which local HTTP dev can't provide, so fall back to Lax there.
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

public record CreateProductRequest(
    string Name, string? Description, string? Category, string? Type,
    decimal? CurrentPrice, int? StockQty, List<ProductMediaInput>? Media);

public record ProductMediaInput(
    string Url,
    [property: JsonPropertyName("media_type")] string? MediaType,
    [property: JsonPropertyName("display_order")] int? DisplayOrder);

public record UpdateProductRequest(
    string? Name, string? Description, string? Category, string? Type,
    decimal? CurrentPrice, int? StockQty);

public record ProductResponse(
    Guid Id, string Name, string? Description, string? Category, string? Type,
    decimal? CurrentPrice, int? StockQty,
    [property: JsonPropertyName("created_at")] DateTime? CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTime? UpdatedAt);

public record OrderLineItem(Guid ProductId, int Quantity);

public record CreateOrderRequest(
    List<OrderLineItem> Items,
    PaymentMethod? PaymentMethod,
    decimal? WalletAmountUsed,
    decimal? CodAmountDue,
    string? DestinationGooglePlaceId,
    double? DestinationLat,
    double? DestinationLng,
    string? DestinationAddress);

public record AddCartItemRequest(Guid ProductId, int Quantity);

public record WalletAmountRequest(decimal Amount);

public record WishlistRequest(
    [property: JsonPropertyName("product_id")] Guid ProductId);

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
    string? City);

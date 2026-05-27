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

var builder = WebApplication.CreateBuilder(args);
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

// ─── Auth ──────────────────────────────────────────────────────────────────

app.MapPost("/api/auth/signup", async (SignupRequest request, HttpContext context, MyPalDbContext db, IJwtService jwtService) =>
{
    if (string.IsNullOrWhiteSpace(request.Email))
        return Results.BadRequest(new { error = "Email is required" });

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
    var refreshToken = jwtService.GenerateRefreshToken(user);
    SetRefreshCookie(context, refreshToken);

    return Results.Ok(AuthPayload(user, accessToken, refreshToken));
});

app.MapPost("/api/auth/login", async (LoginRequest request, HttpContext context, MyPalDbContext db, IJwtService jwtService) =>
{
    var user = await db.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
    if (user == null) return Results.Unauthorized();

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
        await db.SaveChangesAsync();
    }

    user.UpdatedAt = DateTime.UtcNow;

    var accessToken = jwtService.GenerateAccessToken(user);
    var refreshToken = jwtService.GenerateRefreshToken(user);
    SetRefreshCookie(context, refreshToken);

    var frontendUrl = builder.Configuration["FRONTEND_URL"] ?? "http://localhost:5173";
    return Results.Redirect($"{frontendUrl}/auth/callback?access_token={accessToken}");
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

app.MapPost("/api/auth/logout", (HttpContext context) =>
{
    context.Response.Cookies.Delete("mypal_refresh", new CookieOptions { Path = "/" });
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
    if (body.Phone is not null)                      user.Phone     = body.Phone;
    if (body.LifeTrackStory is not null)             user.LifeTrackStory = body.LifeTrackStory;
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
        .Select(p => new ProductResponse(
            p.Id, p.Name, p.Description, p.Category, p.Type,
            p.CurrentPrice, p.StockQty, p.CreatedAt, p.UpdatedAt))
        .ToListAsync();

    return Results.Ok(new { total, page, pageSize, products = results });
});

app.MapGet("/api/products/{id:guid}", async (Guid id, MyPalDbContext db) =>
{
    var p = await db.Products
        .Include(x => x.ProductMedia)
        .Include(x => x.ProductAttributes)
        .FirstOrDefaultAsync(x => x.Id == id && x.IsDeleted != true);

    if (p == null) return Results.NotFound(new { error = "Product not found" });

    return Results.Ok(new
    {
        id            = p.Id,
        name          = p.Name,
        description   = p.Description,
        category      = p.Category,
        type          = p.Type,
        current_price = p.CurrentPrice,
        stock_qty     = p.StockQty,
        media         = p.ProductMedia.Select(m => new { m.Id, m.Url, m.MediaType }),
        attributes    = p.ProductAttributes.Select(a => new { a.Id, a.Name, a.Value }),
        created_at    = p.CreatedAt,
        updated_at    = p.UpdatedAt,
    });
});

app.MapPost("/api/products", async (HttpRequest req, CreateProductRequest body, MyPalDbContext db) =>
{
    var user = await ResolveUserAsync(req, db);
    if (user == null) return Results.Unauthorized();
    if (!user.IsSeller) return Results.Forbid();

    if (string.IsNullOrWhiteSpace(body.Name))
        return Results.BadRequest(new { error = "Name is required" });

    var product = new Product
    {
        Id           = Guid.NewGuid(),
        Name         = body.Name.Trim(),
        Description  = body.Description,
        Category     = body.Category,
        Type         = body.Type,
        CurrentPrice = body.CurrentPrice,
        StockQty     = body.StockQty ?? 0,
        CreatedAt    = DateTime.UtcNow,
        UpdatedAt    = DateTime.UtcNow,
    };

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
    if (!user.IsSeller) return Results.Forbid();

    var product = await db.Products.FirstOrDefaultAsync(p => p.Id == id && p.IsDeleted != true);
    if (product == null) return Results.NotFound(new { error = "Product not found" });

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
    if (!user.IsSeller) return Results.Forbid();

    var product = await db.Products.FirstOrDefaultAsync(p => p.Id == id && p.IsDeleted != true);
    if (product == null) return Results.NotFound(new { error = "Product not found" });

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

    // Validate products and sum total
    decimal total = 0m;
    var orderItems = new List<OrderItem>();
    foreach (var item in body.Items)
    {
        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == item.ProductId && p.IsDeleted != true);
        if (product == null)
            return Results.BadRequest(new { error = $"Product {item.ProductId} not found" });
        if (item.Quantity <= 0)
            return Results.BadRequest(new { error = "Quantity must be > 0" });

        var price = product.CurrentPrice ?? 0m;
        total += price * item.Quantity;
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

    db.Orders.Add(order);
    db.OrderItems.AddRange(orderItems);
    await db.SaveChangesAsync();

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

app.Run();

// ─── Helpers ────────────────────────────────────────────────────────────────

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
        user.Roles, user.CreatedAt, user.UpdatedAt);
}

static void SetRefreshCookie(HttpContext context, string refreshToken)
{
    context.Response.Cookies.Append("mypal_refresh", refreshToken, new CookieOptions
    {
        HttpOnly = true,
        Secure   = context.Request.IsHttps,
        SameSite = SameSiteMode.Lax,
        Expires  = DateTimeOffset.UtcNow.AddDays(30),
        Path     = "/",
    });
}

// ─── Request / Response records ─────────────────────────────────────────────

public record LoginRequest(string Email, string? Password);
public record SignupRequest(string Email, string Password, string? Name);
public record RefreshRequest(string? RefreshToken);

public record UpdateProfileRequest(
    string? FirstName, string? LastName,
    string? Phone, string? LifeTrackStory);

public record UpdateLocationRequest(
    string? GooglePlaceId, double? Lat, double? Lng,
    string? City, string? State);

public record CreateProductRequest(
    string Name, string? Description, string? Category, string? Type,
    decimal? CurrentPrice, int? StockQty);

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
    [property: JsonPropertyName("updated_at")] DateTime? UpdatedAt);

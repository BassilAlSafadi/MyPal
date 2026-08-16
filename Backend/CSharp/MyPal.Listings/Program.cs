using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using MyPal.Listings.Data;
using MyPal.Listings.Data.Entities;
using MyPal.Listings.Search;
using MyPal.ServiceDefaults;

// MyPal Listings service — the product catalogue, on mypal_listings.
//
// Split out of the former MyPal.API monolith, and it also absorbed the semantic
// search that used to be orchestrated by the Go gateway (the gateway ran the
// pgvector query against the products tables, which are listings-owned).
//
// The endpoint bodies are the monolith's, unchanged. What changed around them:
//   - routes are published on their public /api/v1/... paths, the gateway that
//     translated /api/v1/* to /api/* being gone;
//   - `user.IsSeller = true` on first listing is now a call to the Auth service,
//     because users lives in mypal_auth;
//   - product reads are cached in Redis on the shared 5 hour policy.

var builder = ServiceHost.CreateBuilder(args, "listings", defaultPort: 5002);

var connectionString = ServiceHost.ResolveConnectionString(builder.Configuration, "LISTINGS", "mypal_listings");

builder.Services.AddDbContext<ListingsDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddIdentityClient();
builder.Services.AddHttpClient<SemanticSearch>((sp, http) => { })
    .AddTypedClient((http, sp) => new SemanticSearch(
        http,
        sp.GetRequiredService<IConfiguration>(),
        sp.GetRequiredService<ILogger<SemanticSearch>>(),
        connectionString));

var app = builder.Build();

app.UseForwardedHeaders();
app.UseSwagger();
app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "MyPal Listings v1"));
app.UseServiceCors(builder.Configuration);
// Service-to-service routes authenticate with the shared internal token, not a
// user's access token, so they run ahead of — and are exempt from — JWT validation.
app.UseInternalAuth();
app.UseJwtValidation(builder.Configuration, path =>
    ServiceHost.IsCommonAnonymousPath(path) || path.StartsWithSegments("/internal"));

app.MapGet("/", async (ListingsDbContext db) =>
{
    var dbOk = false;
    var dbError = "";
    try { dbOk = await db.Database.CanConnectAsync(); }
    catch (Exception ex) { dbError = ex.Message.Split('\n')[0]; }

    return Results.Json(new
    {
        service   = "MyPal Listings service",
        status    = dbOk ? "ok" : "degraded",
        version   = "1.0.0",
        database  = "mypal_listings",
        postgres  = new { configured = !string.IsNullOrEmpty(connectionString), connected = dbOk, error = dbError.Length > 0 ? dbError : null },
        endpoints = new[]
        {
            "GET  /api/v1/products", "GET /api/v1/products/{id}", "POST /api/v1/products",
            "PUT  /api/v1/products/{id}", "DELETE /api/v1/products/{id}",
            "GET  /api/v1/listings",
            "GET  /api/v1/wishlist", "POST /api/v1/wishlist", "DELETE /api/v1/wishlist/{productId}",
            "GET  /api/v1/search", "POST /api/v1/search",
        }
    });
});

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "listings" }));

// ─── Products ──────────────────────────────────────────────────────────────

app.MapGet("/api/v1/products", async (ListingsDbContext db, IServiceCache cache, int page = 1, int pageSize = 20, string? category = null, string? type = null) =>
{
    if (page < 1) page = 1;
    if (pageSize is < 1 or > 100) pageSize = 20;

    // The catalogue is read far more than it is written, so it is served through
    // the 5 hour Redis cache; every product mutation below invalidates the list.
    var payload = await cache.GetOrSetAsync($"products:{page}:{pageSize}:{category}:{type}", async () =>
    {
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
            .Select(p => new ProductListItem(
                p.Id,
                p.Name,
                p.Description,
                p.Category,
                p.Type,
                p.CurrentPrice,
                p.StockQty,
                p.ProductReviews.Where(r => r.Score != null).Average(r => (double?)r.Score) ?? 0,
                p.ProductReviews.Count,
                p.ProductMedia.OrderBy(m => m.DisplayOrder).Select(m => m.Url).FirstOrDefault(),
                p.ProductMedia.OrderBy(m => m.DisplayOrder)
                    .Select(m => new MediaItem(m.Id, m.Url, m.MediaType, m.DisplayOrder))
                    .ToList(),
                // No vendor/seller table is populated in this DB; the catalog is MyPal-resident inventory.
                new SellerStub("MyPal", true),
                p.CreatedAt,
                p.UpdatedAt))
            .ToListAsync();

        return new ProductListResponse(total, page, pageSize, results);
    });

    return Results.Ok(payload);
});

app.MapGet("/api/v1/products/{id:guid}", async (Guid id, ListingsDbContext db) =>
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
        // No vendor/seller table is populated in this DB; the catalog is MyPal-resident inventory.
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

app.MapPost("/api/v1/products", async (HttpRequest req, CreateProductRequest body, ListingsDbContext db, IIdentityClient identity, IServiceCache cache) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    if (string.IsNullOrWhiteSpace(body.Name))
        return Results.BadRequest(new { error = "Name is required" });
    if (body.CurrentPrice is null or <= 0)
        return Results.BadRequest(new { error = "A price greater than 0 is required" });

    var media = (body.Media ?? new List<ProductMediaInput>())
        .Where(m => !string.IsNullOrWhiteSpace(m.Url))
        .ToList();
    if (media.Count == 0)
        return Results.BadRequest(new { error = "At least one product photo is required" });

    // Listing a product makes the user a seller. The users table is owned by the
    // Auth service now, so the flag is set there rather than on a local entity.
    if (!caller.IsSeller)
        await identity.PromoteToSellerAsync(req.BearerToken(), caller.UserId);

    var product = new Product
    {
        Id           = Guid.NewGuid(),
        Name         = body.Name.Trim(),
        Description  = body.Description,
        Category     = body.Category,
        Type         = body.Type,
        CurrentPrice = body.CurrentPrice,
        StockQty     = body.StockQty ?? 1,
        CreatedBy    = caller.UserId,
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
    await InvalidateCatalogue(cache);

    return Results.Created($"/api/v1/products/{product.Id}",
        new ProductResponse(product.Id, product.Name, product.Description,
            product.Category, product.Type, product.CurrentPrice,
            product.StockQty, product.CreatedAt, product.UpdatedAt));
});

app.MapPut("/api/v1/products/{id:guid}", async (Guid id, HttpRequest req, UpdateProductRequest body, ListingsDbContext db, IServiceCache cache) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();
    // Return a real 403 JSON, not Results.Forbid() — the latter triggers the cookie
    // auth handler's 302 redirect to /Account/AccessDenied, which is wrong for an API.
    if (!caller.IsSeller) return Results.Json(new { error = "Only sellers can edit listings" }, statusCode: StatusCodes.Status403Forbidden);

    var product = await db.Products.FirstOrDefaultAsync(p => p.Id == id && p.IsDeleted != true);
    if (product == null) return Results.NotFound(new { error = "Product not found" });

    // Ownership: a seller may only edit their own listings. Legacy/seeded catalog
    // rows (CreatedBy == null) are not owned by any seller and cannot be edited.
    if (product.CreatedBy != caller.UserId)
        return Results.Json(new { error = "You can only edit your own listings" }, statusCode: StatusCodes.Status403Forbidden);

    if (body.Name is not null)         product.Name         = body.Name.Trim();
    if (body.Description is not null)  product.Description  = body.Description;
    if (body.Category is not null)     product.Category     = body.Category;
    if (body.Type is not null)         product.Type         = body.Type;
    if (body.CurrentPrice.HasValue)    product.CurrentPrice = body.CurrentPrice;
    if (body.StockQty.HasValue)        product.StockQty     = body.StockQty;
    product.UpdatedAt = DateTime.UtcNow;

    await db.SaveChangesAsync();
    await InvalidateCatalogue(cache);

    return Results.Ok(new ProductResponse(product.Id, product.Name, product.Description,
        product.Category, product.Type, product.CurrentPrice,
        product.StockQty, product.CreatedAt, product.UpdatedAt));
});

app.MapDelete("/api/v1/products/{id:guid}", async (Guid id, HttpRequest req, ListingsDbContext db, IServiceCache cache) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();
    if (!caller.IsSeller) return Results.Json(new { error = "Only sellers can delete listings" }, statusCode: StatusCodes.Status403Forbidden);

    var product = await db.Products.FirstOrDefaultAsync(p => p.Id == id && p.IsDeleted != true);
    if (product == null) return Results.NotFound(new { error = "Product not found" });

    // Ownership: a seller may only delete their own listings.
    if (product.CreatedBy != caller.UserId)
        return Results.Json(new { error = "You can only delete your own listings" }, statusCode: StatusCodes.Status403Forbidden);

    product.IsDeleted = true;
    product.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    await InvalidateCatalogue(cache);

    return Results.Ok(new { ok = true });
});

// Bulk price/stock lookup used by the Orders service when it prices a new order.
// Orders can no longer join to products across the database boundary, so it asks
// this service for the authoritative rows instead.
app.MapPost("/internal/products/resolve", async (ResolveProductsRequest body, ListingsDbContext db) =>
{
    var ids = body.ProductIds ?? [];
    var products = await db.Products
        .Where(p => ids.Contains(p.Id) && p.IsDeleted != true)
        .Select(p => new ResolvedProduct(p.Id, p.Name, p.CurrentPrice, p.StockQty))
        .ToListAsync();

    return Results.Ok(new { products });
});

// Applies the stock decrements an order commits. Called by Orders after it has
// persisted the order; the products table lives here.
app.MapPost("/internal/products/decrement-stock", async (DecrementStockRequest body, ListingsDbContext db, IServiceCache cache) =>
{
    foreach (var line in body.Items ?? [])
    {
        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == line.ProductId && p.IsDeleted != true);
        // Enforce stock when the product tracks it (null = untracked/unlimited).
        if (product?.StockQty is null) continue;

        product.StockQty = Math.Max(0, product.StockQty.Value - line.Quantity);
        product.UpdatedAt = DateTime.UtcNow;
    }

    await db.SaveChangesAsync();
    await InvalidateCatalogue(cache);
    return Results.Ok(new { ok = true });
});

// ─── Internal reads for the AI service ───────────────────────────────────────
//
// The Node orchestrator queried public.products, public.product_media,
// public.wishlist_items and public.seller_performance_summaries with its own
// Postgres pool. Those tables are listings-owned and the AI service is on
// MongoDB now, so it reads them through these endpoints instead.

app.MapGet("/internal/catalog", async (ListingsDbContext db, IServiceCache cache, int limit = 60) =>
{
    if (limit is < 1 or > 200) limit = 60;

    var products = await cache.GetOrSetAsync($"internal-catalog:{limit}", async () =>
        await db.Products
            .Where(p => p.IsDeleted != true)
            .OrderByDescending(p => p.CreatedAt)
            .Take(limit)
            .Select(p => new CatalogRow(
                p.Id,
                p.Name,
                p.Category,
                p.CurrentPrice ?? 0m,
                p.ProductMedia.OrderBy(m => m.DisplayOrder).ThenBy(m => m.CreatedAt).Select(m => m.Url).FirstOrDefault()))
            .ToListAsync());

    return Results.Ok(new { products });
});

app.MapGet("/internal/users/{userId:guid}/wishlist", async (Guid userId, ListingsDbContext db) =>
{
    var items = await db.WishlistItems
        .Where(w => w.UserId == userId && w.Product != null && w.Product.IsDeleted != true)
        .Take(10)
        .Select(w => new { name = w.Product!.Name, category = w.Product.Category })
        .ToListAsync();

    return Results.Ok(new { items });
});

app.MapGet("/internal/sellers/{sellerId:guid}/report", async (Guid sellerId, ListingsDbContext db) =>
{
    var row = await db.SellerPerformanceSummaries
        .Where(s => s.SellerId == sellerId)
        .OrderByDescending(s => s.CreatedAt)
        .FirstOrDefaultAsync();

    if (row == null) return Results.NotFound(new { error = "not found" });

    string[] themes = [];
    if (!string.IsNullOrWhiteSpace(row.TopComplaintThemes))
    {
        try { themes = System.Text.Json.JsonSerializer.Deserialize<string[]>(row.TopComplaintThemes) ?? []; }
        catch (System.Text.Json.JsonException) { themes = []; }
    }

    return Results.Ok(new
    {
        id                 = row.Id,
        sellerId           = row.SellerId,
        aiGeneratedSummary = row.AiGeneratedSummary,
        topComplaintThemes = themes,
        sentimentScore     = row.SentimentScore,
        grandmaScore       = row.GrandmaScore,
        createdAt          = row.CreatedAt,
    });
});

app.MapPost("/internal/sellers/report", async (SellerReportRequest body, ListingsDbContext db) =>
{
    var row = new SellerPerformanceSummary
    {
        Id                 = Guid.NewGuid(),
        SellerId           = body.SellerId,
        AiGeneratedSummary = body.AiGeneratedSummary,
        TopComplaintThemes = body.TopComplaintThemes is null
            ? null
            : System.Text.Json.JsonSerializer.Serialize(body.TopComplaintThemes),
        SentimentScore     = body.SentimentScore,
        GrandmaScore       = body.GrandmaScore,
        CreatedAt          = DateTimeOffset.UtcNow,
    };

    db.SellerPerformanceSummaries.Add(row);
    await db.SaveChangesAsync();

    return Results.Ok(new { id = row.Id, created_at = row.CreatedAt });
});

// ─── Listings (the authenticated seller's own products) ──────────────────────

app.MapGet("/api/v1/listings", async (HttpRequest req, ListingsDbContext db) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    // products.created_by records the listing owner, so a seller's own listings
    // are derivable here. (Before the split this endpoint returned an empty set
    // because it predated the created_by column.)
    var listings = await db.Products
        .Where(p => p.CreatedBy == caller.UserId && p.IsDeleted != true)
        .OrderByDescending(p => p.CreatedAt)
        .Select(p => new
        {
            id            = p.Id,
            name          = p.Name,
            description   = p.Description,
            category      = p.Category,
            type          = p.Type,
            current_price = p.CurrentPrice,
            stock_qty     = p.StockQty,
            image         = p.ProductMedia.OrderBy(m => m.DisplayOrder).Select(m => m.Url).FirstOrDefault(),
            created_at    = p.CreatedAt,
            updated_at    = p.UpdatedAt,
        })
        .ToListAsync();

    return Results.Ok(new { listings });
});

// ─── Wishlist ────────────────────────────────────────────────────────────────

app.MapGet("/api/v1/wishlist", async (HttpRequest req, ListingsDbContext db) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    var items = await db.WishlistItems
        .Where(w => w.UserId == caller.UserId && w.Product != null && w.Product.IsDeleted != true)
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

app.MapPost("/api/v1/wishlist", async (HttpRequest req, WishlistRequest body, ListingsDbContext db) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    var product = await db.Products.FirstOrDefaultAsync(p => p.Id == body.ProductId && p.IsDeleted != true);
    if (product == null) return Results.NotFound(new { error = "Product not found" });

    var exists = await db.WishlistItems.AnyAsync(w => w.UserId == caller.UserId && w.ProductId == body.ProductId);
    if (!exists)
    {
        db.WishlistItems.Add(new WishlistItem
        {
            Id        = Guid.NewGuid(),
            UserId    = caller.UserId,
            ProductId = body.ProductId,
            CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    return Results.Ok(new { ok = true });
});

app.MapDelete("/api/v1/wishlist/{productId:guid}", async (Guid productId, HttpRequest req, ListingsDbContext db) =>
{
    var caller = req.Identity();
    if (caller == null) return Results.Unauthorized();

    var item = await db.WishlistItems.FirstOrDefaultAsync(w => w.UserId == caller.UserId && w.ProductId == productId);
    if (item != null)
    {
        db.WishlistItems.Remove(item);
        await db.SaveChangesAsync();
    }

    return Results.Ok(new { ok = true });
});

// ─── Semantic search ─────────────────────────────────────────────────────────

app.MapGet("/api/v1/search", async (HttpRequest req, SemanticSearch search, CancellationToken ct) =>
{
    var q = req.Query["q"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(q))
        return Results.BadRequest(new { error = "'q' parameter is required" });
    if (!SsqlSanitizer.IsQuerySafe(q))
        return Results.Json(new { error = "query rejected by SSQL validation" }, statusCode: StatusCodes.Status403Forbidden);

    int.TryParse(req.Query["limit"].FirstOrDefault(), out var limit);
    return Results.Ok(await search.ExecuteAsync(q, limit, ct));
});

app.MapPost("/api/v1/search", async (SemanticSearch.SearchRequest body, SemanticSearch search, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(body.Query))
        return Results.BadRequest(new { error = "'q' parameter is required" });
    if (!SsqlSanitizer.IsQuerySafe(body.Query))
        return Results.Json(new { error = "query rejected by SSQL validation" }, statusCode: StatusCodes.Status403Forbidden);

    return Results.Ok(await search.ExecuteAsync(body.Query, body.Limit, ct));
});

app.Run();

// ─── Helpers ────────────────────────────────────────────────────────────────

// The catalogue list is cached per (page, pageSize, category, type). Rather than
// track every permutation, a write bumps a generation marker by clearing the keys
// this process knows about and letting the 5 hour TTL retire the rest.
static Task InvalidateCatalogue(IServiceCache cache)
{
    var keys = new List<string>();
    foreach (var page in Enumerable.Range(1, 5))
        foreach (var size in new[] { 20, 50, 100 })
            keys.Add($"products:{page}:{size}::");
    return cache.InvalidateAsync([.. keys]);
}

// ─── Request / Response records ─────────────────────────────────────────────

public record ProductListResponse(int Total, int Page, int PageSize, List<ProductListItem> Products);

public record ProductListItem(
    Guid Id,
    string Name,
    string? Description,
    string? Category,
    string? Type,
    [property: JsonPropertyName("current_price")] decimal? CurrentPrice,
    [property: JsonPropertyName("stock_qty")] int? StockQty,
    double Rating,
    [property: JsonPropertyName("review_count")] int ReviewCount,
    string? Image,
    List<MediaItem> Media,
    SellerStub Seller,
    [property: JsonPropertyName("created_at")] DateTime? CreatedAt,
    [property: JsonPropertyName("updated_at")] DateTime? UpdatedAt);

public record MediaItem(
    Guid Id,
    string Url,
    [property: JsonPropertyName("media_type")] string? MediaType,
    [property: JsonPropertyName("display_order")] int DisplayOrder);

public record SellerStub(string Name, [property: JsonPropertyName("is_mypal")] bool IsMyPal);

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

public record WishlistRequest(
    [property: JsonPropertyName("product_id")] Guid ProductId);

public record CatalogRow(
    Guid Id,
    string Name,
    string? Category,
    [property: JsonPropertyName("current_price")] decimal CurrentPrice,
    string? Image);

public record SellerReportRequest(
    [property: JsonPropertyName("seller_id")] Guid SellerId,
    [property: JsonPropertyName("ai_generated_summary")] string? AiGeneratedSummary,
    [property: JsonPropertyName("top_complaint_themes")] string[]? TopComplaintThemes,
    [property: JsonPropertyName("sentiment_score")] decimal? SentimentScore,
    [property: JsonPropertyName("grandma_score")] int? GrandmaScore);

public record ResolveProductsRequest(
    [property: JsonPropertyName("product_ids")] List<Guid>? ProductIds);

public record ResolvedProduct(
    Guid Id,
    string Name,
    [property: JsonPropertyName("current_price")] decimal? CurrentPrice,
    [property: JsonPropertyName("stock_qty")] int? StockQty);

public record DecrementStockRequest(List<StockLine>? Items);

public record StockLine(
    [property: JsonPropertyName("product_id")] Guid ProductId,
    int Quantity);

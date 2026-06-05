// gRPC service implementations for the MyPal C# Main API.
//
// Each service delegates to the existing HTTP endpoints via an internal
// HttpClient (same process, localhost).  This is intentional — it keeps all
// business logic in one place (the minimal-API handlers) and lets the gRPC
// layer be a thin, correct translation layer during the migration.
//
// Request envelope fields read here:
//   body           – HTTP request body as a JSON object (Struct)
//   query          – URL query params (Struct of strings)
//   params         – URL path params (Struct of strings)
//   user_id        – X-User-Id header to forward
//   user_email     – X-User-Email header
//   user_roles     – X-User-Roles header
//   internal_token – forwarded as X-Internal-Token
//
// Response envelope written:
//   status    – HTTP status code
//   body      – response JSON as a Struct
//   set_cookie – list of Set-Cookie header strings

using System.Text;
using Google.Protobuf.WellKnownTypes;
using Grpc.Core;
using MyPal.API.GrpcServices.Proto;

namespace MyPal.API.GrpcServices;

// ─── Shared base ─────────────────────────────────────────────────────────────

public abstract class MyPalGrpcBase
{
    private readonly IHttpClientFactory _factory;
    protected readonly string _baseUrl;

    protected MyPalGrpcBase(IHttpClientFactory factory, IConfiguration cfg)
    {
        _factory = factory;
        var port = cfg["PORT"] ?? Environment.GetEnvironmentVariable("PORT") ?? "5000";
        _baseUrl = $"http://localhost:{port}";
    }

    // Forward to the internal HTTP API and return a response envelope Struct.
    protected async Task<Struct> ForwardAsync(
        string method,
        string path,
        Struct envelope,
        ServerCallContext ctx,
        Dictionary<string, string>? extraQuery = null)
    {
        var userId        = GetStr(envelope, "user_id");
        var userEmail     = GetStr(envelope, "user_email");
        var userRoles     = GetStr(envelope, "user_roles");
        var internalToken = GetStr(envelope, "internal_token");
        var queryFields   = GetStruct(envelope, "query");
        var bodyStruct    = GetStruct(envelope, "body");

        // Build query string from envelope query fields + any extras.
        var qp = new Dictionary<string, string>();
        if (queryFields != null)
        {
            foreach (var (k, v) in queryFields.Fields)
            {
                var sv = v.KindCase == Value.KindOneofCase.StringValue ? v.StringValue
                       : v.KindCase == Value.KindOneofCase.NumberValue ? v.NumberValue.ToString()
                       : null;
                if (sv != null) qp[k] = sv;
            }
        }
        if (extraQuery != null)
            foreach (var (k, v) in extraQuery) qp[k] = v;

        var url = _baseUrl + path;
        if (qp.Count > 0)
            url += "?" + string.Join("&", qp.Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value)}"));

        var req = new HttpRequestMessage(new HttpMethod(method), url);

        // Inject identity and internal auth.
        if (!string.IsNullOrEmpty(internalToken)) req.Headers.TryAddWithoutValidation("X-Internal-Token", internalToken);
        if (!string.IsNullOrEmpty(userId))        req.Headers.TryAddWithoutValidation("X-User-Id",        userId);
        if (!string.IsNullOrEmpty(userEmail))     req.Headers.TryAddWithoutValidation("X-User-Email",     userEmail);
        if (!string.IsNullOrEmpty(userRoles))     req.Headers.TryAddWithoutValidation("X-User-Roles",     userRoles);
        // Forward the original Cookie header so httpOnly cookie fallbacks work
        // (e.g. mypal_refresh read by the /refresh and /bootstrap-session endpoints).
        var cookie = GetStr(envelope, "cookie");
        if (!string.IsNullOrEmpty(cookie))        req.Headers.TryAddWithoutValidation("Cookie", cookie);

        // Serialize body for mutating verbs.
        if ((method == "POST" || method == "PUT" || method == "PATCH") && bodyStruct != null)
        {
            var bodyJson = JsonFormatter.Default.Format(bodyStruct);
            req.Content = new StringContent(bodyJson, Encoding.UTF8, "application/json");
        }

        var client = _factory.CreateClient("grpc-internal");
        var resp   = await client.SendAsync(req, ctx.CancellationToken);
        var raw    = await resp.Content.ReadAsStringAsync(ctx.CancellationToken);

        // Parse response body to Struct.
        Struct respBody;
        if (string.IsNullOrWhiteSpace(raw))
        {
            respBody = new Struct();
        }
        else if (raw.TrimStart().StartsWith('['))
        {
            // Arrays can't parse directly as Struct — wrap in an "items" key.
            respBody = JsonParser.Default.Parse<Struct>($"{{\"items\":{raw}}}");
        }
        else
        {
            try { respBody = JsonParser.Default.Parse<Struct>(raw); }
            catch { respBody = new Struct { Fields = { ["raw"] = Value.ForString(raw) } }; }
        }

        var result = new Struct
        {
            Fields =
            {
                ["status"] = Value.ForNumber((double)resp.StatusCode),
                ["body"]   = Value.ForStruct(respBody),
            }
        };

        // Forward Set-Cookie headers so the gateway can relay them to the browser.
        if (resp.Headers.TryGetValues("Set-Cookie", out var cookies))
        {
            var list = new ListValue();
            foreach (var c in cookies) list.Values.Add(Value.ForString(c));
            result.Fields["set_cookie"] = Value.ForList(list.Values.ToArray());
        }

        return result;
    }

    // Helper: read a path param key from the "params" sub-struct.
    protected string GetParam(Struct env, string key) =>
        GetStruct(env, "params")?.Fields.GetValueOrDefault(key)?.StringValue ?? "";

    protected static string  GetStr(Struct s, string key) =>
        s.Fields.GetValueOrDefault(key)?.StringValue ?? "";

    protected static Struct? GetStruct(Struct s, string key) =>
        s.Fields.GetValueOrDefault(key)?.StructValue;
}

// ─── AuthService ─────────────────────────────────────────────────────────────

public class AuthGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : AuthService.AuthServiceBase
{
    private readonly MyPalGrpcBase _base = new AuthGrpcBase(f, cfg);

    public override Task<Struct> Login(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("POST", "/api/auth/login", req, ctx);

    public override Task<Struct> Signup(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("POST", "/api/auth/signup", req, ctx);

    public override Task<Struct> Refresh(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("POST", "/api/auth/refresh", req, ctx);

    public override Task<Struct> Logout(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("POST", "/api/auth/logout", req, ctx);

    public override Task<Struct> BootstrapSession(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("POST", "/api/auth/bootstrap-session", req, ctx);

    // Thin sub-class to inherit the protected helpers.
    private sealed class AuthGrpcBase(IHttpClientFactory f, IConfiguration cfg) : MyPalGrpcBase(f, cfg);
}

// ─── UserService ─────────────────────────────────────────────────────────────

public class UserGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : UserService.UserServiceBase
{
    private readonly MyPalGrpcBase _base = new UserGrpcBase(f, cfg);

    public override Task<Struct> GetMe(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("GET", "/api/users/me", req, ctx);

    public override Task<Struct> UpdateMe(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("PUT", "/api/users/me", req, ctx);

    public override Task<Struct> UpdateLocation(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("PATCH", "/api/users/me/location", req, ctx);

    private sealed class UserGrpcBase(IHttpClientFactory f, IConfiguration cfg) : MyPalGrpcBase(f, cfg);
}

// ─── ProductService ──────────────────────────────────────────────────────────

public class ProductGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : ProductService.ProductServiceBase
{
    private readonly ProductGrpcBase _base = new(f, cfg);

    public override Task<Struct> ListProducts(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("GET", "/api/products", req, ctx);

    public override Task<Struct> GetProduct(Struct req, ServerCallContext ctx)
    {
        var id = _base.GetParam(req, "id");
        return _base.ForwardAsync("GET", $"/api/products/{id}", req, ctx);
    }

    public override Task<Struct> CreateProduct(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("POST", "/api/products", req, ctx);

    public override Task<Struct> UpdateProduct(Struct req, ServerCallContext ctx)
    {
        var id = _base.GetParam(req, "id");
        return _base.ForwardAsync("PUT", $"/api/products/{id}", req, ctx);
    }

    public override Task<Struct> DeleteProduct(Struct req, ServerCallContext ctx)
    {
        var id = _base.GetParam(req, "id");
        return _base.ForwardAsync("DELETE", $"/api/products/{id}", req, ctx);
    }

    private sealed class ProductGrpcBase(IHttpClientFactory f, IConfiguration cfg) : MyPalGrpcBase(f, cfg);
}

// ─── OrderService ────────────────────────────────────────────────────────────

public class OrderGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : OrderService.OrderServiceBase
{
    private readonly OrderGrpcBase _base = new(f, cfg);

    public override Task<Struct> ListOrders(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("GET", "/api/orders", req, ctx);

    public override Task<Struct> GetOrder(Struct req, ServerCallContext ctx)
    {
        var id = _base.GetParam(req, "id");
        return _base.ForwardAsync("GET", $"/api/orders/{id}", req, ctx);
    }

    public override Task<Struct> CreateOrder(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("POST", "/api/orders", req, ctx);

    private sealed class OrderGrpcBase(IHttpClientFactory f, IConfiguration cfg) : MyPalGrpcBase(f, cfg);
}

// ─── CartService ─────────────────────────────────────────────────────────────

public class CartGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : CartService.CartServiceBase
{
    private readonly CartGrpcBase _base = new(f, cfg);

    public override Task<Struct> GetCart(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("GET", "/api/cart", req, ctx);

    public override Task<Struct> AddItem(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("POST", "/api/cart/items", req, ctx);

    public override Task<Struct> RemoveItem(Struct req, ServerCallContext ctx)
    {
        var id = _base.GetParam(req, "productId");
        return _base.ForwardAsync("DELETE", $"/api/cart/items/{id}", req, ctx);
    }

    private sealed class CartGrpcBase(IHttpClientFactory f, IConfiguration cfg) : MyPalGrpcBase(f, cfg);
}

// ─── WalletService ───────────────────────────────────────────────────────────

public class WalletGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : WalletService.WalletServiceBase
{
    private readonly WalletGrpcBase _base = new(f, cfg);

    public override Task<Struct> GetWallet(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("GET", "/api/wallet", req, ctx);

    public override Task<Struct> ListTransactions(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("GET", "/api/wallet/transactions", req, ctx);

    public override Task<Struct> Deposit(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("POST", "/api/wallet/deposit", req, ctx);

    public override Task<Struct> Withdraw(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("POST", "/api/wallet/withdraw", req, ctx);

    private sealed class WalletGrpcBase(IHttpClientFactory f, IConfiguration cfg) : MyPalGrpcBase(f, cfg);
}

// ─── WishlistService ─────────────────────────────────────────────────────────

public class WishlistGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : WishlistService.WishlistServiceBase
{
    private readonly WishlistGrpcBase _base = new(f, cfg);

    public override Task<Struct> GetWishlist(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("GET", "/api/wishlist", req, ctx);

    public override Task<Struct> AddItem(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("POST", "/api/wishlist", req, ctx);

    public override Task<Struct> RemoveItem(Struct req, ServerCallContext ctx)
    {
        var id = _base.GetParam(req, "productId");
        return _base.ForwardAsync("DELETE", $"/api/wishlist/{id}", req, ctx);
    }

    private sealed class WishlistGrpcBase(IHttpClientFactory f, IConfiguration cfg) : MyPalGrpcBase(f, cfg);
}

// ─── NotificationService ─────────────────────────────────────────────────────

public class NotificationGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : NotificationService.NotificationServiceBase
{
    private readonly NotifGrpcBase _base = new(f, cfg);

    public override Task<Struct> GetNotifications(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("GET", "/api/notifications", req, ctx);

    public override Task<Struct> MarkRead(Struct req, ServerCallContext ctx)
    {
        var id = _base.GetParam(req, "id");
        return _base.ForwardAsync("PATCH", $"/api/notifications/{id}/read", req, ctx);
    }

    private sealed class NotifGrpcBase(IHttpClientFactory f, IConfiguration cfg) : MyPalGrpcBase(f, cfg);
}

// ─── ListingService ──────────────────────────────────────────────────────────

public class ListingGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : ListingService.ListingServiceBase
{
    private readonly ListingGrpcBase _base = new(f, cfg);

    public override Task<Struct> GetListings(Struct req, ServerCallContext ctx)
        => _base.ForwardAsync("GET", "/api/listings", req, ctx);

    private sealed class ListingGrpcBase(IHttpClientFactory f, IConfiguration cfg) : MyPalGrpcBase(f, cfg);
}

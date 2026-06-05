// gRPC service implementations for the MyPal C# Main API.
// Each service self-calls the existing HTTP handlers via an internal HttpClient
// (same Kestrel process, localhost) so all business logic stays in one place.
using System.Net.Http.Headers;
using System.Text;
using Google.Protobuf;
using Google.Protobuf.WellKnownTypes;
using Grpc.Core;
using MyPal.API.GrpcServices.Proto;

namespace MyPal.API.GrpcServices;

// ─── Shared forwarder ─────────────────────────────────────────────────────────

/// <summary>
/// Translates a gRPC Struct envelope into an internal HTTP self-call and
/// returns the HTTP response as a Struct envelope.
/// </summary>
public sealed class GrpcForwarder
{
    private readonly IHttpClientFactory _factory;
    private readonly string _baseUrl;

    public GrpcForwarder(IHttpClientFactory factory, IConfiguration cfg)
    {
        _factory = factory;
        var port = cfg["PORT"] ?? Environment.GetEnvironmentVariable("PORT") ?? "5000";
        _baseUrl = $"http://localhost:{port}";
    }

    // ── Envelope helpers ──────────────────────────────────────────────────────

    public static string  Field(Struct env, string key) =>
        env.Fields.GetValueOrDefault(key)?.StringValue ?? "";

    public static Struct? Body(Struct env) =>
        env.Fields.GetValueOrDefault("body")?.StructValue;

    public static string Param(Struct env, string key) =>
        env.Fields.GetValueOrDefault("params")?.StructValue?
           .Fields.GetValueOrDefault(key)?.StringValue ?? "";

    private static Dictionary<string, string> QueryFields(Struct env)
    {
        var result = new Dictionary<string, string>();
        var q = env.Fields.GetValueOrDefault("query")?.StructValue;
        if (q == null) return result;
        foreach (var (k, v) in q.Fields)
        {
            var sv = v.KindCase switch
            {
                Value.KindOneofCase.StringValue => v.StringValue,
                Value.KindOneofCase.NumberValue => v.NumberValue.ToString(),
                _ => null
            };
            if (sv != null) result[k] = sv;
        }
        return result;
    }

    // ── Core forward ─────────────────────────────────────────────────────────

    public async Task<Struct> ForwardAsync(
        string httpMethod,
        string path,
        Struct envelope,
        ServerCallContext ctx)
    {
        var userId        = Field(envelope, "user_id");
        var userEmail     = Field(envelope, "user_email");
        var userRoles     = Field(envelope, "user_roles");
        var internalToken = Field(envelope, "internal_token");
        var cookie        = Field(envelope, "cookie");
        var query         = QueryFields(envelope);
        var bodyStruct    = Body(envelope);

        // Build URL + query string
        var url = _baseUrl + path;
        if (query.Count > 0)
            url += "?" + string.Join("&",
                query.Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value)}"));

        var req = new HttpRequestMessage(new HttpMethod(httpMethod), url);

        if (!string.IsNullOrEmpty(internalToken))
            req.Headers.TryAddWithoutValidation("X-Internal-Token", internalToken);
        if (!string.IsNullOrEmpty(userId))
            req.Headers.TryAddWithoutValidation("X-User-Id", userId);
        if (!string.IsNullOrEmpty(userEmail))
            req.Headers.TryAddWithoutValidation("X-User-Email", userEmail);
        if (!string.IsNullOrEmpty(userRoles))
            req.Headers.TryAddWithoutValidation("X-User-Roles", userRoles);
        if (!string.IsNullOrEmpty(cookie))
            req.Headers.TryAddWithoutValidation("Cookie", cookie);

        if ((httpMethod == "POST" || httpMethod == "PUT" || httpMethod == "PATCH")
            && bodyStruct != null)
        {
            var bodyJson = JsonFormatter.Default.Format(bodyStruct);
            req.Content = new StringContent(bodyJson, Encoding.UTF8,
                MediaTypeHeaderValue.Parse("application/json"));
        }

        var client = _factory.CreateClient("grpc-internal");
        var resp   = await client.SendAsync(req, ctx.CancellationToken);
        var raw    = await resp.Content.ReadAsStringAsync(ctx.CancellationToken);

        // Parse response body to Struct
        Struct respBody;
        if (string.IsNullOrWhiteSpace(raw))
        {
            respBody = new Struct();
        }
        else if (raw.TrimStart().StartsWith('['))
        {
            // Arrays can't be parsed as Struct — wrap them
            try { respBody = JsonParser.Default.Parse<Struct>($"{{\"items\":{raw}}}"); }
            catch { respBody = new Struct { Fields = { ["raw"] = Value.ForString(raw) } }; }
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

        // Forward Set-Cookie so the gateway can relay them to the browser
        if (resp.Headers.TryGetValues("Set-Cookie", out var cookies))
        {
            var list = new ListValue();
            foreach (var c in cookies) list.Values.Add(Value.ForString(c));
            result.Fields["set_cookie"] = Value.ForList(list.Values.ToArray());
        }

        return result;
    }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

public class AuthGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : AuthService.AuthServiceBase
{
    private readonly GrpcForwarder _fwd = new(f, cfg);

    public override Task<Struct> Login(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("POST", "/api/auth/login", req, ctx);

    public override Task<Struct> Signup(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("POST", "/api/auth/signup", req, ctx);

    public override Task<Struct> Refresh(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("POST", "/api/auth/refresh", req, ctx);

    public override Task<Struct> Logout(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("POST", "/api/auth/logout", req, ctx);

    public override Task<Struct> BootstrapSession(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("POST", "/api/auth/bootstrap-session", req, ctx);
}

// ─── User ─────────────────────────────────────────────────────────────────────

public class UserGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : UserService.UserServiceBase
{
    private readonly GrpcForwarder _fwd = new(f, cfg);

    public override Task<Struct> GetMe(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("GET", "/api/users/me", req, ctx);

    public override Task<Struct> UpdateMe(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("PUT", "/api/users/me", req, ctx);

    public override Task<Struct> UpdateLocation(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("PATCH", "/api/users/me/location", req, ctx);
}

// ─── Product ──────────────────────────────────────────────────────────────────

public class ProductGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : ProductService.ProductServiceBase
{
    private readonly GrpcForwarder _fwd = new(f, cfg);

    public override Task<Struct> ListProducts(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("GET", "/api/products", req, ctx);

    public override Task<Struct> GetProduct(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("GET", $"/api/products/{GrpcForwarder.Param(req, "id")}", req, ctx);

    public override Task<Struct> CreateProduct(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("POST", "/api/products", req, ctx);

    public override Task<Struct> UpdateProduct(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("PUT", $"/api/products/{GrpcForwarder.Param(req, "id")}", req, ctx);

    public override Task<Struct> DeleteProduct(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("DELETE", $"/api/products/{GrpcForwarder.Param(req, "id")}", req, ctx);
}

// ─── Order ────────────────────────────────────────────────────────────────────

public class OrderGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : OrderService.OrderServiceBase
{
    private readonly GrpcForwarder _fwd = new(f, cfg);

    public override Task<Struct> ListOrders(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("GET", "/api/orders", req, ctx);

    public override Task<Struct> GetOrder(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("GET", $"/api/orders/{GrpcForwarder.Param(req, "id")}", req, ctx);

    public override Task<Struct> CreateOrder(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("POST", "/api/orders", req, ctx);
}

// ─── Cart ─────────────────────────────────────────────────────────────────────

public class CartGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : CartService.CartServiceBase
{
    private readonly GrpcForwarder _fwd = new(f, cfg);

    public override Task<Struct> GetCart(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("GET", "/api/cart", req, ctx);

    public override Task<Struct> AddItem(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("POST", "/api/cart/items", req, ctx);

    public override Task<Struct> RemoveItem(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("DELETE", $"/api/cart/items/{GrpcForwarder.Param(req, "productId")}", req, ctx);
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

public class WalletGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : WalletService.WalletServiceBase
{
    private readonly GrpcForwarder _fwd = new(f, cfg);

    public override Task<Struct> GetWallet(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("GET", "/api/wallet", req, ctx);

    public override Task<Struct> ListTransactions(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("GET", "/api/wallet/transactions", req, ctx);

    public override Task<Struct> Deposit(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("POST", "/api/wallet/deposit", req, ctx);

    public override Task<Struct> Withdraw(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("POST", "/api/wallet/withdraw", req, ctx);
}

// ─── Wishlist ─────────────────────────────────────────────────────────────────

public class WishlistGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : WishlistService.WishlistServiceBase
{
    private readonly GrpcForwarder _fwd = new(f, cfg);

    public override Task<Struct> GetWishlist(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("GET", "/api/wishlist", req, ctx);

    public override Task<Struct> AddItem(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("POST", "/api/wishlist", req, ctx);

    public override Task<Struct> RemoveItem(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("DELETE", $"/api/wishlist/{GrpcForwarder.Param(req, "productId")}", req, ctx);
}

// ─── Notification ─────────────────────────────────────────────────────────────

public class NotificationGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : NotificationService.NotificationServiceBase
{
    private readonly GrpcForwarder _fwd = new(f, cfg);

    public override Task<Struct> GetNotifications(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("GET", "/api/notifications", req, ctx);

    public override Task<Struct> MarkRead(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("PATCH", $"/api/notifications/{GrpcForwarder.Param(req, "id")}/read", req, ctx);
}

// ─── Listing ──────────────────────────────────────────────────────────────────

public class ListingGrpcService(IHttpClientFactory f, IConfiguration cfg)
    : ListingService.ListingServiceBase
{
    private readonly GrpcForwarder _fwd = new(f, cfg);

    public override Task<Struct> GetListings(Struct req, ServerCallContext ctx)
        => _fwd.ForwardAsync("GET", "/api/listings", req, ctx);
}
